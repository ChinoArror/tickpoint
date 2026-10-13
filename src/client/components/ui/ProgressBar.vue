<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'

const props = withDefaults(defineProps<{ value: number; max?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'ai'; size?: 'xs' | 'sm' | 'md'; label?: string; class?: string; expected?: number | null }>(), {
  max: 100,
  tone: 'primary',
  size: 'sm',
})
const pct = computed(() => Math.min(100, Math.max(0, (props.value / (props.max || 1)) * 100)))
const exp = computed(() => (props.expected == null ? null : Math.min(100, Math.max(0, props.expected))))
const fills: Record<string, string> = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', ai: 'bg-ai' }
</script>

<template>
  <div
    role="progressbar"
    :aria-valuenow="Math.round(pct)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label"
    :class="cn('relative w-full overflow-hidden rounded-full bg-surface-sunken', size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2.5', $props.class)"
  >
    <div class="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out)]" :class="fills[tone]" :style="{ width: `${pct}%` }" />
    <div v-if="exp != null" class="absolute top-0 h-full w-0.5 bg-fg/40" :style="{ left: `calc(${exp}% - 1px)` }" aria-hidden="true" />
  </div>
</template>
