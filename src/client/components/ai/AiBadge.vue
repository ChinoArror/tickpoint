<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Sparkles } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'

/** Marks any AI-generated content as an unconfirmed draft. */
const { t } = useI18n()
</script>

<template>
  <Badge tone="ai"><Sparkles aria-hidden="true" />{{ t('ai.unconfirmed') }}</Badge>
</template>
