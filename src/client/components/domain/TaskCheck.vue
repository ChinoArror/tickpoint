<script setup lang="ts">
import { ref, watch } from 'vue'

/** Round completion checkbox with a draw-in check and a soft burst on completion. */
const props = withDefaults(defineProps<{ checked: boolean; label: string; priority?: string; size?: 'sm' | 'md'; disabled?: boolean; shape?: 'circle' | 'diamond' }>(), { size: 'md', shape: 'circle' })
const emit = defineEmits<{ toggle: [] }>()
const burst = ref(false)
watch(
  () => props.checked,
  (v, old) => {
    if (v && !old) {
      burst.value = true
      setTimeout(() => (burst.value = false), 600)
    }
  },
)
const ring: Record<string, string> = {
  urgent: 'border-danger',
  high: 'border-warning',
  medium: 'border-primary',
  low: 'border-info',
  none: 'border-border-strong',
}
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="label"
    :disabled="disabled"
    class="group relative grid shrink-0 place-items-center transition-transform duration-150 active:scale-90 disabled:opacity-50"
    :class="size === 'sm' ? 'size-[18px]' : 'size-5'"
    @click.stop="emit('toggle')"
  >
    <span
      class="absolute inset-0 border-[1.5px] transition-[background-color,border-color,transform] duration-300 ease-[var(--ease-spring)]"
      :class="[
        shape === 'diamond' ? 'rotate-45 scale-[0.82] rounded-[4px]' : 'rounded-full',
        checked ? 'border-success bg-success' : [ring[priority ?? 'none'], 'bg-surface group-hover:bg-success-soft'],
      ]"
    />
    <svg viewBox="0 0 16 16" class="relative size-[70%]" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="stroke-white transition-[stroke-dashoffset] delay-75 duration-300 ease-[var(--ease-out)]"
        stroke-dasharray="16"
        :stroke-dashoffset="checked ? 0 : 16"
      />
    </svg>
    <span v-if="burst" class="pointer-events-none absolute inset-[-6px] animate-[ping_0.6s_var(--ease-out)_1] rounded-full border-2 border-success/60" aria-hidden="true" />
  </button>
</template>
