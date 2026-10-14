<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Segmented from '@/components/ui/Segmented.vue'
import { cn } from '@/lib/cn'
import type { Locale } from '@shared/constants'

/** Choose the language AI-written text is produced in (Smart Capture, plans, analysis). */
const model = defineModel<Locale>({ required: true })
const props = defineProps<{ class?: string; hint?: boolean }>()
const { t } = useI18n()
const label = computed(() => t('aiLanguage.label'))
const options = computed<{ value: Locale; label: string }[]>(() => [
  { value: 'en', label: t('aiLanguage.english') },
  { value: 'ja', label: t('aiLanguage.japanese') },
])
</script>

<template>
  <div :class="cn('flex min-w-0 flex-col gap-1', props.class)">
    <div class="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5">
      <span class="text-xs font-medium text-muted">{{ label }}</span>
      <Segmented v-model="model" size="sm" :options="options" :label="label" class="max-w-full" />
    </div>
    <p v-if="hint" class="text-xs text-subtle">{{ t('aiLanguage.hint') }}</p>
  </div>
</template>
