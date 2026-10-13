<script setup lang="ts">
// One settings line: label and description on the left, the control on the right
// (stacked on narrow screens).
defineProps<{ label: string; description?: string; htmlFor?: string }>()
</script>

<template>
  <div class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
    <div class="min-w-0 sm:max-w-[60%]">
      <label v-if="htmlFor" :for="htmlFor" class="block text-[13px] font-medium text-fg">{{ label }}</label>
      <p v-else class="text-[13px] font-medium text-fg">{{ label }}</p>
      <p v-if="description" class="mt-0.5 text-xs leading-relaxed text-muted">{{ description }}</p>
    </div>
    <div class="min-w-0 sm:flex sm:shrink-0 sm:justify-end">
      <slot />
    </div>
  </div>
</template>
