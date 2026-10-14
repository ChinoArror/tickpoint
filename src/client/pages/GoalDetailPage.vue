<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  RotateCcw,
} from 'lucide-vue-next'
import AiLanguagePicker from '@/components/ai/AiLanguagePicker.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import TaskRow from '@/components/domain/TaskRow.vue'
import CheckpointList from '@/components/checkpoint/CheckpointList.vue'
import GoalHealthCard from '@/components/goal/GoalHealthCard.vue'
import ProgressLogCard from '@/components/goal/ProgressLogCard.vue'
import ProgressHistoryCard from '@/components/goal/ProgressHistoryCard.vue'
import GoalFormDialog from '@/components/goal/GoalFormDialog.vue'
import { useGoalFormat } from '@/components/goal/goalFormat'
import { api } from '@/lib/api'
import { useGoalDetail, useErrorMessage, useProjects } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { useUiStore } from '@/stores/ui'
import { confirm } from '@/composables/useConfirm'
import { useNow } from '@/composables/useNow'
import { useAiLanguage } from '@/composables/useAiLanguage'
import type { GoalDetail } from '@/lib/types'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()
const ui = useUiStore()
const f = useFormat()
const gf = useGoalFormat()
const now = useNow()
const { data: goal, isPending, isError, refetch } = useGoalDetail(() => props.id)
const { data: projects } = useProjects()

const editOpen = ref(false)
const ringPulse = ref(false)

type AiAnalysis = {
  kind: string
  metrics: Record<string, unknown>
  analysis: { headline: string; narrative: string; suggestions: string[]; cautions: string[] }
  aiGenerated: true
}
const analysis = ref<AiAnalysis | null>(null)
const outputLanguage = useAiLanguage()

const statusTone: Record<GoalDetail['status'], 'primary' | 'warning' | 'success' | 'neutral'> = {
  active: 'primary',
  paused: 'warning',
  completed: 'success',
  archived: 'neutral',
}

const projectName = computed(() => (goal.value?.projectId ? projects.value?.find((p) => p.id === goal.value?.projectId)?.name : null))

function invalidate() {
  for (const key of ['goals', 'goal', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
}

const statusMutation = useMutation({
  mutationFn: (status: GoalDetail['status']) => api.patch<GoalDetail>(`/goals/${props.id}`, { status }),
  onSuccess: () => {
    invalidate()
    toast.success(t('goalPage.statusUpdated'))
  },
  onError: (e) => toast.error(errMsg(e)),
})

async function remove() {
  const g = goal.value
  if (!g) return
  const ok = await confirm({
    title: t('goalPage.delete.title', { title: g.title }),
    message: t('goalPage.delete.message'),
    danger: true,
    confirmLabel: t('common.delete'),
  })
  if (!ok) return
  try {
    await api.del(`/goals/${g.id}`)
    invalidate()
    toast.undoable(t('toast.deleted', { title: g.title }), t('common.undo'), async () => {
      await api.post(`/goals/${g.id}/restore`)
      invalidate()
      toast.success(t('toast.restored'))
    })
    router.push('/goals')
  } catch (e) {
    toast.error(errMsg(e))
  }
}

const menu = computed<MenuItem[]>(() => {
  const g = goal.value
  if (!g) return []
  const items: MenuItem[] = [{ label: t('common.edit'), icon: Pencil, onSelect: () => (editOpen.value = true) }]
  if (g.status === 'active') items.push({ label: t('goalPage.actions.pause'), icon: Pause, onSelect: () => statusMutation.mutate('paused') })
  if (g.status === 'paused') items.push({ label: t('goalPage.actions.resume'), icon: Play, onSelect: () => statusMutation.mutate('active') })
  if (g.status !== 'completed' && g.status !== 'archived')
    items.push({ label: t('goalPage.actions.complete'), icon: CheckCircle2, onSelect: () => statusMutation.mutate('completed') })
  if (g.status === 'completed') items.push({ label: t('goalPage.actions.reopen'), icon: RotateCcw, onSelect: () => statusMutation.mutate('active') })
  if (g.status === 'archived')
    items.push({ label: t('goalPage.actions.unarchive'), icon: ArchiveRestore, onSelect: () => statusMutation.mutate('active') })
  else items.push({ label: t('goalPage.actions.archive'), icon: Archive, onSelect: () => statusMutation.mutate('archived') })
  items.push({ separator: true }, { label: t('common.delete'), icon: Trash2, danger: true, onSelect: remove })
  return items
})

const planMutation = useMutation({
  mutationFn: () => api.post<{ draftId: string }>('/ai/checkpoints', { goalId: props.id, outputLanguage: outputLanguage.value }),
  onSuccess: (r) => router.push(`/plan/${r.draftId}`),
  onError: (e) => toast.error(errMsg(e)),
})

const analyzeMutation = useMutation({
  mutationFn: () => api.post<AiAnalysis>('/ai/analyze', { goalId: props.id, outputLanguage: outputLanguage.value }),
  onSuccess: (r) => (analysis.value = r),
  onError: (e) => toast.error(errMsg(e)),
})

const hoursOrDash = (m: number | null | undefined) => (m == null ? '—' : f.minutes(m))
const reviewLabel = computed(() => (goal.value ? gf.reviewLabel(goal.value.reviewFrequency) : ''))

function onLogged() {
  ringPulse.value = true
  setTimeout(() => (ringPulse.value = false), 700)
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
    <RouterLink to="/goals" class="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-fg">
      <ArrowLeft class="size-4" aria-hidden="true" />{{ t('goalPage.backToGoals') }}
    </RouterLink>

    <!-- Loading -->
    <div v-if="isPending" class="flex flex-col gap-5" aria-busy="true">
      <Skeleton :rows="2" height="28px" />
      <Skeleton :rows="1" height="180px" />
      <Skeleton :rows="3" height="48px" />
    </div>

    <EmptyState v-else-if="isError" :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')">
      <Button @click="refetch()">{{ t('common.retry') }}</Button>
    </EmptyState>

    <template v-else-if="goal">
      <!-- Header -->
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0 animate-fade-up">
          <div class="flex flex-wrap items-center gap-2">
            <Badge :tone="statusTone[goal.status]" dot>{{ t(`goalPage.status.${goal.status}`) }}</Badge>
            <RouterLink v-if="goal.projectId && projectName" :to="`/projects/${goal.projectId}`" class="text-xs text-muted hover:text-fg">
              {{ projectName }}
            </RouterLink>
          </div>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ goal.title }}</h1>
          <p v-if="goal.description" class="mt-1.5 whitespace-pre-line text-sm text-muted">{{ goal.description }}</p>
        </div>
        <Menu :items="menu">
          <button type="button" class="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted transition hover:bg-surface-hover hover:text-fg" :aria-label="t('common.moreActions')">
            <MoreHorizontal class="size-4" aria-hidden="true" />
          </button>
        </Menu>
      </header>

      <div class="mt-6 flex flex-col gap-5">
        <!-- Health + log -->
        <div class="grid gap-5 md:grid-cols-2">
          <GoalHealthCard :goal="goal" :class="ringPulse && 'animate-pop'" />
          <ProgressLogCard :goal="goal" @logged="onLogged" />
        </div>

        <!-- History chart and entries -->
        <ProgressHistoryCard :goal="goal" />

        <!-- AI analysis (separate from deterministic health numbers) -->
        <Card v-if="analysis" class="border-ai/30 bg-ai-soft/40" :title="t('goalPage.ai.analysisTitle')">
          <template #actions>
            <Badge tone="ai"><Sparkles aria-hidden="true" />{{ t('goalPage.ai.unconfirmed') }}</Badge>
          </template>
          <div class="space-y-3 text-sm">
            <p class="font-semibold text-fg">{{ analysis.analysis.headline }}</p>
            <p class="whitespace-pre-line text-muted">{{ analysis.analysis.narrative }}</p>
            <div v-if="analysis.analysis.suggestions.length">
              <h3 class="text-xs font-medium uppercase tracking-wide text-subtle">{{ t('goalPage.ai.suggestions') }}</h3>
              <ul class="mt-1 list-disc space-y-1 pl-5 text-fg">
                <li v-for="(s, i) in analysis.analysis.suggestions" :key="i">{{ s }}</li>
              </ul>
            </div>
            <div v-if="analysis.analysis.cautions.length">
              <h3 class="text-xs font-medium uppercase tracking-wide text-subtle">{{ t('goalPage.ai.cautions') }}</h3>
              <ul class="mt-1 list-disc space-y-1 pl-5 text-warning-text">
                <li v-for="(c, i) in analysis.analysis.cautions" :key="i">{{ c }}</li>
              </ul>
            </div>
            <p class="text-xs text-subtle">{{ t('goalPage.ai.notice') }}</p>
          </div>
        </Card>

        <!-- Checkpoints -->
        <Card :title="t('goalPage.checkpoints.title')">
          <template #actions>
            <Button variant="ai" size="sm" :loading="planMutation.isPending.value" @click="planMutation.mutate()">
              <Sparkles class="size-3.5" aria-hidden="true" />{{ t('goalPage.checkpoints.generate') }}
            </Button>
            <Button variant="secondary" size="sm" :loading="analyzeMutation.isPending.value" @click="analyzeMutation.mutate()">
              {{ t('goalPage.ai.analyze') }}
            </Button>
          </template>
          <AiLanguagePicker v-model="outputLanguage" class="mb-3" />
          <CheckpointList :checkpoints="goal.checkpoints" :parent="{ goalId: goal.id }" />
        </Card>

        <!-- Linked tasks -->
        <Card :title="t('goalPage.tasks.title')" :padded="false">
          <template #actions>
            <Button variant="soft" size="sm" @click="ui.openQuickAdd({ goalId: goal.id, projectId: goal.projectId })">
              <Plus class="size-3.5" aria-hidden="true" />{{ t('goalPage.tasks.add') }}
            </Button>
          </template>
          <div class="px-1.5 pb-2">
            <TransitionGroup v-if="goal.tasks.length" tag="div" name="list" class="relative" role="list">
              <TaskRow v-for="task in goal.tasks" :key="task.id" :task="task" :show-project="false" />
            </TransitionGroup>
            <EmptyState v-else compact :title="t('goalPage.tasks.empty')" :description="t('goalPage.tasks.emptyHint')" />
          </div>
        </Card>

        <div class="grid gap-5 md:grid-cols-2">
          <!-- Details -->
          <Card :title="t('goalPage.details.title')">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div class="col-span-2">
                <dt class="text-xs text-muted">{{ t('goalPage.details.successCriteria') }}</dt>
                <dd class="mt-0.5 whitespace-pre-line text-fg">{{ goal.successCriteria || t('common.none') }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">{{ t('goalPage.details.weeklyEffort') }}</dt>
                <dd class="tabular mt-0.5 text-fg">{{ goal.weeklyEffortMinutes ? hoursOrDash(goal.weeklyEffortMinutes) : t('common.none') }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">{{ t('goalPage.details.reviewFrequency') }}</dt>
                <dd class="mt-0.5 text-fg">{{ reviewLabel }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">{{ t('goalPage.details.estimated') }}</dt>
                <dd class="tabular mt-0.5 text-fg">{{ hoursOrDash(goal.estimatedMinutes) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">{{ t('goalPage.details.actual') }}</dt>
                <dd class="tabular mt-0.5 text-fg">{{ hoursOrDash(goal.actualMinutes) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">{{ t('goalPage.details.targetDate') }}</dt>
                <dd class="mt-0.5 text-fg">{{ goal.targetDate ? f.date(goal.targetDate) : t('goalPage.noTargetDate') }}</dd>
              </div>
            </dl>
          </Card>

          <!-- Activity -->
          <Card :title="t('goalPage.activity.title')">
            <ol v-if="goal.history.length" class="space-y-3">
              <li v-for="h in goal.history.slice(0, 20)" :key="h.id" class="flex items-start gap-3 text-sm">
                <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="text-fg">{{ t(`history.action.${h.action}`, h.action) }}</p>
                  <p class="text-xs text-subtle">{{ f.relativeTime(h.createdAt, now) }}</p>
                </div>
              </li>
            </ol>
            <p v-else class="text-sm text-subtle">{{ t('goalPage.activity.empty') }}</p>
          </Card>
        </div>
      </div>

      <GoalFormDialog v-model:open="editOpen" :goal="goal" />
    </template>
  </div>
</template>
