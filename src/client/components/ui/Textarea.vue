<script setup lang="ts">
import { cn } from '@/lib/cn'

defineOptions({ inheritAttrs: false })
const model = defineModel<string | null>()
defineProps<{ invalid?: boolean; class?: string }>()
</script>

<template>
  <textarea
    v-model="model"
    v-bind="$attrs"
    :aria-invalid="invalid || undefined"
    :class="
      cn(
        'w-full min-w-0 resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-[var(--focus-ring)] aria-invalid:border-danger',
        $props.class,
      )
    "
  />
</template>
