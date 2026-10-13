<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import { AlertTriangle, CircleDot, Flag, Info, ListChecks, Target } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import GanttChart from '@/components/views/GanttChart.vue'
import { useFormat } from '@/composables/useFormat'
import { qk, useProjects } from '@/composables/useTasks'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { api } from '@/lib/api'
import type { Task } from '@/lib/types'
import { addDaysToIsoDate } from '@shared/time'
import { isOpen, isOverdue, taskDueDate, taskDueTime, type CalendarPayload } from '@/components/views/planningModel'

type ItemKind = 'deadline' | 'task' | 'checkpoint' | 'goal'
interface Item {
  key: string
  kind: ItemKind
  title: string
  date: string
  time: string | null
  projectId: string | null
  task: Task | null
  done: boolean
  overdue: boolean
  subtitle: string | null
  goalId: string | null
  taskId: string | null
}

const KIND_ICON: Record<ItemKind, Component> = { deadline: Flag, task: CircleDot, checkpoint: ListChecks, goal: Target }
const KIND_TONE: Record<ItemKind, string> = {
  deadline: 'bg-primary-soft text-primary-text',
  task: 'bg-surface-sunken text-muted',
  checkpoint: 'bg-success-soft text-success-text',
  goal: 'bg-info-soft text-info',
}

const { t, locale } = useI18n()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()
const f = useFormat()
const projectsQuery = useProjects()
const isWide = useMediaQuery('(min-width: 1024px)')

const view = ref<'timeline' | 'gantt'>('timeline')
const projectFilter = ref<string>('all')
const statusFilter = ref<string>('all')
const priorityFilter = ref<string>('all')
const kindFilter = ref<'all' | 'deadlines'>('all')
const showDone = ref(session.settings?.showCompletedCheckpoints ?? false)

const today = computed(() => f.today.value)
/** Loaded window: 30 days back through 120 days ahead. */
const span = computed(() => ({ from: addDaysToIsoDate(today.value, -30), to: addDaysToIsoDate(today.value, 120) }))

const { data, isPending, isError, refetch } = useQuery({
  queryKey: computed(() => qk.calendar(span.value.from, span.value.to)),
  queryFn: ({ signal }) => api.get<CalendarPayload>('/calendar', { from: span.value.from, to: span.value.to }, signal),
  placeholderData: keepPreviousData,
})

const projects = computed(() => projectsQuery.data.value ?? [])
const projectById = computed(() => new Map(projects.value.map((p) => [p.id, p])))

const projectOptions = computed(() => [{ value: 'all', label: t('timeline.filters.allProjects') }, ...projects.value.map((p) => ({ value: p.id, label: p.name }))])
const statusOptions = computed(() => [
  { value: 'all', label: t('timeline.filters.allStatuses') },
  { value: 'not_started', label: t('status.not_started') },
  { value: 'in_progress', label: t('status.in_progress') },
  { value: 'paused', label: t('status.paused') },
  { value: 'completed', label: t('status.completed') },
])
const priorityOptions = computed(() => [
  { value: 'all', label: t('timeline.filters.allPriorities') },
  { value: 'urgent', label: t('priority.urgent') },
  { value: 'high', label: t('priority.high') },
  { value: 'medium', label: t('priority.medium') },
  { value: 'low', label: t('priority.low') },
  { value: 'none', label: t('priority.none') },
])
const kindOptions = computed(() => [
  { value: 'all', label: t('timeline.filters.kindAll') },
  { value: 'deadlines', label: t('timeline.filters.kindDeadlines') },
])
const viewOptions = computed(() => [
  { value: 'timeline' as const, label: t('timeline.views.timeline') },
  { value: 'gantt' as const, label: t('timeline.views.gantt') },
])

/** Status and priority apply to tasks; checkpoints and goals are hidden when only deadlines are requested. */
const tasks = computed<Task[]>(() =>
  (data.value?.tasks ?? []).filter((task) => {
    if (projectFilter.value !== 'all' && task.projectId !== projectFilter.value) return false
    if (statusFilter.value !== 'all' && task.status !== statusFilter.value) return false
    if (priorityFilter.value !== 'all' && task.priority !== priorityFilter.value) return false
    if (kindFilter.value === 'deadlines' && task.kind !== 'deadline') return false
    return true
  }),
)
const checkpoints = computed(() => {
  if (kindFilter.value === 'deadlines') return []
  return (data.value?.checkpoints ?? []).filter((cp) => (projectFilter.value === 'all' || cp.projectId === projectFilter.value) && cp.status !== 'skipped' && (showDone.value || cp.status !== 'done'))
})
const goals = computed(() => {
  if (kindFilter.value === 'deadlines') return []
  return (data.value?.goals ?? []).filter((g) => (projectFilter.value === 'all' || g.projectId === projectFilter.value) && g.targetDate)
})

const items = computed<Item[]>(() => {
  const tz = f.tz.value
  const nowMs = Date.now()
  const out: Item[] = []
  for (const task of tasks.value) {
    const date = taskDueDate(task, tz)
    if (!date) continue
    out.push({
      key: `t:${task.id}`,
      kind: task.kind === 'deadline' ? 'deadline' : 'task',
      title: task.title,
      date,
      time: taskDueTime(task, tz),
      projectId: task.projectId,
      task,
      done: !isOpen(task),
      overdue: isOverdue(task, nowMs),
      subtitle: null,
      goalId: task.goalId,
      taskId: task.id,
    })
  }
  for (const cp of checkpoints.value) {
    if (!cp.targetDate) continue
    out.push({
      key: `c:${cp.id}`,
      kind: 'checkpoint',
      title: cp.title,
      date: cp.targetDate,
      time: null,
      projectId: cp.projectId ?? null,
      task: null,
      done: cp.status === 'done',
      overdue: cp.status !== 'done' && cp.targetDate < today.value,
      subtitle: cp.parentTitle ?? null,
      goalId: cp.goalId,
      taskId: cp.taskId,
    })
  }
  for (const g of goals.value) {
    out.push({
      key: `g:${g.id}`,
      kind: 'goal',
      title: g.title,
      date: g.targetDate!,
      time: null,
      projectId: g.projectId,
      task: null,
      done: g.status === 'completed',
      overdue: false,
      subtitle: null,
      goalId: g.id,
      taskId: null,
    })
  }
  return out
})

/** Day groups in ascending order. Today is always present so the "Today" marker can be shown. */
const days = computed(() => {
  const byDate = new Map<string, Item[]>()
  for (const it of items.value) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it])
  if (!byDate.has(today.value)) byDate.set(today.value, [])
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, items: list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title)) }))
})

const monthFormatter = computed(() => new Intl.DateTimeFormat(locale.value === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }))
const months = computed(() => {
  const out: { key: string; label: string; days: (typeof days.value)[number][] }[] = []
  for (const d of days.value) {
    const key = d.date.slice(0, 7)
    const last = out[out.length - 1]
    if (last && last.key === key) last.days.push(d)
    else out.push({ key, label: monthFormatter.value.format(Date.parse(`${d.date}T00:00:00Z`)), days: [d] })
  }
  return out
})

function open(it: Item) {
  if (it.taskId) ui.openTask(it.taskId)
  else if (it.goalId) router.push(`/goals/${it.goalId}`)
}

function statusLabel(it: Item): string | null {
  if (it.task) return t(`status.${it.task.status}`)
  if (it.kind === 'checkpoint') return it.done ? t('status.completed') : t('timeline.checkpointPending')
  return null
}

// Scroll the "Today" marker into view once the list has data.
const didScroll = ref(false)
function scrollToToday() {
  if (didScroll.value) return
  const el = document.getElementById('timeline-today')
  if (!el) return
  didScroll.value = true
  el.scrollIntoView({ block: 'center', behavior: 'auto' })
}
onMounted(() => nextTick(scrollToToday))
watch(isPending, (pending) => {
  if (!pending) nextTick(scrollToToday)
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('timeline.title') }}</h1>
        <p class="mt-0.5 text-[13px] text-muted">{{ t('timeline.subtitle') }}</p>
      </div>
      <Segmented v-model="view" :options="viewOptions" :label="t('timeline.viewLabel')" size="sm" />
    </header>

    <!-- Filters -->
    <div class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
      <Field v-slot="{ id }" :label="t('timeline.filters.project')">
        <Select :id="id" v-model="projectFilter" :options="projectOptions" size="sm" />
      </Field>
      <Field v-slot="{ id }" :label="t('timeline.filters.status')">
        <Select :id="id" v-model="statusFilter" :options="statusOptions" size="sm" />
      </Field>
      <Field v-slot="{ id }" :label="t('timeline.filters.priority')">
        <Select :id="id" v-model="priorityFilter" :options="priorityOptions" size="sm" />
      </Field>
      <Field v-slot="{ id }" :label="t('timeline.filters.kind')">
        <Select :id="id" v-model="kindFilter" :options="kindOptions" size="sm" />
      </Field>
      <div class="flex items-end">
        <div class="flex h-8 items-center gap-2.5 text-[13px] text-fg">
          <Switch id="show-done-checkpoints" v-model="showDone" :label="t('timeline.filters.showDone')" />
          <label for="show-done-checkpoints" class="cursor-pointer">{{ t('timeline.filters.showDone') }}</label>
        </div>
      </div>
    </div>

    <div v-if="isError && !data" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')"><Button @click="refetch()">{{ t('common.retry') }}</Button></EmptyState>
    </div>

    <div v-else-if="isPending && !data" class="mt-6">
      <Skeleton :rows="6" height="52px" />
    </div>

    <template v-else>
      <p v-if="view === 'gantt' && !isWide" class="mt-5 flex items-center gap-2 rounded-xl bg-surface-sunken px-3 py-2 text-xs text-muted">
        <Info class="size-3.5 shrink-0" aria-hidden="true" />{{ t('gantt.needWider') }}
      </p>

      <!-- Gantt (desktop) -->
      <div v-if="view === 'gantt' && isWide" class="mt-5">
        <GanttChart :tasks="tasks" :checkpoints="checkpoints" :projects="projects" :from="span.from" :to="span.to" :today="today" />
      </div>

      <!-- Timeline list -->
      <section v-else class="mt-6" :aria-label="t('timeline.listLabel')">
        <EmptyState v-if="!items.length" compact :icon="CircleDot" :title="t('timeline.empty')" :description="t('timeline.emptyHint')" />
        <div v-for="month in months" :key="month.key" class="stagger">
          <h2 class="sticky top-0 z-20 -mx-1 bg-bg/95 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">{{ month.label }}</h2>
          <div v-for="day in month.days" :key="day.date" class="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2 md:grid-cols-[80px_minmax(0,1fr)]">
            <div class="pt-0.5 text-right">
              <p class="tabular text-lg font-semibold leading-none" :class="day.date === today ? 'text-danger-text' : 'text-fg'">{{ Number(day.date.slice(8, 10)) }}</p>
              <p class="mt-1 text-[11px] text-subtle">{{ f.date(day.date, { weekday: true }) }}</p>
            </div>
            <div class="min-w-0 border-l border-border pl-4">
              <div v-if="day.date === today" id="timeline-today" class="mb-2 flex items-center gap-2 text-xs font-semibold text-danger-text">
                <span class="h-px flex-1 bg-danger" aria-hidden="true" />
                <span>{{ t('timeline.today') }}</span>
                <span class="h-px flex-1 bg-danger" aria-hidden="true" />
              </div>
              <ul v-if="day.items.length" class="flex flex-col gap-1.5">
                <li v-for="it in day.items" :key="it.key">
                  <button
                    type="button"
                    class="group flex w-full min-h-11 items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left shadow-xs transition hover:border-border-strong hover:shadow-sm"
                    :class="it.done ? 'opacity-70' : ''"
                    @click="open(it)"
                  >
                    <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg" :class="KIND_TONE[it.kind]">
                      <component :is="KIND_ICON[it.kind]" class="size-3.5" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-fg" :class="it.done ? 'line-through' : ''">{{ it.title }}</span>
                      <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span class="rounded bg-surface-sunken px-1.5 py-px">{{ t(`timeline.kind.${it.kind}`) }}</span>
                        <span v-if="it.subtitle" class="truncate">{{ it.subtitle }}</span>
                        <span v-if="it.projectId && projectById.get(it.projectId)" class="inline-flex items-center gap-1">
                          <span class="size-2 rounded-full" :class="!projectById.get(it.projectId)?.color && 'bg-border-strong'" :style="projectById.get(it.projectId)?.color ? { backgroundColor: projectById.get(it.projectId)?.color ?? undefined } : undefined" aria-hidden="true" />
                          {{ projectById.get(it.projectId)?.name }}
                        </span>
                        <span v-if="statusLabel(it)">{{ statusLabel(it) }}</span>
                        <span v-if="it.overdue" class="inline-flex items-center gap-0.5 font-medium text-danger-text"><AlertTriangle class="size-3" aria-hidden="true" />{{ t('timeline.overdue') }}</span>
                      </span>
                    </span>
                    <span class="shrink-0 pt-0.5">
                      <CountdownChip v-if="it.task" :due="it.task.due" :completed="it.done" />
                      <span v-else class="tabular text-xs text-muted">{{ f.date(it.date, { short: true }) }}</span>
                    </span>
                  </button>
                </li>
              </ul>
              <p v-else class="py-1 text-xs text-subtle">{{ t('timeline.noItemsDay') }}</p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
