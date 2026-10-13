<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, CircleDot, Flame, FolderKanban, ListChecks, MoreHorizontal, Pencil, Plus, Target, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Segmented from '@/components/ui/Segmented.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import TaskRow from '@/components/domain/TaskRow.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import RiskBadge from '@/components/domain/RiskBadge.vue'
import GoalCard from '@/components/goal/GoalCard.vue'
import GoalFormDialog from '@/components/goal/GoalFormDialog.vue'
import ProjectFormDialog from '@/components/project/ProjectFormDialog.vue'
import { useProjectActions } from '@/components/project/projectActions'
import { useProjects, useTaskList, useGoals } from '@/composables/useTasks'
import { useUiStore } from '@/stores/ui'
import type { Task } from '@/lib/types'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()
const actions = useProjectActions()

const { data: projects, isPending: projectPending, isError: projectError, refetch: refetchProjects } = useProjects()
const project = computed(() => projects.value?.find((p) => p.id === props.id))

const tab = ref<'tasks' | 'goals' | 'overview'>('tasks')
const tabOptions = computed(() => [
  { value: 'tasks' as const, label: t('projects.tabs.tasks') },
  { value: 'goals' as const, label: t('projects.tabs.goals') },
  { value: 'overview' as const, label: t('projects.tabs.overview') },
])

const { data: tasksPage, isPending: tasksPending } = useTaskList(() => ({ projectId: props.id, view: 'all', parentId: 'root', limit: 200 }))
const { data: goals, isPending: goalsPending } = useGoals(() => ({ projectId: props.id }))

const tasks = computed<Task[]>(() => tasksPage.value?.items ?? [])
const open = computed(() => tasks.value.filter((x) => x.status !== 'completed' && x.status !== 'archived'))
const completed = computed(() => tasks.value.filter((x) => x.status === 'completed'))
const overdue = computed(() => open.value.filter((x) => x.risk.level === 'overdue'))
const upcoming = computed(() =>
  open.value
    .filter((x) => x.due.precision !== 'unknown' && x.due.sortAt != null)
    .slice()
    .sort((a, b) => (a.due.sortAt ?? 0) - (b.due.sortAt ?? 0))
    .slice(0, 10),
)
const nextDeadline = computed(() => upcoming.value[0] ?? null)

const editOpen = ref(false)
const goalFormOpen = ref(false)

const menu = computed<MenuItem[]>(() => {
  const p = project.value
  if (!p) return []
  return [
    { label: t('common.edit'), icon: Pencil, onSelect: () => (editOpen.value = true) },
    p.status === 'archived'
      ? { label: t('projects.actions.unarchive'), icon: ArchiveRestore, onSelect: () => actions.setStatus.mutate({ id: p.id, status: 'active' }) }
      : { label: t('projects.actions.archive'), icon: Archive, onSelect: () => actions.setStatus.mutate({ id: p.id, status: 'archived' }) },
    { separator: true },
    {
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      onSelect: async () => {
        if (await actions.remove(p)) router.push('/projects')
      },
    },
  ]
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
    <RouterLink to="/projects" class="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-fg">
      <ArrowLeft class="size-4" aria-hidden="true" />{{ t('projects.backToProjects') }}
    </RouterLink>

    <div v-if="projectPending" class="flex flex-col gap-4" aria-busy="true">
      <Skeleton :rows="1" height="32px" />
      <Skeleton :rows="3" height="48px" />
    </div>

    <EmptyState v-else-if="projectError" :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')">
      <Button @click="refetchProjects()">{{ t('common.retry') }}</Button>
    </EmptyState>

    <EmptyState v-else-if="!project" :icon="FolderKanban" :title="t('errors.notFoundTitle')" :description="t('errors.NOT_FOUND')" />

    <template v-else>
      <header class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3 animate-fade-up">
          <span class="mt-2.5 size-4 shrink-0 rounded-full" :class="!project.color && 'bg-border-strong'" :style="project.color ? { backgroundColor: project.color } : undefined" aria-hidden="true" />
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ project.name }}</h1>
            <p v-if="project.description" class="mt-1 whitespace-pre-line text-sm text-muted">{{ project.description }}</p>
            <p v-if="project.status === 'archived'" class="mt-1 text-xs text-subtle">{{ t('projects.status.archived') }}</p>
          </div>
        </div>
        <Menu :items="menu">
          <button type="button" class="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted transition hover:bg-surface-hover hover:text-fg" :aria-label="t('common.moreActions')">
            <MoreHorizontal class="size-4" aria-hidden="true" />
          </button>
        </Menu>
      </header>

      <div class="mt-6">
        <Segmented v-model="tab" :options="tabOptions" :label="t('projects.tabsLabel')" />
      </div>

      <!-- Tasks -->
      <section v-if="tab === 'tasks'" class="mt-5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="text-sm text-muted tabular">{{ t('projects.counts', { open: open.length, done: completed.length }) }}</p>
          <Button variant="soft" size="sm" @click="ui.openQuickAdd({ projectId: props.id })"><Plus class="size-3.5" aria-hidden="true" />{{ t('projects.tasks.add') }}</Button>
        </div>
        <Card :padded="false">
          <div class="px-1.5 py-2">
            <Skeleton v-if="tasksPending" :rows="4" />
            <TransitionGroup v-else-if="tasks.length" tag="div" name="list" class="relative" role="list">
              <TaskRow v-for="task in tasks" :key="task.id" :task="task" :show-project="false" />
            </TransitionGroup>
            <EmptyState v-else compact :icon="ListChecks" :title="t('projects.tasks.empty')" :description="t('projects.tasks.emptyHint')" />
          </div>
        </Card>
      </section>

      <!-- Goals -->
      <section v-else-if="tab === 'goals'" class="mt-5">
        <div class="mb-3 flex justify-end">
          <Button variant="soft" size="sm" @click="goalFormOpen = true"><Plus class="size-3.5" aria-hidden="true" />{{ t('goals.new') }}</Button>
        </div>
        <div v-if="goalsPending" class="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <div v-for="i in 2" :key="i" class="skeleton h-40 rounded-2xl" />
        </div>
        <div v-else-if="goals?.length" class="stagger grid gap-4 sm:grid-cols-2">
          <div v-for="(g, i) in goals" :key="g.id" :style="{ '--i': i }" class="min-w-0">
            <GoalCard :goal="g" />
          </div>
        </div>
        <EmptyState v-else :icon="Target" :title="t('projects.goals.empty')" :description="t('projects.goals.emptyHint')">
          <Button class="mt-4" variant="secondary" size="sm" @click="goalFormOpen = true">{{ t('goals.new') }}</Button>
        </EmptyState>
      </section>

      <!-- Overview -->
      <section v-else class="mt-5 flex flex-col gap-5">
        <Skeleton v-if="tasksPending" :rows="3" />
        <template v-else>
          <div class="stagger grid grid-cols-2 gap-3 md:grid-cols-4">
            <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs" :style="{ '--i': 0 }">
              <span class="grid size-10 place-items-center rounded-xl bg-primary-softer text-primary-text"><ListChecks class="size-5" aria-hidden="true" /></span>
              <div class="min-w-0">
                <p class="tabular text-xl font-semibold leading-none text-fg">{{ open.length }}</p>
                <p class="mt-1 truncate text-xs text-muted">{{ t('projects.overview.open') }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs" :style="{ '--i': 1 }">
              <span class="grid size-10 place-items-center rounded-xl bg-success-soft text-success-text"><CircleDot class="size-5" aria-hidden="true" /></span>
              <div class="min-w-0">
                <p class="tabular text-xl font-semibold leading-none text-fg">{{ completed.length }}</p>
                <p class="mt-1 truncate text-xs text-muted">{{ t('projects.overview.completed') }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs" :style="{ '--i': 2 }">
              <span class="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger-text"><Flame class="size-5" aria-hidden="true" /></span>
              <div class="min-w-0">
                <p class="tabular text-xl font-semibold leading-none text-fg">{{ overdue.length }}</p>
                <p class="mt-1 truncate text-xs text-muted">{{ t('projects.overview.overdue') }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs" :style="{ '--i': 3 }">
              <div class="min-w-0">
                <p class="text-xs text-muted">{{ t('projects.overview.nextDeadline') }}</p>
                <div class="mt-1">
                  <CountdownChip v-if="nextDeadline" :due="nextDeadline.due" />
                  <span v-else class="text-sm text-subtle">{{ t('projects.noDeadline') }}</span>
                </div>
              </div>
            </div>
          </div>

          <Card :title="t('projects.overview.upcoming')" :padded="false">
            <div class="px-1.5 pb-2">
              <ol v-if="upcoming.length" role="list" class="relative">
                <li v-for="task in upcoming" :key="task.id" role="listitem">
                  <button type="button" class="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-hover" @click="ui.openTask(task.id)">
                    <span class="min-w-0 flex-1 truncate text-sm font-medium text-fg">{{ task.title }}</span>
                    <span class="flex items-center gap-2">
                      <RiskBadge v-if="task.risk.level !== 'on_track' && task.risk.level !== 'none'" :risk="task.risk" />
                      <CountdownChip :due="task.due" />
                    </span>
                  </button>
                </li>
              </ol>
              <EmptyState v-else compact :icon="CircleDot" :title="t('projects.overview.upcomingEmpty')" />
            </div>
          </Card>
        </template>
      </section>

      <ProjectFormDialog v-model:open="editOpen" :project="project" />
      <GoalFormDialog v-model:open="goalFormOpen" :prefill="{ projectId: props.id }" />
    </template>
  </div>
</template>
