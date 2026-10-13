<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon?: Component; title: string; description?: string; compact?: boolean }>()
</script>

<template>
  <div class="flex animate-fade-up flex-col items-center justify-center text-center" :class="compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-14'">
    <div v-if="icon" class="relative grid place-items-center rounded-2xl bg-primary-softer text-primary-text" :class="compact ? 'size-10' : 'size-14'">
      <component :is="icon" :class="compact ? 'size-5' : 'size-7'" aria-hidden="true" />
      <span class="absolute -right-1 -top-1 size-3 rounded-full bg-primary/20" aria-hidden="true" />
    </div>
    <div class="max-w-sm">
      <p class="font-semibold text-fg" :class="compact ? 'text-[13px]' : 'text-[15px]'">{{ title }}</p>
      <p v-if="description" class="mt-1 text-[13px] text-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="mt-1 flex flex-wrap justify-center gap-2"><slot /></div>
  </div>
</template>
