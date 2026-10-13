<script setup lang="ts">
import { cn } from '@/lib/cn'

// Boolean props default to false in Vue, so padding must default explicitly to true.
withDefaults(defineProps<{ title?: string; subtitle?: string; class?: string; padded?: boolean; interactive?: boolean }>(), { padded: true })
</script>

<template>
  <section
    :class="
      cn(
        'rounded-[var(--radius-lg)] border border-border bg-surface shadow-xs',
        interactive && 'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md',
        $props.class,
      )
    "
  >
    <header v-if="title || $slots.header || $slots.actions" class="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1">
      <slot name="header">
        <div class="min-w-0">
          <h2 class="truncate text-[13px] font-semibold text-fg">{{ title }}</h2>
          <p v-if="subtitle" class="line-clamp-2 text-xs text-subtle">{{ subtitle }}</p>
        </div>
      </slot>
      <div class="flex shrink-0 items-center gap-1"><slot name="actions" /></div>
    </header>
    <div :class="padded ? 'p-4 pt-2' : ''"><slot /></div>
  </section>
</template>
