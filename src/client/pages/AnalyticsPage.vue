<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { useMediaQuery } from '@vueuse/core'
import type { EChartsOption } from 'echarts'
import { AlertTriangle, CheckCircle2, Clock, Flame, Gauge, Info, ListChecks, ListTodo, Timer, Target } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import EChart from '@/components/charts/EChart.vue'
import type { ChartPalette } from '@/components/charts/chartTheme'
import { useFormat } from '@/composables/useFormat'
import { qk } from '@/composables/useTasks'
import { useSessionStore } from '@/stores/session'
import { api } from '@/lib/api'
import { addDaysToIsoDate, diffInCalendarDays } from '@shared/time'

interface Analytics {
  generatedAt: number
  rangeDays: number
  timeZone: string
  metrics: {
    activeTasks: number
    completedTasks: number
    completedAllTime: number
    completionRate: number | null
    onTimeRate: number | null
    onTimeSample: number
    overdueTasks: number
    openDeadlines: number
    checkpointsCompleted: number
    estimatedMinutes: number
    actualMinutes: number
    loggedMinutes: number
    activeDays28: number
    consistency: number
    hasOverdue: boolean
  }
  daily: { date: string; tasks: number; checkpoints: number }[]
  weekly: { weekStart: string; completed: number; checkpoints: number; minutes: number; estimated: number; actual: number }[]
  distribution: { weeks: { weekStart: string; count: number; strict: number }[]; overdue: number }
  goals: { id: string; title: string; status: string; progress: number; targetDate: string | null }[]
  heatmap: { date: string; count: number }[]
  checkpointTimeline: { title: string; completedOn: string; targetDate: string | null; onTime: boolean | null }[]
}

const { t } = useI18n()
const f = useFormat()
const session = useSessionStore()
const isDesktop = useMediaQuery('(min-width: 768px)')

const rangeKey = ref<'7' | '30' | '90' | '365'>('30')
const rangeDays = computed(() => Number(rangeKey.value))
const rangeOptions = computed(() => [
  { value: '7' as const, label: t('analytics.range.7') },
  { value: '30' as const, label: t('analytics.range.30') },
  { value: '90' as const, label: t('analytics.range.90') },
  { value: '365' as const, label: t('analytics.range.365') },
])

const { data, isPending, isError, refetch } = useQuery({
  queryKey: computed(() => qk.analytics(rangeDays.value)),
  queryFn: ({ signal }) => api.get<Analytics>('/analytics', { range: rangeDays.value }, signal),
  placeholderData: keepPreviousData,
  staleTime: 30_000,
})

const m = computed(() => data.value?.metrics)
const count = (v: number | undefined) => (v == null ? '—' : f.number(v, 0))

interface MetricCard {
  key: string
  label: string
  value: string
  hint: string | null
  icon: Component
  tone: string
  def: string
}

const cards = computed<MetricCard[]>(() => {
  const x = m.value
  const sample = data.value?.metrics.onTimeSample ?? 0
  return [
    { key: 'active', label: t('analytics.metric.active'), value: count(x?.activeTasks), hint: x ? t('analytics.hint.openDeadlines', { n: x.openDeadlines }) : null, icon: ListTodo, tone: 'text-primary-text bg-primary-softer', def: t('analytics.def.active') },
    { key: 'completed', label: t('analytics.metric.completed'), value: count(x?.completedTasks), hint: x ? t('analytics.hint.allTime', { n: x.completedAllTime }) : null, icon: CheckCircle2, tone: 'text-success-text bg-success-soft', def: t('analytics.def.completed') },
    { key: 'rate', label: t('analytics.metric.completionRate'), value: f.percent(x?.completionRate), hint: null, icon: Gauge, tone: 'text-info bg-info-soft', def: t('analytics.def.completionRate') },
    {
      key: 'onTime',
      label: t('analytics.metric.onTimeRate'),
      value: f.percent(x?.onTimeRate),
      hint: x && x.onTimeRate == null ? t('analytics.noSample') : t('analytics.hint.sample', { n: sample }),
      icon: Clock,
      tone: 'text-warning-text bg-warning-soft',
      def: t('analytics.def.onTimeRate'),
    },
    { key: 'overdue', label: t('analytics.metric.overdue'), value: count(x?.overdueTasks), hint: null, icon: AlertTriangle, tone: x && x.overdueTasks > 0 ? 'text-danger-text bg-danger-soft' : 'text-muted bg-surface-sunken', def: t('analytics.def.overdue') },
    { key: 'checkpoints', label: t('analytics.metric.checkpoints'), value: count(x?.checkpointsCompleted), hint: null, icon: ListChecks, tone: 'text-success-text bg-success-soft', def: t('analytics.def.checkpoints') },
    {
      key: 'effort',
      label: t('analytics.metric.effort'),
      value: x && x.estimatedMinutes > 0 ? f.minutes(x.actualMinutes) : '—',
      hint: x && x.estimatedMinutes > 0 ? t('analytics.hint.effort', { est: f.minutes(x.estimatedMinutes) }) : t('analytics.noSample'),
      icon: Timer,
      tone: 'text-ai bg-ai-soft',
      def: t('analytics.def.effort'),
    },
    { key: 'consistency', label: t('analytics.metric.consistency'), value: x ? f.percent(x.consistency) : '—', hint: x ? t('analytics.hint.activeDays', { n: x.activeDays28 }) : null, icon: Flame, tone: 'text-warning-text bg-warning-soft', def: t('analytics.def.consistency') },
  ]
})

/* ---------------- Charts ---------------- */

const weeksLabel = (iso: string) => f.date(iso, { short: true })
const dayKeyOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0)

const dailyHas = computed(() => (data.value?.daily ?? []).some((x) => x.tasks + x.checkpoints > 0))
const dailyOption = (p: ChartPalette): EChartsOption => {
  const days = data.value?.daily ?? []
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as { dataIndex: number; seriesName: string; value: number; marker: string }[]
        const head = f.date(days[arr[0].dataIndex]?.date ?? '')
        return [head, ...arr.map((x) => `${x.marker}${x.seriesName}: ${f.number(x.value, 0)}`)].join('<br/>')
      },
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: p.muted } },
    grid: { left: 8, right: 8, top: 12, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: days.map((x) => f.date(x.date, { short: true })), axisLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted, hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted } },
    series: [
      { name: t('analytics.series.tasks'), type: 'bar', stack: 'done', barMaxWidth: 16, data: days.map((x) => x.tasks), itemStyle: { color: p.primary } },
      { name: t('analytics.series.checkpoints'), type: 'bar', stack: 'done', barMaxWidth: 16, data: days.map((x) => x.checkpoints), itemStyle: { color: p.success } },
    ],
  }
}

const weeklyHas = computed(() => (data.value?.weekly ?? []).some((x) => x.completed + x.checkpoints > 0))
const weeklyOption = (p: ChartPalette): EChartsOption => {
  const weeks = data.value?.weekly ?? []
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: p.muted } },
    grid: { left: 8, right: 12, top: 12, bottom: 40, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: weeks.map((x) => weeksLabel(x.weekStart)), axisLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted, hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted } },
    series: [
      { name: t('analytics.series.tasks'), type: 'line', smooth: true, symbolSize: 6, data: weeks.map((x) => x.completed), itemStyle: { color: p.primary }, lineStyle: { color: p.primary } },
      { name: t('analytics.series.checkpoints'), type: 'line', smooth: true, symbolSize: 6, data: weeks.map((x) => x.checkpoints), itemStyle: { color: p.success }, lineStyle: { color: p.success } },
    ],
  }
}

const distributionHas = computed(() => (data.value?.distribution.weeks ?? []).some((x) => x.count > 0) || (data.value?.distribution.overdue ?? 0) > 0)
const distributionOption = (p: ChartPalette): EChartsOption => {
  const weeks = data.value?.distribution.weeks ?? []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: p.muted } },
    grid: { left: 8, right: 8, top: 12, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: weeks.map((x) => weeksLabel(x.weekStart)), axisLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted, hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted } },
    series: [
      { name: t('analytics.series.strict'), type: 'bar', stack: 'due', barMaxWidth: 28, data: weeks.map((x) => x.strict), itemStyle: { color: p.primary } },
      { name: t('analytics.series.others'), type: 'bar', stack: 'due', barMaxWidth: 28, data: weeks.map((x) => x.count - x.strict), itemStyle: { color: p.secondary } },
    ],
  }
}

const goalsHas = computed(() => (data.value?.goals ?? []).length > 0)
const goalsOption = (p: ChartPalette): EChartsOption => {
  const goals = data.value?.goals ?? []
  return {
    tooltip: { trigger: 'item', formatter: (params: unknown) => {
      const x = params as { name: string; value: number }
      return `${x.name}: ${f.percent(x.value / 100)}`
    } },
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted, formatter: (v: number) => f.percent(v / 100) } },
    yAxis: { type: 'category', inverse: true, data: goals.map((g) => g.title), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.muted, width: 140, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: goals.map((g) => ({ value: Math.round(g.progress * 1000) / 10, itemStyle: { color: g.status === 'completed' ? p.success : p.primary, borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: 'right', color: p.muted, formatter: (params: unknown) => f.percent(((params as { value: number }).value ?? 0) / 100) },
      },
    ],
  }
}

const heatDays = computed(() => (isDesktop.value ? 365 : 120))
const heatRows = computed(() => {
  const counts = new Map((data.value?.heatmap ?? []).map((x) => [x.date, x.count]))
  const today = f.today.value
  const out: { date: string; count: number }[] = []
  for (let i = heatDays.value - 1; i >= 0; i--) {
    const date = addDaysToIsoDate(today, -i)
    out.push({ date, count: counts.get(date) ?? 0 })
  }
  return out
})
const heatHas = computed(() => heatRows.value.some((x) => x.count > 0))
const heatOption = (p: ChartPalette): EChartsOption => {
  const rows = heatRows.value
  const max = Math.max(1, ...rows.map((r) => r.count))
  return {
    tooltip: { formatter: (params: unknown) => {
      const x = params as { value: [string, number] }
      return `${f.date(x.value[0])}: ${f.number(x.value[1], 0)}`
    } },
    visualMap: { min: 0, max, show: false, inRange: { color: [p.border, p.primary] } },
    calendar: {
      top: 24,
      left: 36,
      right: 8,
      bottom: 4,
      cellSize: ['auto', 12],
      range: [rows[0]?.date ?? f.today.value, rows[rows.length - 1]?.date ?? f.today.value],
      itemStyle: { borderWidth: 2, borderColor: p.surface },
      splitLine: { show: false },
      yearLabel: { show: false },
      dayLabel: { color: p.muted, fontSize: 10, nameMap: 'en', firstDay: session.settings?.weekStart === 1 ? 1 : 0 },
      monthLabel: { color: p.muted, fontSize: 10, nameMap: 'en' },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: rows.map((r) => [r.date, r.count]) }],
  }
}

const effortHas = computed(() => (data.value?.weekly ?? []).some((x) => x.estimated > 0 || x.actual > 0))
const effortOption = (p: ChartPalette): EChartsOption => {
  const weeks = data.value?.weekly ?? []
  const hours = (min: number) => Math.round((min / 60) * 10) / 10
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => `${f.number(Number(v), 1)} h` },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: p.muted } },
    grid: { left: 8, right: 8, top: 12, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: weeks.map((x) => weeksLabel(x.weekStart)), axisLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted, hideOverlap: true } },
    yAxis: { type: 'value', name: t('analytics.axis.hours'), nameTextStyle: { color: p.muted }, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted } },
    series: [
      { name: t('analytics.series.estimated'), type: 'bar', barMaxWidth: 14, data: weeks.map((x) => hours(x.estimated)), itemStyle: { color: p.secondary } },
      { name: t('analytics.series.actual'), type: 'bar', barMaxWidth: 14, data: weeks.map((x) => hours(x.actual)), itemStyle: { color: p.primary } },
    ],
  }
}

const scatterPoints = computed(() => (data.value?.checkpointTimeline ?? []).filter((x) => x.targetDate))
const scatterHas = computed(() => scatterPoints.value.length > 0)
const scatterOption = (p: ChartPalette): EChartsOption => {
  const pts = scatterPoints.value.map((x) => ({ title: x.title, completedOn: x.completedOn, days: diffInCalendarDays(x.completedOn, x.targetDate!), onTime: x.onTime }))
  const toPoint = (x: (typeof pts)[number]) => [dayKeyOf(x.completedOn), x.days, x.title, x.completedOn]
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const x = params as { data: [number, number, string, string] }
        const [, days, title, on] = x.data
        const key = days >= 0 ? 'analytics.tip.early' : 'analytics.tip.late'
        return [title, f.date(on), t(key, { days: Math.abs(days) })].join('<br/>')
      },
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: p.muted } },
    grid: { left: 8, right: 12, top: 12, bottom: 40, containLabel: true },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: p.border } }, splitLine: { show: false }, axisLabel: { color: p.muted, formatter: (v: number) => f.date(new Date(v).toISOString().slice(0, 10), { short: true }) } },
    yAxis: { type: 'value', name: t('analytics.axis.daysEarly'), nameTextStyle: { color: p.muted }, splitLine: { lineStyle: { color: p.border } }, axisLabel: { color: p.muted } },
    series: [
      { name: t('analytics.series.onTime'), type: 'scatter', symbolSize: 10, data: pts.filter((x) => x.onTime !== false).map(toPoint), itemStyle: { color: p.success } },
      { name: t('analytics.series.late'), type: 'scatter', symbolSize: 10, data: pts.filter((x) => x.onTime === false).map(toPoint), itemStyle: { color: p.danger } },
    ],
  }
}

const summaries = computed(() => {
  const d = data.value
  const dailyTasks = sum((d?.daily ?? []).map((x) => x.tasks))
  const dailyCps = sum((d?.daily ?? []).map((x) => x.checkpoints))
  const weekTasks = sum((d?.weekly ?? []).map((x) => x.completed))
  const weekCps = sum((d?.weekly ?? []).map((x) => x.checkpoints))
  const due = sum((d?.distribution.weeks ?? []).map((x) => x.count))
  const active = d?.heatmap.filter((x) => x.count > 0).length ?? 0
  const pts = scatterPoints.value
  return {
    daily: t('analytics.a11y.daily', { tasks: dailyTasks, checkpoints: dailyCps }),
    weekly: t('analytics.a11y.weekly', { tasks: weekTasks, checkpoints: weekCps }),
    distribution: t('analytics.a11y.distribution', { count: due, overdue: d?.distribution.overdue ?? 0 }),
    goals: t('analytics.a11y.goals', { count: d?.goals.length ?? 0 }),
    heatmap: t('analytics.a11y.heatmap', { days: heatDays.value, active }),
    effort: t('analytics.a11y.effort', { count: d?.weekly.length ?? 0 }),
    scatter: t('analytics.a11y.scatter', { count: pts.length, late: pts.filter((x) => x.onTime === false).length }),
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('analytics.title') }}</h1>
        <p class="mt-0.5 text-[13px] text-muted">{{ t('analytics.subtitle') }}</p>
      </div>
      <Segmented v-model="rangeKey" :options="rangeOptions" :label="t('analytics.rangeLabel')" size="sm" />
    </header>

    <div v-if="isError && !data" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')"><Button @click="refetch()">{{ t('common.retry') }}</Button></EmptyState>
    </div>

    <template v-else>
      <!-- Metric cards -->
      <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <template v-if="isPending && !data">
          <Skeleton v-for="i in 8" :key="i" :rows="2" height="48px" class="rounded-2xl border border-border bg-surface p-4" />
        </template>
        <template v-else>
          <div v-for="(c, i) in cards" :key="c.key" class="stagger flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-xs" :style="{ '--i': i }">
            <div class="flex items-center justify-between gap-2">
              <span class="grid size-8 place-items-center rounded-lg" :class="c.tone"><component :is="c.icon" class="size-4" aria-hidden="true" /></span>
              <Tooltip :text="c.def">
                <button type="button" class="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-surface-hover hover:text-fg" :aria-label="t('analytics.infoLabel', { metric: c.label })">
                  <Info class="size-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <div class="min-w-0">
              <p class="tabular text-2xl font-semibold leading-none text-fg">{{ c.value }}</p>
              <p class="mt-1.5 truncate text-xs font-medium text-muted">{{ c.label }}</p>
              <p v-if="c.hint" class="mt-0.5 truncate text-[11px] text-subtle">{{ c.hint }}</p>
            </div>
          </div>
        </template>
      </div>

      <!-- Charts -->
      <div class="mt-6 grid gap-5 lg:grid-cols-2">
        <Card :title="t('analytics.charts.daily.title')" :subtitle="t('analytics.charts.daily.desc')">
          <EChart v-if="dailyHas" :option="dailyOption" :label="summaries.daily" :height="260" />
          <EmptyState v-else compact :icon="ListChecks" :title="t('analytics.empty.title')" :description="t('analytics.empty.daily')" />
        </Card>

        <Card :title="t('analytics.charts.weekly.title')" :subtitle="t('analytics.charts.weekly.desc')">
          <EChart v-if="weeklyHas" :option="weeklyOption" :label="summaries.weekly" :height="260" />
          <EmptyState v-else compact :icon="ListChecks" :title="t('analytics.empty.title')" :description="t('analytics.empty.weekly')" />
        </Card>

        <Card :title="t('analytics.charts.distribution.title')" :subtitle="t('analytics.charts.distribution.desc')">
          <template #actions>
            <span v-if="data && data.distribution.overdue > 0" class="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-1 text-xs font-medium text-danger-text">
              <AlertTriangle class="size-3.5" aria-hidden="true" />{{ t('analytics.overdueCallout', { n: data.distribution.overdue }) }}
            </span>
          </template>
          <EChart v-if="distributionHas" :option="distributionOption" :label="summaries.distribution" :height="260" />
          <EmptyState v-else compact :icon="Target" :title="t('analytics.empty.title')" :description="t('analytics.empty.distribution')" />
        </Card>

        <Card :title="t('analytics.charts.goals.title')" :subtitle="t('analytics.charts.goals.desc')">
          <EChart v-if="goalsHas" :option="goalsOption" :label="summaries.goals" :height="Math.max(160, (data?.goals.length ?? 0) * 40 + 40)" />
          <EmptyState v-else compact :icon="Target" :title="t('analytics.empty.title')" :description="t('analytics.empty.goals')" />
        </Card>

        <Card class="lg:col-span-2" :title="t('analytics.charts.heatmap.title')" :subtitle="t('analytics.charts.heatmap.desc', { days: heatDays })">
          <EChart v-if="heatHas" :option="heatOption" :label="summaries.heatmap" :height="isDesktop ? 190 : 160" />
          <EmptyState v-else compact :icon="Flame" :title="t('analytics.empty.title')" :description="t('analytics.empty.heatmap')" />
        </Card>

        <Card :title="t('analytics.charts.effort.title')" :subtitle="t('analytics.charts.effort.desc')">
          <EChart v-if="effortHas" :option="effortOption" :label="summaries.effort" :height="260" />
          <EmptyState v-else compact :icon="Timer" :title="t('analytics.empty.title')" :description="t('analytics.empty.effort')" />
        </Card>

        <Card :title="t('analytics.charts.scatter.title')" :subtitle="t('analytics.charts.scatter.desc')">
          <EChart v-if="scatterHas" :option="scatterOption" :label="summaries.scatter" :height="260" />
          <EmptyState v-else compact :icon="ListChecks" :title="t('analytics.empty.title')" :description="t('analytics.empty.scatter')" />
        </Card>
      </div>

      <p class="mt-6 flex items-start gap-2 text-xs text-subtle">
        <Info class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ t('analytics.footnote') }}
      </p>
    </template>
  </div>
</template>
