<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryClient } from '@tanstack/vue-query'
import { Trash2 } from 'lucide-vue-next'
import type { EChartsOption } from 'echarts'
import Card from '@/components/ui/Card.vue'
import { api } from '@/lib/api'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import { confirm } from '@/composables/useConfirm'
import type { GoalDetail } from '@/lib/types'

// ECharts is loaded lazily so the detail page stays light.
const VChart = defineAsyncComponent(async () => {
  const [{ use }, { CanvasRenderer }, { LineChart }, { GridComponent, TooltipComponent }, m] = await Promise.all([
    import('echarts/core'),
    import('echarts/renderers'),
    import('echarts/charts'),
    import('echarts/components'),
    import('vue-echarts'),
  ])
  use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])
  return m.default
})

const props = defineProps<{ goal: GoalDetail }>()
const { t } = useI18n()
const f = useFormat()
const now = useNow()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()

/**
 * Resolve a CSS color (including oklch) to an rgba() string. ECharts' own color
 * parser does not understand every CSS syntax, so the browser normalizes it via a canvas.
 */
function cssColor(variable: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    if (!raw) return fallback
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return fallback
    ctx.fillStyle = '#000000'
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  } catch {
    return fallback
  }
}

const colors = ref({ line: '#6366f1', area: 'rgba(99, 102, 241, 0.12)', grid: 'rgba(120, 120, 140, 0.18)', text: 'rgba(120, 120, 140, 0.9)' })
onMounted(() => {
  const line = cssColor('--primary', colors.value.line)
  colors.value = {
    line,
    area: line.replace(/, [\d.]+\)$/, ', 0.12)'),
    grid: cssColor('--border', colors.value.grid),
    text: cssColor('--text-muted', colors.value.text),
  }
})

const sorted = computed(() => props.goal.progress.slice().sort((a, b) => a.occurredAt - b.occurredAt))
const points = computed(() => sorted.value.filter((e) => e.newValue != null))

const option = computed<EChartsOption>(() => ({
  animation: true,
  grid: { left: 44, right: 12, top: 16, bottom: 28, containLabel: false },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'time', axisLine: { lineStyle: { color: colors.value.grid } }, axisLabel: { color: colors.value.text }, splitLine: { show: false } },
  yAxis: { type: 'value', axisLabel: { color: colors.value.text }, splitLine: { lineStyle: { color: colors.value.grid } } },
  series: [
    {
      type: 'line',
      smooth: true,
      symbolSize: 6,
      data: points.value.map((e) => [e.occurredAt, e.newValue]),
      lineStyle: { color: colors.value.line, width: 2 },
      itemStyle: { color: colors.value.line },
      areaStyle: { color: colors.value.area },
    },
  ],
}))

function deltaOf(e: { previousValue: number | null; newValue: number | null }) {
  if (e.previousValue == null || e.newValue == null) return null
  return e.newValue - e.previousValue
}

const recent = computed(() => sorted.value.slice().reverse())

async function remove(id: string) {
  const ok = await confirm({ title: t('progressLog.delete.title'), message: t('progressLog.delete.message'), danger: true, confirmLabel: t('common.delete') })
  if (!ok) return
  try {
    await api.del(`/progress/${id}`)
    for (const key of ['goal', 'goals', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
    toast.success(t('progressLog.deleted'))
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <Card :title="t('goalPage.history.title')" class="h-full">
    <div v-if="points.length >= 2" role="img" :aria-label="t('goalPage.history.chartLabel')">
      <VChart :option="option" autoresize class="h-52 w-full" />
    </div>
    <p v-else class="rounded-xl bg-surface-sunken px-3 py-6 text-center text-sm text-muted">{{ t('goalPage.history.notEnough') }}</p>

    <h3 class="mt-5 text-xs font-medium uppercase tracking-wide text-subtle">{{ t('goalPage.history.entries') }}</h3>
    <ul v-if="recent.length" class="mt-2 divide-y divide-border">
      <li v-for="e in recent" :key="e.id" class="flex items-start gap-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span v-if="deltaOf(e) != null" class="tabular font-semibold" :class="(deltaOf(e) ?? 0) >= 0 ? 'text-success-text' : 'text-warning-text'">
              {{ (deltaOf(e) ?? 0) >= 0 ? '+' : '' }}{{ f.number(deltaOf(e) ?? 0, 2) }}
            </span>
            <span v-if="e.newValue != null" class="tabular text-muted">→ {{ f.number(e.newValue, 2) }}</span>
            <span v-if="e.minutes" class="text-xs text-muted">· {{ f.minutes(e.minutes) }}</span>
          </p>
          <p v-if="e.note" class="mt-0.5 text-sm text-fg">{{ e.note }}</p>
          <p class="mt-0.5 text-xs text-subtle">{{ f.relativeTime(e.occurredAt, now) }}</p>
        </div>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-surface-hover hover:text-danger-text max-md:size-9"
          :aria-label="t('progressLog.deleteEntry')"
          @click="remove(e.id)"
        >
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="mt-2 text-sm text-subtle">{{ t('goalPage.history.empty') }}</p>
  </Card>
</template>
