<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

/** Collapsible section used by the task detail view. */
const props = withDefaults(defineProps<{ title: string; count?: number | null; defaultOpen?: boolean }>(), { defaultOpen: true })
const uid = useId()
const open = ref(props.defaultOpen)
</script>

<template>
  <section class="border-t border-border pt-4">
    <h3>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md text-left text-[13px] font-semibold text-fg outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]"
        :aria-expanded="open"
        :aria-controls="`${uid}-body`"
        @click="open = !open"
      >
        <ChevronDown class="size-4 shrink-0 text-subtle transition-transform duration-200" :class="!open && '-rotate-90'" aria-hidden="true" />
        <span>{{ title }}</span>
        <span v-if="count" class="tabular rounded-full bg-surface-sunken px-1.5 text-[11px] font-medium text-muted">{{ count }}</span>
      </button>
    </h3>
    <div v-show="open" :id="`${uid}-body`" class="mt-3">
      <slot />
    </div>
  </section>
</template>
