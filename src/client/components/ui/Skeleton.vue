<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; height?: string }>(), { rows: 3, height: '44px' })
</script>

<template>
  <div class="flex flex-col gap-2" aria-busy="true" aria-live="polite">
    <div v-for="i in rows" :key="i" class="skeleton" :style="{ height, opacity: 1 - (i - 1) * 0.15 }" />
  </div>
</template>
