<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { VueDraggable } from 'vue-draggable-plus'
import { AlertTriangle, Check, CheckCircle2, Info, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import AiBadge from '@/components/ai/AiBadge.vue'
import AiLanguagePicker from '@/components/ai/AiLanguagePicker.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PlanCheckpointCard from '@/components/capture/PlanCheckpointCard.vue'
import { api, ApiError } from '@/lib/api'
import type { DraftCheckpoint, Feasibility, GoalDetail, PlanCheck, PlanDraft, TaskDetail } from '@/lib/types'
import { invalidatePlanning, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useAiLanguage } from '@/composables/useAiLanguage'
import { confirm as askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { useRouter } from 'vue-router'

/** AI checkpoint plan: review the feasibility, edit, regenerate selected items, then approve. */
const props = defineProps<{ draftId: string }>()
const { t, te } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()

const planQ = useQuery({
  queryKey: computed(() => ['ai', 'checkpoints', props.draftId]),
  queryFn: ({ signal }) => api.get<PlanDraft>(`/ai/checkpoints/${props.draftId}`, undefined, signal),
  retry: false,
})

const status = computed(() => planQ.data.value?.status ?? 'pending')
const isPending = computed(() => status.value === 'pending')

// ------------------------------------------------------------- local list
const checkpoints = ref<DraftCheckpoint[]>([])
const feasibility = ref<Feasibility | null>(null)
let loadedFor: string | null = null
let silent = false

function copyList(list: DraftCheckpoint[]): DraftCheckpoint[] {
  return list.map((c) => ({ ...c, dependsOn: [...c.dependsOn] }))
}

watch(
  () => planQ.data.value,
  (p) => {
    if (!p || p.draftId === loadedFor) return
    loadedFor = p.draftId
    silent = true
    checkpoints.value = copyList(p.checkpoints)
    feasibility.value = p.feasibility
    silent = false
  },
  { immediate: true },
)

const parentQ = useQuery({
  queryKey: computed(() => ['plan-parent', planQ.data.value?.taskId ?? '', planQ.data.value?.goalId ?? '']),
  queryFn: async () => {
    const p = planQ.data.value
    if (p?.taskId) {
      const task = await api.get<TaskDetail>(`/tasks/${p.taskId}`)
      return { kind: 'task' as const, id: task.id, title: task.title }
    }
    if (p?.goalId) {
      const goal = await api.get<GoalDetail>(`/goals/${p.goalId}`)
      return { kind: 'goal' as const, id: goal.id, title: goal.title }
    }
    return null
  },
  enabled: computed(() => !!(planQ.data.value?.taskId || planQ.data.value?.goalId)),
  retry: false,
})

function parentRoute() {
  const p = planQ.data.value
  if (p?.taskId) return `/tasks/${p.taskId}`
  if (p?.goalId) return `/goals/${p.goalId}`
  return '/'
}

// ------------------------------------------------------------- feasibility
const feasible = computed(() => feasibility.value?.feasible ?? true)
const total = computed(() => feasibility.value?.totalEstimatedMinutes ?? 0)
const available = computed(() => feasibility.value?.availableMinutes ?? null)
const usage = computed(() => (available.value && available.value > 0 ? Math.min(1, total.value / available.value) : 0))
const flagged = computed(() => new Set([...(feasibility.value?.checks ?? []).flatMap((c) => c.refs), ...(feasibility.value?.conflicts ?? []).flatMap((c) => c.refs)]))

function checkLabel(c: PlanCheck) {
  const key = `plan.checks.${c.code}`
  return te(key) ? t(key, c.params ?? {}) : c.code
}
function refLabel(id: string) {
  const i = checkpoints.value.findIndex((c) => c.clientId === id)
  if (i < 0) return ''
  return `${i + 1}. ${checkpoints.value[i].title || t('plan.card.title')}`
}

// ------------------------------------------------------------- autosave
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null
let savedTimer: ReturnType<typeof setTimeout> | null = null
const hasBlankTitle = computed(() => checkpoints.value.some((c) => !c.title.trim()))

async function save() {
  if (!isPending.value) return
  if (hasBlankTitle.value) {
    saveState.value = 'idle'
    return
  }
  saveState.value = 'saving'
  try {
    const r = await api.put<PlanDraft>(`/ai/checkpoints/${props.draftId}`, { checkpoints: checkpoints.value })
    if (r?.feasibility) feasibility.value = r.feasibility
    saveState.value = 'saved'
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 2000)
  } catch (e) {
    saveState.value = 'error'
    toast.error(errMsg(e))
  }
}

function scheduleSave() {
  if (!isPending.value) return
  saveState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void save()
  }, 800)
}

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    await save()
  }
}

// Every change to the list (typing, reordering, adding, removing) schedules an autosave.
// Programmatic replacement from the server sets `silent` so it is not written back.
watch(
  checkpoints,
  () => {
    if (!silent) scheduleSave()
  },
  { deep: true, flush: 'sync' },
)

const saveText = computed(() => (saveState.value === 'saving' ? t('plan.save.saving') : saveState.value === 'saved' ? t('plan.save.saved') : saveState.value === 'error' ? t('plan.save.error') : ''))

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (savedTimer) clearTimeout(savedTimer)
})

// ------------------------------------------------------------- editing
function addCheckpoint() {
  let id = `u${Date.now()}`
  let n = 0
  while (checkpoints.value.some((c) => c.clientId === id)) id = `u${Date.now()}${++n}`
  checkpoints.value.push({ clientId: id, origin: 'user', edited: true, title: '', dependsOn: [], priority: 'none', fromSourceRequirement: false })
}

function removeAt(i: number) {
  const [removed] = checkpoints.value.splice(i, 1)
  if (!removed) return
  for (const c of checkpoints.value) {
    if (c.dependsOn.includes(removed.clientId)) c.dependsOn = c.dependsOn.filter((x) => x !== removed.clientId)
  }
  selectedIds.value = selectedIds.value.filter((x) => x !== removed.clientId)
}

function othersOf(id: string) {
  return checkpoints.value.filter((c) => c.clientId !== id).map((c) => ({ clientId: c.clientId, title: c.title }))
}

// ------------------------------------------------------------- regenerate
const selectedIds = ref<string[]>([])
const instructions = ref('')
const outputLanguage = useAiLanguage()
const regenBusy = ref(false)
const flashIds = ref<string[]>([])

function setSelected(id: string, on: boolean) {
  selectedIds.value = on ? [...selectedIds.value.filter((x) => x !== id), id] : selectedIds.value.filter((x) => x !== id)
}

function applyDraft(next: PlanDraft) {
  const before = new Map(checkpoints.value.map((c) => [c.clientId, JSON.stringify(c)]))
  const changed = next.checkpoints.filter((c) => before.get(c.clientId) !== JSON.stringify(c)).map((c) => c.clientId)
  silent = true
  checkpoints.value = copyList(next.checkpoints)
  silent = false
  if (next.feasibility) feasibility.value = next.feasibility
  flashIds.value = changed
  setTimeout(() => {
    flashIds.value = []
  }, 1000)
}

async function regenerate(overwriteEdited: boolean): Promise<void> {
  const ids = [...selectedIds.value]
  if (!ids.length || regenBusy.value) return
  regenBusy.value = true
  try {
    await flushSave()
    const r = await api.post<PlanDraft>(`/ai/checkpoints/${props.draftId}/regenerate`, {
      checkpointIds: ids,
      instructions: instructions.value.trim() || null,
      outputLanguage: outputLanguage.value,
      overwriteEdited,
    })
    applyDraft(r)
    selectedIds.value = []
    instructions.value = ''
    toast.success(t('plan.regenerate.done'))
  } catch (e) {
    if (e instanceof ApiError && e.code === 'EDITED_CHECKPOINTS' && !overwriteEdited) {
      const titles = checkpoints.value.filter((c) => ids.includes(c.clientId) && c.edited).map((c) => c.title.trim() || t('plan.card.title'))
      const ok = await askConfirm({
        title: t('plan.regenerate.overwriteTitle'),
        message: t('plan.regenerate.overwriteMessage', { titles: titles.join(', ') }),
        confirmLabel: t('plan.regenerate.overwriteConfirm'),
        danger: true,
      })
      if (ok) {
        regenBusy.value = false
        await regenerate(true)
      }
      return
    }
    toast.error(errMsg(e))
  } finally {
    regenBusy.value = false
  }
}

// ------------------------------------------------------------- footer actions
const approving = ref(false)
const discarding = ref(false)

async function approve() {
  if (!isPending.value || approving.value || !checkpoints.value.length) return
  if (hasBlankTitle.value) {
    toast.error(t('plan.footer.approveBlocked'))
    return
  }
  approving.value = true
  try {
    const r = await api.post<{ created?: number }>(`/ai/checkpoints/${props.draftId}/confirm`, { checkpoints: checkpoints.value })
    if (saveTimer) clearTimeout(saveTimer)
    invalidatePlanning(qc)
    toast.success(t('plan.footer.approved', { n: r?.created ?? checkpoints.value.length }))
    await router.push(parentRoute())
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    approving.value = false
  }
}

async function discard() {
  if (discarding.value) return
  const ok = await askConfirm({
    title: t('plan.footer.discardTitle'),
    message: t('plan.footer.discardMessage'),
    confirmLabel: t('plan.footer.discardConfirm'),
    danger: true,
  })
  if (!ok) return
  discarding.value = true
  try {
    await api.del(`/ai/checkpoints/${props.draftId}`)
    if (saveTimer) clearTimeout(saveTimer)
    toast.info(t('plan.footer.discarded'))
    await router.push(parentRoute())
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    discarding.value = false
  }
}

const parent = computed(() => parentQ.data.value ?? null)
const parentKind = computed(() => (parent.value?.kind === 'goal' ? t('plan.parentGoal') : t('plan.parentTask')))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8" :class="isPending ? 'max-md:pb-44' : ''">
    <div v-if="planQ.isPending.value" class="flex flex-col gap-4" aria-busy="true">
      <Skeleton :rows="3" />
      <Skeleton :rows="8" />
    </div>

    <EmptyState v-else-if="planQ.isError.value || !planQ.data.value" :icon="AlertTriangle" :title="t('plan.loadError')" :description="t('errors.tryAgainHint')">
      <Button variant="secondary" @click="planQ.refetch()">{{ t('common.retry') }}</Button>
    </EmptyState>

    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('plan.title') }}</h1>
            <AiBadge />
          </div>
          <p class="flex min-h-5 items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
            <Check v-if="saveState === 'saved'" class="size-3.5 text-success-text" aria-hidden="true" />
            {{ saveText }}
          </p>
        </div>
        <p v-if="parent" class="text-sm text-muted">
          {{ t('plan.parent', { title: parent.title }) }}
          <span class="mx-1 text-subtle" aria-hidden="true">·</span>
          <router-link :to="parentRoute()" class="font-medium text-primary-text underline-offset-2 hover:underline">{{ t('plan.parentLink', { kind: parentKind }) }}</router-link>
        </p>
      </header>

      <p v-if="!isPending" class="mt-4 rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm text-muted">{{ t('plan.readOnly') }}</p>

      <!-- Feasibility -->
      <section
        v-if="feasibility"
        aria-labelledby="plan-feasibility"
        class="mt-5 rounded-2xl border p-4 shadow-xs"
        :class="feasible ? 'border-success/30 bg-success-soft/40' : 'border-danger/35 bg-danger-soft/50'"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plan-feasibility" class="flex items-center gap-2 text-[15px] font-semibold" :class="feasible ? 'text-success-text' : 'text-danger-text'">
            <CheckCircle2 v-if="feasible" class="size-5" aria-hidden="true" />
            <AlertTriangle v-else class="size-5" aria-hidden="true" />
            {{ feasible ? t('plan.feasibility.feasible') : t('plan.feasibility.notFeasible') }}
          </h2>
          <p class="tabular text-[13px] text-muted">
            {{ t('plan.feasibility.planned') }} <strong class="font-semibold text-fg">{{ f.minutes(total) }}</strong>
            <span class="mx-1 text-subtle" aria-hidden="true">/</span>
            {{ t('plan.feasibility.available') }} <strong class="font-semibold text-fg">{{ available == null ? t('common.none') : f.minutes(available) }}</strong>
          </p>
        </div>
        <div v-if="available != null" class="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" :aria-valuemin="0" :aria-valuemax="available" :aria-valuenow="total" :aria-label="t('plan.feasibility.planned')">
          <div class="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]" :class="feasible ? 'bg-success' : 'bg-danger'" :style="{ width: `${usage * 100}%` }" />
        </div>
        <p v-else class="mt-2 text-xs text-subtle">{{ t('plan.feasibility.noAvailability') }}</p>

        <div v-if="feasibility.summary" class="mt-3">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-ai">{{ t('ai.summary') }}</p>
          <p class="mt-0.5 text-sm leading-relaxed text-fg">{{ feasibility.summary }}</p>
        </div>

        <div v-if="feasibility.conflicts.length" class="mt-3">
          <p class="text-xs font-semibold text-danger-text">{{ t('plan.feasibility.conflicts') }}</p>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="(c, i) in feasibility.conflicts" :key="i" class="flex items-start gap-1.5 text-[13px] text-fg">
              <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-danger-text" aria-hidden="true" />{{ c.description }}
            </li>
          </ul>
        </div>

        <div v-if="feasibility.checks.length" class="mt-3">
          <p class="text-xs font-semibold text-muted">{{ t('plan.feasibility.checks') }}</p>
          <ul class="mt-1 flex flex-col gap-1.5">
            <li v-for="(c, i) in feasibility.checks" :key="i" class="flex items-start gap-1.5 text-xs text-muted">
              <Info class="mt-px size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span>
                {{ checkLabel(c) }}
                <template v-for="r in c.refs" :key="r">
                  <span class="ml-1 rounded-md bg-surface-sunken px-1.5 py-px text-[11px] text-fg">{{ refLabel(r) }}</span>
                </template>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Regenerate toolbar -->
      <Transition name="fade">
        <div v-if="selectedIds.length && isPending" class="sticky top-2 z-10 mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-ai/30 bg-surface-raised p-3 shadow-md">
          <Field v-slot="{ id, describedby }" :label="t('plan.regenerate.instructions')" class="min-w-0 flex-1 basis-56">
            <Input :id="id" v-model="instructions" :placeholder="t('plan.regenerate.instructionsPlaceholder')" :aria-describedby="describedby" />
          </Field>
          <AiLanguagePicker v-model="outputLanguage" class="shrink-0" />
          <Button variant="ai" :loading="regenBusy" @click="regenerate(false)"><Sparkles aria-hidden="true" />{{ t('plan.regenerate.button', { n: selectedIds.length }) }}</Button>
          <Button variant="ghost" size="sm" @click="selectedIds = []">{{ t('plan.regenerate.clear') }}</Button>
        </div>
      </Transition>

      <!-- Checkpoints -->
      <section class="mt-6" :aria-label="t('plan.list.title')">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-[13px] font-semibold text-fg">{{ t('plan.list.title') }}</h2>
          <span v-if="selectedIds.length" class="text-xs text-muted">{{ t('plan.regenerate.selected', { n: selectedIds.length }) }}</span>
        </div>

        <fieldset :disabled="!isPending" class="contents">
          <VueDraggable v-model="checkpoints" handle=".drag-handle" item-key="clientId" :animation="180" class="flex flex-col gap-3">
            <PlanCheckpointCard
              v-for="(cp, i) in checkpoints"
              :key="cp.clientId"
              :cp="cp"
              :index="i"
              :others="othersOf(cp.clientId)"
              :selected="selectedIds.includes(cp.clientId)"
              :flash="flashIds.includes(cp.clientId)"
              :conflict="flagged.has(cp.clientId)"
              @select="(on) => setSelected(cp.clientId, on)"
              @remove="removeAt(i)"
            />
          </VueDraggable>
        </fieldset>

        <p v-if="!checkpoints.length" class="py-6 text-center text-sm text-subtle">{{ t('plan.list.empty') }}</p>
        <Button v-if="isPending" variant="ghost" size="sm" class="mt-3" @click="addCheckpoint"><Plus aria-hidden="true" />{{ t('plan.list.add') }}</Button>
      </section>

      <!-- Footer -->
      <footer
        v-if="isPending"
        class="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface-raised/95 px-4 py-3 backdrop-blur md:sticky md:inset-x-auto md:bottom-0 md:z-10 md:-mx-8 md:mt-8 md:px-8"
      >
        <div class="mx-auto flex max-w-4xl flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
          <p class="min-w-0 truncate text-xs" :class="hasBlankTitle ? 'text-warning-text' : 'text-muted'">
            {{ hasBlankTitle ? t('plan.footer.approveBlocked') : t('plan.footer.ready') }}
          </p>
          <div class="grid grid-cols-2 gap-2 md:flex md:items-center">
            <Button class="w-full md:w-auto" variant="danger-ghost" :loading="discarding" @click="discard"><Trash2 aria-hidden="true" />{{ t('plan.footer.discard') }}</Button>
            <Button class="w-full md:w-auto" variant="primary" :loading="approving" :disabled="!checkpoints.length || hasBlankTitle" @click="approve">{{ t('plan.footer.approve', { n: checkpoints.length }) }}</Button>
          </div>
        </div>
      </footer>
    </template>
  </div>
</template>
