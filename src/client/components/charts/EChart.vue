<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { loadChartLibrary, readPalette, type ChartPalette } from './chartTheme'

/**
 * Lazy ECharts wrapper. `option` is a builder that receives the current theme
 * palette, so the chart re-renders with correct colours when dark mode toggles.
 */
const props = withDefaults(defineProps<{ option: (palette: ChartPalette) => EChartsOption; label: string; height?: number }>(), { height: 260 })

const themeTick = ref(0)
let observer: MutationObserver | null = null

onMounted(() => {
  observer = new MutationObserver(() => themeTick.value++)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
})
onBeforeUnmount(() => observer?.disconnect())

const VChart = defineAsyncComponent(() => loadChartLibrary())
const resolved = computed<EChartsOption>(() => {
  void themeTick.value
  return props.option(readPalette())
})
</script>

<template>
  <div role="img" :aria-label="label" class="relative w-full" :style="{ height: `${height}px` }">
    <VChart :option="resolved" autoresize class="h-full w-full" />
  </div>
</template>
