<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import { CalendarDays, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import TaskCheck from '@/components/domain/TaskCheck.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useCheckpointActions, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { PRIORITIES } from '@shared/constants'
import type { Checkpoint } from '@/lib/types'

/**
 * Ordered checkpoints of a task or goal. Reordering touches only the visible rows;
 * hidden (completed) rows keep their slots. Changes invalidate queries; nothing is emitted.
 */
const props = defineProps<{ checkpoints: Checkpoint[]; parent: { taskId?: string; goalId?: string }; showCompleted?: boolean }>()

const { t } = useI18n()
const f = useFormat()
const switchId = useId()
const toast = useToast()
const errMsg = useErrorMessage()
const session = useSessionStore()
const cpActions = useCheckpointActions()

const showCompleted = ref(props.showCompleted ?? session.settings?.showCompletedCheckpoints ?? false)
watch(
  () => props.showCompleted,
  (v) => {
    if (v !== undefined) showCompleted.value = v
  },
)

const sorted = computed(() => [...props.checkpoints].sort((a, b) => a.sortOrder - b.sortOrder))
const visible = ref<Checkpoint[]>([])
watch(
  [sorted, showCompleted],
  () => {
    visible.value = sorted.value.filter((c) => showCompleted.value || c.status === 'pending')
  },
  { immediate: true },
)

const countable = computed(() => props.checkpoints.filter((c) => c.status !== 'skipped'))
const doneCount = computed(() => countable.value.filter((c) => c.status === 'done').length)
const pct = computed(() => (countable.value.length ? (doneCount.value / countable.value.length) * 100 : 0))
const titleById = computed(() => new Map(props.checkpoints.map((c) => [c.id, c.title])))
const priorityOptions = computed(() => PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })))

// ---- Reordering -----------------------------------------------------------
let dragStartIds: string[] = []
function onDragStart() {
  dragStartIds = visible.value.map((c) => c.id)
}
async function onDragEnd() {
  const newVisible = visible.value.map((c) => c.id)
  const all = sorted.value.map((c) => c.id)
  const slots = new Set(dragStartIds)
  const it = newVisible[Symbol.iterator]()
  // Keep hidden checkpoints where they are; fill visible slots with the new order.
  const ordered = all.map((id) => (slots.has(id) ? (it.next().value as string) : id))
  if (ordered.every((id, i) => id === all[i])) return
  try {
    await cpActions.reorder(ordered)
  } catch (e) {
    toast.error(errMsg(e))
  }
}

// ---- Completion -------------------------------------------------------------
const busyId = ref<string | null>(null)
async function toggle(cp: Checkpoint) {
  busyId.value = cp.id
  try {
    const r = await cpActions.toggle(cp)
    if (r.affected.length) toast.info(t('checkpoints.affected', { n: r.affected.length }))
  } catch {
    /* the composable already shows the error */
  } finally {
    busyId.value = null
  }
}

function isDelayed(cp: Checkpoint) {
  return cp.status === 'pending' && !!cp.targetDate && cp.targetDate < f.today.value
}

function afterText(cp: Checkpoint): string | null {
  const names = cp.dependsOnIds.map((id) => titleById.value.get(id)).filter((x): x is string => !!x)
  return names.length ? t('checkpointList.after', { title: names.join(', ') }) : null
}

// ---- Inline editor ----------------------------------------------------------
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')
const draft = reactive({
  title: '',
  description: '',
  completionCriteria: '',
  startDate: '',
  targetDate: '',
  estimatedMinutes: '',
  weight: '1',
  priority: 'none' as Checkpoint['priority'],
  dependsOnIds: [] as string[],
})

const siblings = computed(() => (editingId.value ? props.checkpoints.filter((c) => c.id !== editingId.value) : []))

function startEdit(cp: Checkpoint) {
  if (editingId.value === cp.id) return cancelEdit()
  editingId.value = cp.id
  formError.value = ''
  Object.assign(draft, {
    title: cp.title,
    description: cp.description ?? '',
    completionCriteria: cp.completionCriteria ?? '',
    startDate: cp.startDate ?? '',
    targetDate: cp.targetDate ?? '',
    estimatedMinutes: cp.estimatedMinutes == null ? '' : String(cp.estimatedMinutes),
    weight: String(cp.weight),
    priority: cp.priority,
    dependsOnIds: [...cp.dependsOnIds],
  })
}

function cancelEdit() {
  editingId.value = null
  formError.value = ''
}

async function saveEdit(cp: Checkpoint) {
  const title = draft.title.trim()
  if (!title) return void (formError.value = t('quickAdd.errors.REQUIRED'))
  if (draft.startDate && draft.targetDate && draft.startDate > draft.targetDate) return void (formError.value = t('checkpointList.invalidRange'))
  const patch: Record<string, unknown> = {
    title: title.slice(0, 300),
    description: draft.description.trim() || null,
    completionCriteria: draft.completionCriteria.trim() || null,
    startDate: draft.startDate || null,
    targetDate: draft.targetDate || null,
    estimatedMinutes: draft.estimatedMinutes === '' ? null : Math.max(0, Math.round(Number(draft.estimatedMinutes))),
    priority: draft.priority,
    dependsOnIds: draft.dependsOnIds,
  }
  if (props.parent.goalId) patch.weight = Number(draft.weight) > 0 ? Number(draft.weight) : 1
  saving.value = true
  try {
    await cpActions.update(cp.id, patch)
    cancelEdit()
  } catch (e) {
    formError.value = errMsg(e)
  } finally {
    saving.value = false
  }
}

async function remove(cp: Checkpoint) {
  try {
    await cpActions.remove(cp)
    if (editingId.value === cp.id) cancelEdit()
  } catch (e) {
    toast.error(errMsg(e))
  }
}

// ---- Add ------------------------------------------------------------------
const newTitle = ref('')
const adding = ref(false)
async function add() {
  const title = newTitle.value.trim()
  if (!title) return
  adding.value = true
  try {
    await cpActions.create({ ...props.parent, title: title.slice(0, 300) })
    newTitle.value = ''
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t('checkpointList.title')">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-[13px] font-semibold text-fg">{{ t('checkpointList.title') }}</h3>
          <p class="tabular text-xs text-muted">{{ t('checkpointList.progress', { done: doneCount, total: countable.length }) }}</p>
        </div>
        <ProgressBar class="mt-2" :value="pct" size="xs" :label="t('checkpointList.progress', { done: doneCount, total: countable.length })" />
      </div>
      <div class="flex items-center gap-2">
        <Switch :id="switchId" v-model="showCompleted" :label="t('checkpointList.showCompleted')" />
        <span class="text-xs text-muted">{{ t('checkpointList.showCompleted') }}</span>
      </div>
    </header>

    <p v-if="!visible.length" class="py-2 text-xs text-subtle">{{ t('checkpointList.empty') }}</p>

    <VueDraggable
      v-else
      v-model="visible"
      tag="ol"
      handle=".cp-handle"
      group="checkpoints"
      :animation="200"
      ghost-class="opacity-40"
      class="flex flex-col gap-1"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <li v-for="cp in visible" :key="cp.id" class="rounded-xl border transition-colors" :class="editingId === cp.id ? 'border-border bg-surface shadow-xs' : 'border-transparent hover:bg-surface-hover'">
        <div class="flex items-start gap-2 px-2 py-2">
          <button type="button" class="cp-handle mt-0.5 grid size-6 shrink-0 cursor-grab place-items-center rounded text-subtle transition hover:text-fg active:cursor-grabbing" :aria-label="t('checkpointList.dragHandle', { title: cp.title })">
            <GripVertical class="size-4" aria-hidden="true" />
          </button>
          <TaskCheck
            class="mt-1"
            size="sm"
            :checked="cp.status === 'done'"
            :disabled="busyId === cp.id"
            :label="t('checkpoints.toggle', { title: cp.title })"
            @toggle="toggle(cp)"
          />
          <button type="button" class="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]" :aria-expanded="editingId === cp.id" :aria-label="t('checkpointList.edit', { title: cp.title })" @click="startEdit(cp)">
            <p class="text-sm text-fg" :class="cp.status !== 'pending' && 'text-muted line-through decoration-subtle'">{{ cp.title }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
              <span v-if="cp.targetDate" class="inline-flex items-center gap-1 tabular">
                <CalendarDays class="size-3.5" aria-hidden="true" />{{ f.relativeDay(cp.targetDate) }}
              </span>
              <Badge v-if="isDelayed(cp)" tone="danger">{{ t('checkpoints.delayed') }}</Badge>
              <span v-if="cp.estimatedMinutes" class="tabular">{{ f.minutes(cp.estimatedMinutes) }}</span>
              <Badge v-if="cp.origin === 'ai'" tone="ai" :title="t('checkpointList.origin.hint')">
                <Sparkles aria-hidden="true" />{{ t('checkpointList.origin.ai') }}
              </Badge>
              <span v-if="afterText(cp)">{{ afterText(cp) }}</span>
            </p>
            <p v-if="cp.completionCriteria" class="mt-1 text-xs text-subtle">{{ cp.completionCriteria }}</p>
          </button>
        </div>

        <form v-if="editingId === cp.id" class="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3" novalidate @submit.prevent="saveEdit(cp)">
          <Field v-slot="{ id, invalid }" :label="t('checkpointList.fields.title')">
            <Input :id="id" v-model="draft.title" :invalid="invalid" maxlength="300" />
          </Field>
          <Field v-slot="{ id }" :label="t('checkpointList.fields.description')">
            <Textarea :id="id" v-model="draft.description" rows="2" />
          </Field>
          <Field v-slot="{ id }" :label="t('checkpointList.fields.completionCriteria')">
            <Textarea :id="id" v-model="draft.completionCriteria" rows="2" />
          </Field>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field v-slot="{ id }" :label="t('checkpointList.fields.startDate')">
              <Input :id="id" v-model="draft.startDate" type="date" />
            </Field>
            <Field v-slot="{ id }" :label="t('checkpointList.fields.targetDate')">
              <Input :id="id" v-model="draft.targetDate" type="date" />
            </Field>
            <Field v-slot="{ id }" :label="t('checkpointList.fields.estimatedMinutes')">
              <Input :id="id" v-model="draft.estimatedMinutes" type="number" min="0" />
            </Field>
            <Field v-slot="{ id }" :label="t('checkpointList.fields.priority')">
              <Select :id="id" v-model="draft.priority" :options="priorityOptions" />
            </Field>
            <Field v-if="parent.goalId" v-slot="{ id }" :label="t('checkpointList.fields.weight')" :hint="t('checkpointList.fields.weightHint')">
              <Input :id="id" v-model="draft.weight" type="number" min="0.1" step="0.5" />
            </Field>
          </div>
          <fieldset class="flex flex-col gap-1.5">
            <legend class="mb-1 text-[13px] font-medium text-fg">{{ t('checkpointList.fields.dependsOn') }}</legend>
            <div v-if="siblings.length" class="flex flex-col gap-1.5">
              <label v-for="s in siblings" :key="s.id" class="flex cursor-pointer items-center gap-2 text-[13px] text-fg">
                <input v-model="draft.dependsOnIds" type="checkbox" :value="s.id" class="size-4 accent-primary" />
                <span class="truncate">{{ s.title }}</span>
              </label>
            </div>
            <p v-else class="text-xs text-subtle">{{ t('checkpointList.noSiblings') }}</p>
          </fieldset>
          <p v-if="formError" class="text-xs text-danger-text" role="alert">{{ formError }}</p>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Button variant="danger-ghost" size="sm" @click="remove(cp)"><Trash2 aria-hidden="true" />{{ t('checkpointList.delete') }}</Button>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" @click="cancelEdit">{{ t('common.cancel') }}</Button>
              <Button type="submit" variant="primary" size="sm" :loading="saving">{{ t('common.save') }}</Button>
            </div>
          </div>
        </form>
      </li>
    </VueDraggable>

    <form class="flex items-center gap-2" @submit.prevent="add">
      <Input v-model="newTitle" size="sm" class="flex-1" :placeholder="t('checkpointList.addPlaceholder')" :aria-label="t('checkpointList.add')" maxlength="300" />
      <Button type="submit" variant="soft" size="sm" :loading="adding" :disabled="!newTitle.trim()">
        <Plus class="size-4" aria-hidden="true" />{{ t('checkpointList.add') }}
      </Button>
    </form>
  </section>
</template>
