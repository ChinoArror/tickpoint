<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import FullCalendar from '@fullcalendar/vue3'
import type { CalendarOptions, DateClickInfo, DatesSetInfo, EventClickInfo, EventDisplayInfo, EventDropInfo, EventInput } from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import timeGridPlugin from '@fullcalendar/vue3/timegrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import jaLocale from '@fullcalendar/vue3/locales/ja'
import classicThemePlugin from '@fullcalendar/vue3/themes/classic'
import '@fullcalendar/vue3/skeleton.css'
import '@fullcalendar/vue3/themes/classic/theme.css'
import '@fullcalendar/vue3/themes/classic/palette.css'
import { AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock, ListChecks, Target } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Segmented from '@/components/ui/Segmented.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { confirm } from '@/composables/useConfirm'
import { useCheckpointActions, useErrorMessage, useTaskActions, qk } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { api } from '@/lib/api'
import type { Task } from '@/lib/types'
import { addDaysToIsoDate, wallClockAt, zonedTimeToUtc } from '@shared/time'
import { isOpen, isOverdue, pad2, taskDueDate, taskDueTime, type CalendarPayload } from '@/components/views/planningModel'

type Mode = 'month' | 'week' | 'day'
type Kind = 'exact' | 'date' | 'approximate' | 'scheduled' | 'checkpoint' | 'goal'

/** Extended props carried by every FullCalendar event built here. */
interface EventExt {
  kind: Kind
  role: 'due' | 'scheduled' | 'checkpoint' | 'goal'
  taskId: string | null
  goalId: string | null
  refId: string
  title: string
  overdue: boolean
  done: boolean
}

const { t, locale } = useI18n()
const router = useRouter()
const ui = useUiStore()
const session = useSessionStore()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()
const taskActions = useTaskActions()
const cpActions = useCheckpointActions()

const isDesktop = useMediaQuery('(min-width: 768px)')
const mode = ref<Mode>('month')
const anchor = ref(f.today.value) // Mobile agenda cursor (first day of the 7-day window).
const fcRange = ref<{ from: string; to: string } | null>(null) // Visible range reported by FullCalendar.
const cal = ref<InstanceType<typeof FullCalendar> | null>(null)

const VIEW_BY_MODE: Record<Mode, string> = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay' }
const MODE_BY_VIEW: Record<string, Mode> = { dayGridMonth: 'month', timeGridWeek: 'week', timeGridDay: 'day' }

const activeRange = computed(() => {
  if (!isDesktop.value) return { from: anchor.value, to: addDaysToIsoDate(anchor.value, 6) }
  return fcRange.value
})

const { data, isPending, isError, isFetching, refetch } = useQuery({
  queryKey: computed(() => qk.calendar(activeRange.value?.from ?? '', activeRange.value?.to ?? '')),
  queryFn: ({ signal }) => {
    const r = activeRange.value!
    return api.get<CalendarPayload>('/calendar', { from: r.from, to: r.to }, signal)
  },
  enabled: computed(() => !!activeRange.value),
  placeholderData: keepPreviousData,
})

const tz = computed(() => f.tz.value)
const tasksById = computed(() => new Map((data.value?.tasks ?? []).map((task) => [task.id, task])))

/** Builds FullCalendar events. Wall-clock strings are fed with timeZone 'UTC' so they display as the user's local time. */
const events = computed<EventInput[]>(() => {
  const payload = data.value
  if (!payload) return []
  // Overdue is computed against the time this data arrived; the list rebuilds on each fetch.
  const zone = tz.value
  const nowMs = Date.now()
  const out: EventInput[] = []

  for (const task of payload.tasks) {
    const open = isOpen(task)
    const overdue = isOverdue(task, nowMs)
    const dueDate = taskDueDate(task, zone)
    if (dueDate) {
      const time = taskDueTime(task, zone)
      const kind: Kind = task.due.precision === 'exact' ? 'exact' : task.due.precision === 'approximate' ? 'approximate' : 'date'
      const ext: EventExt = { kind, role: 'due', taskId: task.id, goalId: null, refId: task.id, title: task.title, overdue, done: !open }
      out.push({
        id: `due:${task.id}`,
        title: task.title,
        ...(kind === 'exact' && time ? { start: `${dueDate}T${time}:00`, allDay: false } : { start: dueDate, allDay: true }),
        editable: true,
        classNames: dueClasses(kind, overdue, !open).join(' '),
        extendedProps: ext,
      })
    }
    if (task.scheduledDate && task.scheduledDate !== dueDate && open) {
      const ext: EventExt = { kind: 'scheduled', role: 'scheduled', taskId: task.id, goalId: null, refId: task.id, title: task.title, overdue: false, done: false }
      out.push({ id: `sched:${task.id}`, title: task.title, start: task.scheduledDate, allDay: true, editable: true, classNames: 'bg-surface-sunken text-muted border border-transparent', extendedProps: ext })
    }
  }

  for (const cp of payload.checkpoints) {
    if (!cp.targetDate || cp.status === 'skipped') continue
    const done = cp.status === 'done'
    const ext: EventExt = { kind: 'checkpoint', role: 'checkpoint', taskId: cp.taskId, goalId: cp.goalId, refId: cp.id, title: cp.title, overdue: false, done }
    out.push({
      id: `cp:${cp.id}`,
      title: cp.title,
      start: cp.targetDate,
      allDay: true,
      editable: true,
      classNames: `bg-surface-sunken text-muted border border-transparent text-xs ${done ? 'line-through opacity-70' : ''}`,
      extendedProps: ext,
    })
  }

  for (const g of payload.goals) {
    if (!g.targetDate) continue
    const ext: EventExt = { kind: 'goal', role: 'goal', taskId: null, goalId: g.id, refId: g.id, title: g.title, overdue: false, done: g.status === 'completed' }
    out.push({ id: `goal:${g.id}`, title: g.title, start: g.targetDate, allDay: true, editable: false, classNames: 'bg-success-soft text-success-text border border-success', extendedProps: ext })
  }

  return out
})

/** Exact deadlines are solid and strong; date-only is an outline; approximate is a dashed outline. Overdue switches to the danger tone. */
function dueClasses(kind: Kind, overdue: boolean, done: boolean): string[] {
  const out: string[] = []
  if (kind === 'exact') out.push(overdue ? 'bg-danger-soft text-danger-text border-l-[3px] border-l-danger' : 'bg-primary text-on-primary border-l-[3px] border-l-primary-text')
  else if (kind === 'approximate') out.push(overdue ? 'bg-danger-soft text-danger-text border border-dashed border-danger' : 'bg-surface text-fg border border-dashed border-primary')
  else out.push(overdue ? 'bg-danger-soft text-danger-text border border-solid border-danger' : 'bg-surface text-fg border border-solid border-primary')
  if (done) out.push('line-through opacity-60')
  return out
}

const SVG_PATHS: Record<Kind | 'alert', string> = {
  exact: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  date: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  approximate: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  scheduled: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  checkpoint: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  goal: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
}
function svgMarkup(key: Kind | 'alert'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG_PATHS[key]}</svg>`
}

/** Event body rendered as DOM nodes (text is set via textContent, so titles are never parsed as HTML). */
function eventContent(arg: EventDisplayInfo) {
  const ext = arg.event.extendedProps as EventExt
  const row = document.createElement('div')
  row.className = 'flex min-w-0 items-center gap-1'
  const icon = document.createElement('span')
  icon.className = 'inline-flex shrink-0'
  icon.innerHTML = svgMarkup(ext.kind)
  row.append(icon)
  if (arg.timeText) {
    const time = document.createElement('span')
    time.className = 'tabular shrink-0 opacity-80'
    time.textContent = arg.timeText
    row.append(time)
  }
  const label = document.createElement('span')
  label.className = 'truncate'
  label.textContent = arg.event.title
  row.append(label)
  if (ext.overdue) {
    const warn = document.createElement('span')
    warn.className = 'inline-flex shrink-0'
    warn.innerHTML = svgMarkup('alert')
    const sr = document.createElement('span')
    sr.className = 'sr-only'
    sr.textContent = t('calendar.overdue')
    warn.append(sr)
    row.append(warn)
  }
  return { domNodes: [row] }
}

/** Opens the item behind an event: tasks in the drawer, goals on their page. */
function openItem(ext: EventExt) {
  if (ext.role === 'goal' || (ext.role === 'checkpoint' && !ext.taskId)) {
    if (ext.goalId) router.push(`/goals/${ext.goalId}`)
    return
  }
  if (ext.taskId) ui.openTask(ext.taskId)
}

function eventClick(info: EventClickInfo) {
  openItem(info.event.extendedProps as EventExt)
}

function dateClick(info: DateClickInfo) {
  ui.openQuickAdd({ dueDate: info.dateStr.slice(0, 10) })
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const hm = (d: Date) => d.toISOString().slice(11, 16)

/** Due-spec patch for a dragged deadline. The new wall-clock time is interpreted in the user's zone, then stored in the task's own zone. */
function duePatch(task: Task, newDate: string, newTime: string | null) {
  const d = task.due
  if (d.precision === 'exact') {
    const time = newTime ?? taskDueTime(task, tz.value) ?? '00:00'
    const zone = d.timeZone ?? tz.value
    const w = wallClockAt(zonedTimeToUtc(newDate, time, tz.value), zone)
    return { precision: 'exact' as const, date: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`, time: `${pad2(w.hour)}:${pad2(w.minute)}`, timeZone: zone }
  }
  return { precision: d.precision, date: newDate, timeZone: d.timeZone }
}

async function eventDrop(info: EventDropInfo) {
  const ext = info.event.extendedProps as EventExt
  const start = info.event.start
  if (!start) return info.revert()
  const newDate = ymd(start)
  const newTime = info.event.allDay ? null : hm(start)
  try {
    if (ext.role === 'checkpoint') {
      await cpActions.update(ext.refId, { targetDate: newDate })
      return
    }
    if (ext.role === 'scheduled') {
      await taskActions.update(ext.refId, { scheduledDate: newDate })
      return
    }
    if (ext.role === 'due' && ext.taskId) {
      const task = tasksById.value.get(ext.taskId)
      if (!task) return info.revert()
      const patch = duePatch(task, newDate, newTime)
      if (patch.date === taskDueDate(task, tz.value) && patch.time === taskDueTime(task, tz.value)) return
      if (task.kind === 'deadline') {
        const ok = await confirm({ title: t('calendar.moveDeadlineTitle'), message: t('calendar.moveDeadlineMessage', { title: task.title, date: f.date(patch.date) }), confirmLabel: t('calendar.moveDeadlineConfirm') })
        if (!ok) return info.revert()
      }
      await taskActions.update(task.id, { due: patch } as never)
    }
  } catch (e) {
    info.revert()
    toast.error(errMsg(e))
  }
}

function datesSet(info: DatesSetInfo) {
  fcRange.value = { from: info.startStr.slice(0, 10), to: addDaysToIsoDate(info.endStr.slice(0, 10), -1) }
  const m = MODE_BY_VIEW[info.view.type]
  if (m && m !== mode.value) mode.value = m
}

const options = computed<CalendarOptions>(() => ({
  plugins: [classicThemePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  headerToolbar: false,
  height: 'auto',
  timeZone: 'UTC',
  locales: [jaLocale],
  locale: locale.value,
  firstDay: session.settings?.weekStart ?? 0,
  editable: true,
  selectable: false,
  dayMaxEvents: true,
  nowIndicator: true,
  events: events.value,
  eventContent,
  eventClick,
  eventDrop,
  dateClick,
  datesSet,
}))

watch(mode, (m) => {
  if (isDesktop.value) cal.value?.getApi().changeView(VIEW_BY_MODE[m])
})

const monthFormatter = computed(() => new Intl.DateTimeFormat(locale.value === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }))

const title = computed(() => {
  const r = activeRange.value
  if (!r) return ''
  if (!isDesktop.value) return `${f.date(r.from, { short: true })} – ${f.date(r.to, { short: true })}`
  if (mode.value === 'month') return monthFormatter.value.format(Date.parse(`${addDaysToIsoDate(r.from, 10)}T00:00:00Z`))
  if (mode.value === 'week') return `${f.date(r.from, { short: true })} – ${f.date(r.to, { short: true })}`
  return f.date(r.from, { weekday: true })
})

function navigate(step: 'prev' | 'next' | 'today') {
  if (isDesktop.value) {
    const api = cal.value?.getApi()
    if (!api) return
    if (step === 'prev') api.prev()
    else if (step === 'next') api.next()
    else api.today()
    return
  }
  if (step === 'today') anchor.value = f.today.value
  else anchor.value = addDaysToIsoDate(anchor.value, step === 'prev' ? -7 : 7)
}

const modeOptions = computed(() => [
  { value: 'month' as Mode, label: t('calendar.views.month') },
  { value: 'week' as Mode, label: t('calendar.views.week') },
  { value: 'day' as Mode, label: t('calendar.views.day') },
])

/** Mobile agenda: items grouped by their day within the 7-day window. */
const agendaGroups = computed(() => {
  const byDay = new Map<string, EventInput[]>()
  for (const ev of events.value) {
    const key = String(ev.start).slice(0, 10)
    byDay.set(key, [...(byDay.get(key) ?? []), ev])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => String(a.start).localeCompare(String(b.start))),
    }))
})

const ICON_BY_KIND: Record<Kind, Component> = { exact: Clock, date: CalendarDays, approximate: CalendarDays, scheduled: CalendarClock, checkpoint: ListChecks, goal: Target }
const LEGEND: { kind: Kind; label: string; tone: string }[] = [
  { kind: 'exact', label: 'calendar.legend.exact', tone: 'bg-primary text-on-primary border-l-[3px] border-l-primary-text' },
  { kind: 'date', label: 'calendar.legend.date', tone: 'bg-surface text-fg border border-solid border-primary' },
  { kind: 'goal', label: 'calendar.legend.goal', tone: 'bg-success-soft text-success-text border border-success' },
  { kind: 'checkpoint', label: 'calendar.legend.checkpoint', tone: 'bg-surface-sunken text-muted' },
  { kind: 'scheduled', label: 'calendar.legend.scheduled', tone: 'bg-surface-sunken text-muted' },
]

const hasItems = computed(() => events.value.length > 0)
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('calendar.title') }}</h1>
        <p class="mt-0.5 text-[13px] text-muted">{{ title }}</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1" role="group" :aria-label="t('calendar.navLabel')">
          <IconButton :label="t('calendar.prev')" size="sm" @click="navigate('prev')"><ChevronLeft aria-hidden="true" /></IconButton>
          <Button variant="secondary" size="sm" @click="navigate('today')">{{ t('calendar.today') }}</Button>
          <IconButton :label="t('calendar.next')" size="sm" @click="navigate('next')"><ChevronRight aria-hidden="true" /></IconButton>
        </div>
        <Segmented v-if="isDesktop" v-model="mode" :options="modeOptions" :label="t('calendar.viewLabel')" size="sm" />
      </div>
    </header>

    <!-- Legend: every visual treatment also has an icon and text, never colour alone. -->
    <ul class="mt-4 flex flex-wrap gap-2 text-xs text-muted" :aria-label="t('calendar.legendLabel')">
      <li v-for="item in LEGEND" :key="item.kind" class="flex items-center gap-1.5 rounded-md px-2 py-1" :class="item.tone">
        <component :is="ICON_BY_KIND[item.kind]" class="size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ t(item.label) }}</span>
      </li>
    </ul>

    <div v-if="isError && !data" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')"><Button @click="refetch()">{{ t('common.retry') }}</Button></EmptyState>
    </div>

    <!-- Desktop must mount FullCalendar first: it reports the visible range that enables the query. -->
    <div v-else-if="isPending && !data && !isDesktop" class="mt-6">
      <Skeleton :rows="6" height="44px" />
    </div>

    <!-- Desktop: FullCalendar month / week / day grids. -->
    <div v-else-if="isDesktop" class="tp-calendar mt-5 min-w-0 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-xs">
      <FullCalendar ref="cal" :options="options" />
    </div>

    <!-- Mobile: agenda grouped by day. -->
    <section v-else class="mt-5" :aria-label="t('calendar.agendaLabel')">
      <div class="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{{ t('calendar.views.agenda') }}</span>
        <span v-if="isFetching" class="text-subtle">{{ t('common.loading') }}</span>
      </div>
      <EmptyState v-if="!hasItems" compact :icon="CalendarDays" :title="t('calendar.noItems')" :description="t('calendar.noItemsHint')" />
      <div v-else class="stagger flex flex-col gap-4">
        <div v-for="(group, gi) in agendaGroups" :key="group.date" :style="{ '--i': gi }">
          <h2 class="sticky top-0 z-10 bg-bg/90 py-1.5 text-[13px] font-semibold text-fg backdrop-blur">{{ f.relativeDay(group.date) }}</h2>
          <ul class="flex flex-col gap-1.5">
            <li v-for="ev in group.items" :key="String(ev.id)">
              <button
                type="button"
                class="flex w-full min-h-11 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left shadow-xs transition hover:bg-surface-hover"
                :class="(ev.extendedProps as EventExt).done ? 'opacity-60' : ''"
                @click="openItem(ev.extendedProps as EventExt)"
              >
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted">
                  <component :is="ICON_BY_KIND[(ev.extendedProps as EventExt).kind]" class="size-4" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-fg" :class="(ev.extendedProps as EventExt).done ? 'line-through' : ''">{{ ev.title }}</span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <span class="tabular">{{ ev.allDay ? t('calendar.allDay') : String(ev.start).slice(11, 16) }}</span>
                    <span class="rounded bg-surface-sunken px-1">{{ t(`calendar.kind.${(ev.extendedProps as EventExt).kind}`) }}</span>
                    <span v-if="(ev.extendedProps as EventExt).overdue" class="inline-flex items-center gap-0.5 font-medium text-danger-text"><AlertTriangle class="size-3" aria-hidden="true" />{{ t('calendar.overdue') }}</span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
