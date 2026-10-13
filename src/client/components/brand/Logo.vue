<script setup lang="ts">
withDefaults(defineProps<{ size?: number; wordmark?: boolean }>(), { size: 28, wordmark: true })
</script>

<template>
  <span class="inline-flex items-center gap-2 select-none">
    <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="tp-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="oklch(0.6 0.19 272)" />
          <stop offset="1" stop-color="oklch(0.48 0.21 280)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#tp-g)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="white" stroke-opacity="0.35" stroke-width="2" />
      <path d="M16 7.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" />
      <path d="M12 16.2l2.8 2.8 5.4-6" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="wordmark" class="text-[15px] font-semibold tracking-tight text-fg">Tick<span class="text-primary-text">Point</span></span>
  </span>
</template>
