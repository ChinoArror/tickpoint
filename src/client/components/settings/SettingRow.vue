<script setup lang="ts">
// One settings line. Default: label/description left, compact control right (also on
// phones, so switches and selects stay inline). `stacked` puts wide controls such as
// chip groups or time ranges below the label at every width.
withDefaults(defineProps<{ label: string; description?: string; htmlFor?: string; stacked?: boolean }>(), { stacked: false })
</script>

<template>
  <div class="py-4 first:pt-0 last:pb-0" :class="stacked ? 'flex flex-col gap-3' : 'flex items-start justify-between gap-4 sm:gap-8'">
    <div class="min-w-0 flex-1">
      <label v-if="htmlFor" :for="htmlFor" class="block text-[13px] font-medium text-fg">{{ label }}</label>
      <p v-else class="text-[13px] font-medium text-fg">{{ label }}</p>
      <p v-if="description" class="mt-0.5 text-xs leading-relaxed text-muted">{{ description }}</p>
      <!-- Status notes about the control (warnings, platform hints) read best under the label. -->
      <div v-if="$slots.note" class="mt-2 flex flex-col gap-1.5"><slot name="note" /></div>
    </div>
    <div :class="stacked ? 'min-w-0' : 'flex min-w-0 max-w-[58%] shrink-0 justify-end'">
      <slot />
    </div>
  </div>
</template>
