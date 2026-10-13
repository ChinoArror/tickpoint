<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Quote } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'

/** Quoted source evidence. Clicking it focuses the passage in the source panel. */
defineProps<{ text: string | null | undefined; verified?: boolean; compact?: boolean }>()
const emit = defineEmits<{ focus: [] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="text" class="flex w-full min-w-0 flex-col items-start gap-1">
    <button
      type="button"
      class="group flex max-w-full items-start gap-1.5 rounded-md text-left text-xs text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2"
      :title="t('ai.showInSource')"
      @click="emit('focus')"
    >
      <Quote class="mt-px size-3.5 shrink-0 text-subtle" aria-hidden="true" />
      <span class="line-clamp-3 border-l-2 border-border-strong pl-2 italic decoration-primary/40 group-hover:underline group-hover:underline-offset-2" :class="compact ? 'text-[11px]' : ''">{{ text }}</span>
    </button>
    <span class="sr-only">{{ t('ai.showInSource') }}</span>
    <Badge v-if="verified === false" tone="danger"><AlertTriangle aria-hidden="true" />{{ t('ai.evidenceMissing') }}</Badge>
  </div>
</template>
