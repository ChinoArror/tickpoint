<script setup lang="ts" generic="T extends string">
import { nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { cn } from '@/lib/cn'

/** Segmented control with a sliding indicator (radiogroup semantics). */
const model = defineModel<T>({ required: true })
const props = defineProps<{ options: { value: T; label: string; icon?: Component }[]; label: string; size?: 'sm' | 'md'; class?: string; iconOnly?: boolean }>()
const root = ref<HTMLElement | null>(null)
const indicator = ref({ left: 0, width: 0, ready: false })

function measure() {
  const el = root.value?.querySelector<HTMLElement>('[data-active="true"]')
  if (el) indicator.value = { left: el.offsetLeft, width: el.offsetWidth, ready: true }
}
onMounted(() => nextTick(measure))
// Re-measure when the control resizes (container width changes, fonts load, panes open).
useResizeObserver(root, () => measure())
watch(model, () => nextTick(measure))
watch(() => props.options, () => nextTick(measure), { deep: true })

function onKey(e: KeyboardEvent) {
  const i = props.options.findIndex((o) => o.value === model.value)
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') model.value = props.options[(i + 1) % props.options.length].value
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') model.value = props.options[(i - 1 + props.options.length) % props.options.length].value
  else return
  e.preventDefault()
  nextTick(() => root.value?.querySelector<HTMLElement>('[data-active="true"]')?.focus())
}
</script>

<template>
  <div ref="root" role="radiogroup" :aria-label="label" :class="cn('relative inline-flex rounded-[10px] bg-surface-sunken p-0.5', $props.class)" @keydown="onKey">
    <span
      class="absolute bottom-0.5 top-0.5 rounded-lg bg-surface shadow-sm ring-1 ring-border transition-[left,width] duration-300 ease-[var(--ease-out)]"
      :class="indicator.ready ? 'opacity-100' : 'opacity-0'"
      :style="{ left: `${indicator.left}px`, width: `${indicator.width}px` }"
      aria-hidden="true"
    />
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      :aria-label="iconOnly ? o.label : undefined"
      :title="iconOnly ? o.label : undefined"
      :tabindex="model === o.value ? 0 : -1"
      :data-active="model === o.value"
      class="relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 [&_svg]:size-4"
      :class="[size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]', model === o.value ? 'text-fg' : 'text-muted hover:text-fg']"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" aria-hidden="true" />
      <span v-if="!iconOnly">{{ o.label }}</span>
    </button>
  </div>
</template>
