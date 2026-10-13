<script setup lang="ts">
import { cn } from '@/lib/cn'

defineOptions({ inheritAttrs: false })
const model = defineModel<string | number | null>()
defineProps<{ invalid?: boolean; class?: string; size?: 'sm' | 'md' }>()
</script>

<template>
  <input
    v-model="model"
    v-bind="$attrs"
    :aria-invalid="invalid || undefined"
    :class="
      cn(
        'w-full min-w-0 rounded-[10px] border border-border bg-surface px-3 text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-[var(--focus-ring)] disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus:ring-danger/25',
        size === 'sm' ? 'h-8 text-[13px]' : 'h-9',
        $props.class,
      )
    "
  />
</template>
