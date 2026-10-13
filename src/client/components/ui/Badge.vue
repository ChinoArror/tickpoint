<script setup lang="ts">
import { cn } from '@/lib/cn'

withDefaults(defineProps<{ tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai'; size?: 'sm' | 'md'; class?: string; dot?: boolean }>(), {
  tone: 'neutral',
  size: 'sm',
})
const tones: Record<string, string> = {
  neutral: 'bg-surface-sunken text-muted border-border',
  primary: 'bg-primary-soft text-primary-text border-transparent',
  success: 'bg-success-soft text-success-text border-transparent',
  warning: 'bg-warning-soft text-warning-text border-transparent',
  danger: 'bg-danger-soft text-danger-text border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  ai: 'bg-ai-soft text-ai border-transparent',
}
const dots: Record<string, string> = {
  neutral: 'bg-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  ai: 'bg-ai',
}
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        tones[tone],
        $props.class,
      )
    "
  >
    <span v-if="dot" class="size-1.5 rounded-full" :class="dots[tone]" aria-hidden="true" />
    <slot />
  </span>
</template>
