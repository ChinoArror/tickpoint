<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import { AlarmClock, AlertTriangle, Archive, CalendarDays, CheckCircle2, Columns3, CornerDownRight, Copy, ExternalLink, Inbox, LayoutList, ListChecks, MoreHorizontal, Pause, Play, Plus, Sun, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TaskRow from '@/components/domain/TaskRow.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import PriorityFlag from '@/components/domain/PriorityFlag.vue'
import { api } from '@/lib/api'
import type { Paged, Task } from '@/lib/types'
import { useProjects, useTaskActions, useTaskList, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import { useToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import { useUiStore } from '@/stores/ui'
import { BOARD_STATUSES, PRIORITIES } from '@shared/constants'
import { taskDueDate } from '@/components/views/planningModel'

/**
 * Task list for Inbox, Today, Upcoming, Deadlines, Completed and Archived.
 * List mode groups rows by date where it helps; board mode is a Kanban by status.
 * Both render the same filtered set. The list mode choice is remembered per view.
 */
type View = 'inbox' | 'today' | 'upcoming' | 'deadlines' | 'completed' | 'archived'
type BoardStatus = (typeof BOARD_STATUSES)[number]
interface Group {
  id: string
  label: string | null
  items: Task[]
}

const props = defineProps<{ view: View }>()
const { t } = useI18n()
const f = useFormat()
const now = useNow()
const ui = useUiStore()
const toast = useToast()
const errMsg = useErrorMessage()
const actions = useTaskActions()
const { data: projects } = useProjects()

// ---- View mode ----------------------------------------------------------------
const modeKey = (v: View) => `tp.view.${v}`
function readMode(v: View): 'list' | 'board' {
  try {
    return localStorage.getItem(modeKey(v)) === 'board' ? 'board' : 'list'
  } catch {
    return 'list'
  }
}
const mode = ref<'list' | 'board'>(readMode(props.view))
watch(mode, (m) => {
  try {
    localStorage.setItem(modeKey(props.view), m)
  } catch {
    /* storage unavailable */
  }
})
watch(
  () => props.view,
  (v) => {
    mode.value = readMode(v)
  },
)
const modeOptions = computed(() => [
  { value: 'list' as const, label: t('taskList.mode.list'), icon: LayoutList },
  { value: 'board' as const, label: t('taskList.mode.board'), icon: Columns3 },
])

// ---- Filters -------------------------------------------------------------------
const priorityFilter = ref('all')
const projectFilter = ref('all')
const kindFilter = ref('all')
const priorityOptions = computed(() => [{ value: 'all', label: t('taskList.filters.allPriorities') }, ...PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))])
const projectOptions = computed(() => [{ value: 'all', label: t('taskList.filters.allProjects') }, ...(projects.value ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))])
const kindOptions = computed(() => [
  { value: 'all', label: t('taskList.filters.kindAll') },
  { value: 'task', label: t('taskList.filters.kindTask') },
  { value: 'deadline', label: t('taskList.filters.kindDeadline') },
])
const projectById = computed(() => new Map((projects.value ?? []).map((p) => [p.id, p])))

const params = computed(() => {
  const p: Record<string, string | number | undefined> = { view: props.view, limit: 50 }
  // Date views include subtasks; other views show top-level items and nest subtasks inside them.
  if (!['today', 'upcoming', 'deadlines'].includes(props.view)) p.parentId = 'root'
  if (priorityFilter.value !== 'all') p.priority = priorityFilter.value
  if (projectFilter.value !== 'all') p.projectId = projectFilter.value
  if (kindFilter.value !== 'all') p.kind = kindFilter.value
  return p
})

// ---- Data and pagination ----------------------------------------------------------
const { data: firstPage, isPending, isError, refetch } = useTaskList(params)
const appended = ref<Task[]>([])
const lastCursor = ref<string | null>(null)
const pagedBeyondFirst = ref(false)
const loadingMore = ref(false)
watch(params, () => {
  appended.value = []
  lastCursor.value = null
  pagedBeyondFirst.value = false
})

const items = computed<Task[]>(() => {
  const seen = new Set<string>()
  const out: Task[] = []
  for (const x of [...(firstPage.value?.items ?? []), ...appended.value]) {
    if (!seen.has(x.id)) {
      seen.add(x.id)
      out.push(x)
    }
  }
  return out
})
const hasMore = computed(() => (pagedBeyondFirst.value ? !!lastCursor.value : !!firstPage.value?.nextCursor))

async function loadMore() {
  const cursor = pagedBeyondFirst.value ? lastCursor.value : firstPage.value?.nextCursor
  if (!cursor) return
  loadingMore.value = true
  try {
    const r = await api.get<Paged<Task>>('/tasks', { ...params.value, cursor })
    appended.value = [...appended.value, ...r.items]
    pagedBeyondFirst.value = true
    lastCursor.value = r.nextCursor
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    loadingMore.value = false
  }
}

// ---- List grouping ----------------------------------------------------------------
const groups = computed<Group[]>(() => {
  const list = items.value
  if (props.view === 'today') {
    const overdue = list.filter((x) => x.status !== 'completed' && x.due.sortAt != null && x.due.sortAt < now.value)
    const rest = list.filter((x) => !overdue.includes(x))
    const out: Group[] = []
    if (overdue.length) out.push({ id: 'overdue', label: t('taskList.sections.overdue'), items: overdue })
    if (rest.length || !overdue.length) out.push({ id: 'today', label: t('time.today'), items: rest })
    return out
  }
  if (props.view === 'upcoming' || props.view === 'deadlines') {
    const byDay = new Map<string, Task[]>()
    for (const x of list) {
      // Date-only deadlines group under their own date (sortAt is the end-of-day boundary).
      const key = taskDueDate(x, f.tz.value) ?? (x.scheduledDate || 'none')
      const bucket = byDay.get(key)
      if (bucket) bucket.push(x)
      else byDay.set(key, [x])
    }
    return [...byDay].map(([key, bucket]) => ({ id: key, label: key === 'none' ? t('due.unknown') : f.relativeDay(key), items: bucket }))
  }
  return list.length ? [{ id: 'all', label: null, items: list }] : []
})

// ---- Empty states ------------------------------------------------------------------
const EMPTY_ICON: Record<View, Component> = { inbox: Inbox, today: Sun, upcoming: CalendarDays, deadlines: AlarmClock, completed: CheckCircle2, archived: Archive }
const emptyAction = computed(() => {
  switch (props.view) {
    case 'inbox':
      return { label: t('taskList.empty.inbox.action'), run: () => ui.openQuickAdd({ kind: 'task' }) }
    case 'today':
      return { label: t('taskList.empty.today.action'), run: () => ui.openQuickAdd({ kind: 'task', scheduledDate: f.today.value }) }
    case 'upcoming':
      return { label: t('taskList.empty.upcoming.action'), run: () => ui.openQuickAdd({ kind: 'task' }) }
    case 'deadlines':
      return { label: t('taskList.empty.deadlines.action'), run: () => ui.openQuickAdd({ kind: 'deadline' }) }
    default:
      return null
  }
})

// ---- Inline add (inbox and today) ----------------------------------------------------
const inlineTitle = ref('')
const inlineBusy = ref(false)
const canInlineAdd = computed(() => props.view === 'inbox' || props.view === 'today')
async function submitInline() {
  const title = inlineTitle.value.trim()
  if (!title) return
  inlineBusy.value = true
  try {
    await actions.create({ title: title.slice(0, 300), kind: 'task', scheduledDate: props.view === 'today' ? f.today.value : null })
    inlineTitle.value = ''
    toast.success(t('taskList.toast.added'))
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    inlineBusy.value = false
  }
}

// ---- Row and card actions -------------------------------------------------------------
async function runTransition(task: Task, action: 'pause' | 'resume' | 'archive' | 'unarchive', message: string) {
  try {
    await actions.transition(task.id, action)
    toast.success(message)
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function removeTask(task: Task) {
  const ok = await confirm({
    title: t('taskList.confirmDelete.title', { title: task.title }),
    message: t('taskList.confirmDelete.message'),
    danger: true,
    confirmLabel: t('taskList.confirmDelete.confirm'),
  })
  if (!ok) return
  try {
    await actions.remove(task)
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function duplicate(task: Task) {
  try {
    await actions.duplicate(task.id)
  } catch (e) {
    toast.error(errMsg(e))
  }
}

function rowMenu(task: Task): MenuItem[] {
  const items: MenuItem[] = [
    { label: t('taskList.menu.open'), icon: ExternalLink, onSelect: () => ui.openTask(task.id) },
    { label: t('taskList.menu.duplicate'), icon: Copy, onSelect: () => void duplicate(task) },
  ]
  if (task.status === 'paused') items.push({ label: t('taskList.menu.resume'), icon: Play, onSelect: () => void runTransition(task, 'resume', t('taskList.toast.resumed')) })
  else if (task.status !== 'completed' && task.status !== 'archived') items.push({ label: t('taskList.menu.pause'), icon: Pause, onSelect: () => void runTransition(task, 'pause', t('taskList.toast.paused')) })
  if (task.status === 'archived') items.push({ label: t('taskList.menu.unarchive'), icon: Archive, onSelect: () => void runTransition(task, 'unarchive', t('taskList.toast.unarchived')) })
  else items.push({ label: t('taskList.menu.archive'), icon: Archive, onSelect: () => void runTransition(task, 'archive', t('taskList.toast.archived')) })
  if (mode.value === 'board') {
    items.push({ separator: true }, { heading: t('taskList.menu.moveTo') })
    for (const s of BOARD_STATUSES) if (s !== task.status) items.push({ label: t(`status.${s}`), onSelect: () => void moveTo(task, s) })
  }
  items.push({ separator: true }, { label: t('taskList.menu.delete'), icon: Trash2, danger: true, onSelect: () => void removeTask(task) })
  return items
}

// ---- Board -------------------------------------------------------------------------------
const columns = reactive<Record<BoardStatus, Task[]>>({ not_started: [], in_progress: [], paused: [], completed: [] })
function rebuildColumns() {
  for (const s of BOARD_STATUSES) columns[s] = items.value.filter((x) => x.status === s)
}
watch(items, rebuildColumns, { immediate: true })

async function moveTo(task: Task, to: BoardStatus) {
  if (task.status === to) return
  const rollback = actions.patchCaches(task.id, { status: to, completedAt: to === 'completed' ? Date.now() : null })
  try {
    if (to === 'completed') await actions.transition(task.id, 'complete')
    else if (task.status === 'completed') {
      await actions.transition(task.id, 'reopen')
      if (to !== 'in_progress') await actions.update(task.id, { status: to })
    } else if (to === 'paused') await actions.transition(task.id, 'pause')
    else if (task.status === 'paused' && to === 'in_progress') await actions.transition(task.id, 'resume')
    else await actions.update(task.id, { status: to })
    toast.success(t('taskList.toast.moved', { status: t(`status.${to}`) }))
  } catch (e) {
    rollback()
    rebuildColumns()
    toast.error(errMsg(e))
  }
}

async function onBoardAdd(e: { item: HTMLElement }, to: BoardStatus) {
  const id = e.item.dataset.id
  const task = items.value.find((x) => x.id === id)
  if (!task) return rebuildColumns()
  await moveTo(task, to)
}

function projectOf(task: Task) {
  return task.projectId ? projectById.value.get(task.projectId) : undefined
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t(`nav.${view}`) }}</h1>
        <p v-if="!isPending && !isError" class="mt-1 text-[13px] text-muted">
          <span class="tabular">{{ t('taskList.count', { n: f.number(items.length, 0) }) }}</span><span v-if="hasMore">+</span>
        </p>
      </div>
      <Segmented v-model="mode" :options="modeOptions" :label="t('taskList.mode.label')" size="sm" />
    </header>

    <!-- Filters -->
    <div class="mt-5 flex flex-wrap items-center gap-2">
      <Select v-model="priorityFilter" size="sm" class="w-auto min-w-36" :options="priorityOptions" :aria-label="t('taskList.filters.priority')" />
      <Select v-model="projectFilter" size="sm" class="w-auto min-w-40" :options="projectOptions" :aria-label="t('taskList.filters.project')" />
      <Select v-if="view !== 'deadlines'" v-model="kindFilter" size="sm" class="w-auto min-w-36" :options="kindOptions" :aria-label="t('taskList.filters.kind')" />
    </div>

    <!-- Body -->
    <div class="mt-5">
      <Skeleton v-if="isPending" :rows="6" height="52px" />

      <EmptyState v-else-if="isError" :icon="AlertTriangle" :title="t('taskList.errorTitle')" :description="t('errors.tryAgainHint')">
        <Button @click="refetch()">{{ t('common.retry') }}</Button>
      </EmptyState>

      <template v-else-if="mode === 'list'">
        <EmptyState v-if="!items.length" :icon="EMPTY_ICON[view]" :title="t(`taskList.empty.${view}.title`)" :description="t(`taskList.empty.${view}.description`)">
          <Button v-if="emptyAction" variant="primary" size="sm" @click="emptyAction.run()">{{ emptyAction.label }}</Button>
        </EmptyState>

        <div v-else class="flex flex-col gap-6">
          <section v-for="g in groups" :key="g.id" :aria-label="g.label ?? t(`nav.${view}`)">
            <h2 v-if="g.label" class="sticky top-0 z-[1] -mx-1 mb-1 flex items-center gap-2 bg-bg/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
              {{ g.label }}
              <span class="tabular rounded-full bg-surface-sunken px-1.5 text-[11px] font-medium normal-case tracking-normal">{{ g.items.length }}</span>
            </h2>
            <TransitionGroup name="list" tag="div" class="relative flex flex-col gap-0.5" role="list">
              <TaskRow v-for="task in g.items" :key="task.id" :task="task" :menu="rowMenu(task)" />
            </TransitionGroup>
          </section>
        </div>

        <form v-if="canInlineAdd" class="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-border px-3 transition focus-within:border-primary focus-within:bg-surface" @submit.prevent="submitInline">
          <Plus class="size-4 shrink-0 text-subtle" aria-hidden="true" />
          <input
            v-model="inlineTitle"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
            :aria-label="t('taskList.add.label')"
            :placeholder="t('taskList.add.placeholder')"
            maxlength="300"
            autocomplete="off"
          />
          <Button v-if="inlineTitle.trim()" type="submit" variant="soft" size="xs" :loading="inlineBusy">{{ t('taskList.add.submit') }}</Button>
        </form>

        <div v-if="hasMore" class="mt-5 flex justify-center">
          <Button variant="secondary" size="sm" :loading="loadingMore" @click="loadMore">{{ loadingMore ? t('taskList.loadingMore') : t('taskList.loadMore') }}</Button>
        </div>
      </template>

      <!-- Board -->
      <template v-else>
        <EmptyState v-if="!items.length" :icon="EMPTY_ICON[view]" :title="t(`taskList.empty.${view}.title`)" :description="t(`taskList.empty.${view}.description`)">
          <Button v-if="emptyAction" variant="primary" size="sm" @click="emptyAction.run()">{{ emptyAction.label }}</Button>
        </EmptyState>

        <div v-else class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          <section
            v-for="s in BOARD_STATUSES"
            :key="s"
            class="flex w-[17.5rem] shrink-0 snap-start flex-col rounded-2xl bg-bg-subtle p-2 md:w-auto md:min-w-0 md:flex-1"
            :aria-label="t(`status.${s}`)"
          >
            <header class="flex items-center justify-between px-2 py-1.5">
              <h2 class="text-[13px] font-semibold text-fg">{{ t(`status.${s}`) }}</h2>
              <span class="tabular rounded-full bg-surface px-1.5 text-[11px] font-medium text-muted">{{ columns[s].length }}</span>
            </header>
            <VueDraggable
              v-model="columns[s]"
              group="board"
              :animation="200"
              ghost-class="opacity-40"
              class="flex flex-1 flex-col gap-2 rounded-xl p-0.5"
              @add="(e) => onBoardAdd(e, s)"
            >
              <article
                v-for="task in columns[s]"
                :key="task.id"
                :data-id="task.id"
                class="group cursor-grab rounded-xl border border-border bg-surface p-3 shadow-xs transition hover:border-border-strong hover:shadow-md active:cursor-grabbing"
              >
                <div class="flex items-start gap-2">
                  <button type="button" class="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]" @click="ui.openTask(task.id)">
                    <p class="line-clamp-2 text-sm font-medium text-fg" :class="task.status === 'completed' && 'text-muted line-through decoration-subtle'">{{ task.title }}</p>
                  </button>
                  <Menu :items="rowMenu(task)">
                    <IconButton :label="t('common.moreActions')" size="sm" class="-mr-1 -mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100">
                      <MoreHorizontal aria-hidden="true" />
                    </IconButton>
                  </Menu>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted">
                  <CountdownChip v-if="task.due.precision !== 'unknown'" :due="task.due" :completed="task.status === 'completed'" />
                  <PriorityFlag v-if="task.priority !== 'none'" :priority="task.priority" />
                  <span v-if="task.counts.checkpoints" class="tabular inline-flex items-center gap-1" :title="t('task.checkpointsProgress')">
                    <ListChecks class="size-3.5" aria-hidden="true" />{{ task.counts.checkpointsDone }}/{{ task.counts.checkpoints }}
                  </span>
                  <span v-if="task.counts.subtasks" class="tabular inline-flex items-center gap-1" :title="t('task.subtasksProgress')">
                    <CornerDownRight class="size-3.5" aria-hidden="true" />{{ task.counts.subtasksDone }}/{{ task.counts.subtasks }}
                  </span>
                  <span v-if="projectOf(task)" class="inline-flex min-w-0 items-center gap-1.5">
                    <span class="size-2 shrink-0 rounded-full" :style="{ background: projectOf(task)?.color ?? 'var(--primary)' }" aria-hidden="true" />
                    <span class="truncate">{{ projectOf(task)?.name }}</span>
                  </span>
                </div>
              </article>
            </VueDraggable>
            <p v-if="!columns[s].length" class="px-2 py-3 text-center text-xs text-subtle">{{ t('board.dropHere') }}</p>
          </section>
        </div>

        <div v-if="hasMore" class="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" :loading="loadingMore" @click="loadMore">{{ loadingMore ? t('taskList.loadingMore') : t('taskList.loadMore') }}</Button>
        </div>
      </template>
    </div>
  </div>
</template>
