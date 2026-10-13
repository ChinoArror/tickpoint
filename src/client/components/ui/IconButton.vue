<script setup lang="ts">
import { cn } from '@/lib/cn'

withDefaults(defineProps<{ label: string; size?: 'sm' | 'md'; active?: boolean; class?: string }>(), { size: 'md' })
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :class="
      cn(
        'inline-grid shrink-0 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-hover hover:text-fg active:scale-90 disabled:opacity-40',
        size === 'sm' ? 'size-7 [&_svg]:size-4' : 'size-9 [&_svg]:size-[18px]',
        active && 'bg-surface-hover text-fg',
        $props.class,
      )
    "
  >
    <slot />
  </button>
</template>
