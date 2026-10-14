<script setup lang="ts">
import { activities } from '@/composables/useActivity'
import Spinner from '@/components/ui/Spinner.vue'

const percent = (p: number | null) => (p == null ? '' : `${p}%`)
</script>

<template>
  <div class="flex w-full flex-col items-stretch gap-2 md:items-end">
    <TransitionGroup name="pop" tag="div" class="flex w-full flex-col items-stretch gap-2 md:items-end">
      <div
        v-for="a in activities"
        :key="a.id"
        role="status"
        aria-live="polite"
        class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[11px] border border-border/80 bg-surface-raised/95 px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_36px_-18px_rgb(0_0_0/0.5)] backdrop-blur-xl"
      >
        <Spinner class="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 truncate text-[13px] text-fg">{{ a.label }}</p>
            <span v-if="a.progress != null" class="font-mono tabular-nums shrink-0 text-xs text-muted">{{ percent(a.progress) }}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              v-if="a.progress != null"
              class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              :style="{ width: `${a.progress}%` }"
            />
            <div v-else class="activity-indeterminate h-full w-1/3 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
