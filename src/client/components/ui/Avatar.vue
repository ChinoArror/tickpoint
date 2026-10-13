<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ src?: string | null; name?: string | null; size?: number }>(), { size: 32 })
const failed = ref(false)
const initials = computed(() =>
  (props.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
)
</script>

<template>
  <span class="inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary-text ring-2 ring-surface" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.38}px` }">
    <img v-if="src && !failed" :src="src" alt="" class="size-full object-cover" referrerpolicy="no-referrer" @error="failed = true" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
