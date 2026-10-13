<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight, Lock, Rows3 } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useFormat } from '@/composables/useFormat'
import { useUiStore } from '@/stores/ui'
import type { Project, Task } from '@/lib/types'
import { addDaysToIsoDate, isoDateInZone } from '@shared/time'
import { dayDiff, taskDueDate, type CalendarPayload } from './planningModel'

/**
 * Desktop Gantt built with absolute positioning (no charting library).
 * Bars run from the task's start (startDate, else creation day) to its due day.
 */
const props = defineProps<{ tasks: Task[]; checkpoints: CalendarPayload['checkpoints']; projects: Project[]; from: string; to: string; today: string }>()

const DAY_W = 28
const LABEL_W = 260
const ROW_H = 40

const { t, locale } = useI18n()
const f = useFormat()
const ui = useUiStore()
const scroller = ref<HTMLElement | null>(null)
const collapsed = ref<Record<string, boolean>>({})

const N = computed(() => dayDiff(props.from, props.to) + 1)
const days = computed(() => Array.from({ length: N.value }, (_, i) => addDaysToIsoDate(props.from, i)))
const todayIdx = computed(() => dayDiff(props.from, props.today))
const clamp = (v: number) => Math.min(N.value - 1, Math.max(0, v))

interface CpMarker {
  id: string
  title: string
  date: string
  idx: number
  done: boolean
}
interface Row {
  task: Task
  s: number
  e: number
  due: string
  startIso: string
  progress: number
  blocked: boolean
  isDeadline: boolean
  cps: CpMarker[]
}
interface Group {
  id: string
  name: string
  color: string | null
  rows: Row[]
}

const groups = computed<Group[]>(() => {
  const tz = f.tz.value
  const cpByTask = new Map<string, CpMarker[]>()
  for (const cp of props.checkpoints) {
    if (!cp.taskId || !cp.targetDate || cp.status === 'skipped') continue
    const idx = dayDiff(props.from, cp.targetDate)
    if (idx < 0 || idx > N.value - 1) continue
    cpByTask.set(cp.taskId, [...(cpByTask.get(cp.taskId) ?? []), { id: cp.id, title: cp.title, date: cp.targetDate, idx, done: cp.status === 'done' }])
  }

  const map = new Map<string, Group>()
  for (const task of props.tasks) {
    const due = taskDueDate(task, tz)
    if (!due) continue
    const startIso = task.startDate ?? isoDateInZone(task.createdAt, tz)
    let s = dayDiff(props.from, startIso)
    let e = dayDiff(props.from, due)
    if (e < s) e = s
    if (e < 0 || s > N.value - 1) continue // outside the visible window
    const gid = task.projectId ?? 'none'
    const project = props.projects.find((p) => p.id === task.projectId)
    const group = map.get(gid) ?? { id: gid, name: project?.name ?? t('gantt.noProject'), color: project?.color ?? null, rows: [] }
    group.rows.push({
      task,
      s: clamp(s),
      e: clamp(e),
      due,
      startIso,
      progress: Math.min(100, Math.max(0, task.progressPercent)),
      blocked: task.counts.openDependencies > 0,
      isDeadline: task.kind === 'deadline',
      cps: cpByTask.get(task.id) ?? [],
    })
    map.set(gid, group)
  }
  for (const g of map.values()) g.rows.sort((a, b) => a.e - b.e || a.task.title.localeCompare(b.task.title))
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
})

/** Month header spans. */
const months = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' })
  const out: { left: number; label: string }[] = []
  days.value.forEach((d, i) => {
    if (i === 0 || d.slice(0, 7) !== days.value[i - 1].slice(0, 7)) out.push({ left: i * DAY_W, label: fmt.format(Date.parse(`${d}T00:00:00Z`)) })
  })
  return out
})

/** Weekend columns shaded with one background gradient shared by every row. */
const shade = computed(() => {
  const isWeekend = (i: number) => {
    const dow = new Date(Date.parse(`${days.value[i]}T00:00:00Z`)).getUTCDay()
    return dow === 0 || dow === 6
  }
  const parts: string[] = []
  let runStart = 0
  let runWeekend = isWeekend(0)
  for (let i = 1; i <= N.value; i++) {
    const w = i < N.value ? isWeekend(i) : !runWeekend
    if (w !== runWeekend) {
      parts.push(`${runWeekend ? 'var(--surface-sunken)' : 'transparent'} ${runStart * DAY_W}px ${i * DAY_W}px`)
      runStart = i
      runWeekend = w
    }
  }
  return `linear-gradient(to right, ${parts.join(', ')})`
})

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)))
}

function barTip(row: Row): string {
  return t('gantt.tip', {
    title: row.task.title,
    start: f.date(row.startIso),
    end: f.date(row.due),
    progress: row.progress,
    blocked: row.blocked ? ` · ${t('gantt.blocked')}` : '',
  })
}

function cpTip(cp: CpMarker): string {
  return t('gantt.checkpointTip', { title: cp.title, date: f.date(cp.date), status: cp.done ? t('status.completed') : t('status.not_started') })
}

function toggleGroup(id: string) {
  collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] }
}

onMounted(() => {
  if (scroller.value && todayIdx.value >= 0) scroller.value.scrollLeft = Math.max(0, todayIdx.value * DAY_W - 160)
})

const sizeLabel = `${LABEL_W}px`
const gridWidth = computed(() => `${N.value * DAY_W}px`)
</script>

<template>
  <EmptyState v-if="!groups.length" compact :icon="Rows3" :title="t('gantt.empty')" :description="t('gantt.emptyHint')" />

  <div v-else ref="scroller" role="region" tabindex="0" :aria-label="t('gantt.regionLabel')" class="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-xs">
    <div :style="{ width: `calc(${sizeLabel} + ${gridWidth})` }">
      <!-- Header: months and day numbers -->
      <div class="sticky top-0 z-20 flex border-b border-border bg-surface">
        <div class="sticky left-0 z-30 flex shrink-0 items-end bg-surface px-3 pb-2 text-xs font-medium text-muted" :style="{ width: sizeLabel }">{{ t('gantt.task') }}</div>
        <div class="relative h-12 shrink-0" :style="{ width: gridWidth }">
          <div v-for="m in months" :key="m.left" class="absolute top-0 flex h-6 items-center border-l border-border px-1.5 text-xs font-semibold text-fg" :style="{ left: `${m.left}px` }">{{ m.label }}</div>
          <div
            v-for="(d, i) in days"
            :key="d"
            class="tabular absolute bottom-0 flex h-6 items-center justify-center text-[10px]"
            :class="d === today ? 'font-bold text-danger-text' : 'text-subtle'"
            :style="{ left: `${i * DAY_W}px`, width: `${DAY_W}px` }"
          >{{ dayNumber(d) }}</div>
        </div>
      </div>

      <div v-for="g in groups" :key="g.id">
        <!-- Project group header (collapsible) -->
        <div class="flex border-b border-border bg-surface-sunken/60">
          <button
            type="button"
            class="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-surface-sunken px-3 py-2 text-left text-[13px] font-semibold text-fg"
            :style="{ width: sizeLabel }"
            :aria-expanded="!collapsed[g.id]"
            @click="toggleGroup(g.id)"
          >
            <component :is="collapsed[g.id] ? ChevronRight : ChevronDown" class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="size-2.5 shrink-0 rounded-full" :class="!g.color && 'bg-border-strong'" :style="g.color ? { backgroundColor: g.color } : undefined" aria-hidden="true" />
            <span class="truncate">{{ g.name }}</span>
            <span class="tabular ml-auto text-xs font-normal text-subtle">{{ g.rows.length }}</span>
          </button>
          <div class="shrink-0" :style="{ width: gridWidth, backgroundImage: shade }" />
        </div>

        <template v-if="!collapsed[g.id]">
          <div v-for="(row, ri) in g.rows" :key="row.task.id" class="flex border-b border-border/60 last:border-b-0" :style="{ height: `${ROW_H}px` }">
            <button
              type="button"
              class="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-surface px-3 text-left transition-colors hover:bg-surface-hover"
              :style="{ width: sizeLabel }"
              @click="ui.openTask(row.task.id)"
            >
              <span class="truncate text-[13px] text-fg">{{ row.task.title }}</span>
              <Lock v-if="row.blocked" class="size-3 shrink-0 text-warning-text" aria-hidden="true" />
              <span class="tabular ml-auto shrink-0 text-[11px] text-subtle">{{ f.date(row.due, { short: true }) }}</span>
            </button>

            <div class="relative shrink-0" :style="{ width: gridWidth, backgroundImage: shade }">
              <div v-if="todayIdx >= 0" class="absolute inset-y-0 w-px bg-danger" :style="{ left: `${todayIdx * DAY_W + DAY_W / 2}px` }" aria-hidden="true" />

              <Tooltip :text="barTip(row)">
                <button
                  type="button"
                  class="gantt-bar absolute top-[9px] h-[22px] overflow-hidden rounded-md border border-primary/40 bg-primary-soft text-left"
                  :style="{ left: `${row.s * DAY_W + 2}px`, width: `${(row.e - row.s + 1) * DAY_W - 4}px`, '--i': ri }"
                  :aria-label="barTip(row)"
                  @click="ui.openTask(row.task.id)"
                >
                  <span class="absolute inset-y-0 left-0 bg-primary/70" :style="{ width: `${row.progress}%` }" aria-hidden="true" />
                  <Lock v-if="row.blocked" class="absolute right-1 top-1/2 size-3 -translate-y-1/2 text-warning-text" aria-hidden="true" />
                </button>
              </Tooltip>

              <!-- Deadline marker at the due day -->
              <Tooltip v-if="row.isDeadline" :text="t('gantt.deadlineMarker', { date: f.date(row.due) })">
                <span
                  class="absolute top-[14px] grid size-3 rotate-45 place-items-center rounded-[2px] bg-danger ring-2 ring-surface"
                  :style="{ left: `${(row.e + 1) * DAY_W - 9}px` }"
                  role="img"
                  :aria-label="t('gantt.deadlineMarker', { date: f.date(row.due) })"
                />
              </Tooltip>

              <!-- Checkpoint milestones -->
              <Tooltip v-for="cp in row.cps" :key="cp.id" :text="cpTip(cp)">
                <button
                  type="button"
                  class="absolute top-[15px] grid size-2.5 rotate-45 place-items-center rounded-[2px] ring-2 ring-surface"
                  :class="cp.done ? 'bg-success' : 'bg-fg/70'"
                  :style="{ left: `${cp.idx * DAY_W + DAY_W / 2 - 5}px` }"
                  :aria-label="cpTip(cp)"
                  @click="ui.openTask(row.task.id)"
                />
              </Tooltip>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-bar {
  transform-origin: left center;
  animation: gantt-grow var(--dur-slow) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 28ms);
}
@keyframes gantt-grow {
  from {
    transform: scaleX(0);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
</style>
