<script setup lang="ts" generic="T extends string | number | null">
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/cn'

defineOptions({ inheritAttrs: false })
const model = defineModel<T>()
defineProps<{ options: { value: T; label: string; disabled?: boolean }[]; invalid?: boolean; class?: string; size?: 'sm' | 'md' }>()
</script>

<template>
  <div :class="cn('relative', $props.class)">
    <select
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :class="
        cn(
          'w-full appearance-none rounded-[10px] border border-border bg-surface pl-3 pr-8 text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-[var(--focus-ring)]',
          size === 'sm' ? 'h-8 text-[13px]' : 'h-9',
        )
      "
    >
      <option v-for="o in options" :key="String(o.value)" :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
    </select>
    <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
  </div>
</template>
