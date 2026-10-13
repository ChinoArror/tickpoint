<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Flag } from 'lucide-vue-next'

defineProps<{ priority: string; withLabel?: boolean }>()
const { t } = useI18n()
const colors: Record<string, string> = { urgent: 'text-danger fill-danger', high: 'text-warning fill-warning', medium: 'text-primary', low: 'text-info', none: 'text-subtle' }
</script>

<template>
  <span v-if="priority !== 'none' || withLabel" class="inline-flex items-center gap-1 text-xs text-muted" :title="t(`priority.${priority}`)">
    <Flag class="size-3.5" :class="colors[priority]" aria-hidden="true" />
    <span :class="withLabel ? '' : 'sr-only'">{{ t(`priority.${priority}`) }}</span>
  </span>
</template>
