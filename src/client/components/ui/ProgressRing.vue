<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; size?: number; stroke?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'ai'; label?: string; showValue?: boolean }>(), {
  size: 40,
  stroke: 4,
  tone: 'primary',
  showValue: true,
})
const r = computed(() => (props.size - props.stroke) / 2)
const c = computed(() => 2 * Math.PI * r.value)
const pct = computed(() => Math.min(100, Math.max(0, props.value)))
const offset = computed(() => c.value * (1 - pct.value / 100))
const colors: Record<string, string> = { primary: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', ai: 'var(--ai)' }
</script>

<template>
  <div class="relative inline-grid shrink-0 place-items-center" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="label ?? `${Math.round(pct)}%`">
    <svg :width="size" :height="size" class="-rotate-90">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--surface-sunken)" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        :stroke="colors[tone]"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="c"
        :stroke-dashoffset="offset"
        class="transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-out)]"
      />
    </svg>
    <span v-if="showValue" class="tabular absolute text-[10px] font-semibold text-fg" :style="{ fontSize: `${Math.max(9, size / 4)}px` }">{{ Math.round(pct) }}<span class="text-subtle">%</span></span>
  </div>
</template>
