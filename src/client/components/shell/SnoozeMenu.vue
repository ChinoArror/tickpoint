<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryClient } from '@tanstack/vue-query'
import { AlarmClock } from 'lucide-vue-next'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useErrorMessage } from '@/composables/useTasks'

const props = defineProps<{ jobId: string }>()
const { t } = useI18n()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()

const presets = [
  { key: '15m', minutes: 15 },
  { key: '1h', minutes: 60 },
  { key: '3h', minutes: 180 },
  { key: 'tomorrow', minutes: 1440 },
] as const

async function snooze(minutes: number) {
  try {
    await api.post(`/reminders/jobs/${props.jobId}/snooze`, { minutes })
    toast.success(t('notificationsPanel.snoozed'))
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['reminders'] })
  } catch (e) {
    toast.error(errMsg(e))
  }
}

const items = computed<MenuItem[]>(() => [
  { heading: t('notificationsPanel.snooze.heading') },
  ...presets.map((p) => ({ label: t(`notificationsPanel.snooze.${p.key}`), onSelect: () => snooze(p.minutes) })),
])
</script>

<template>
  <Menu :items="items" width="180px" align="end">
    <IconButton :label="t('notificationsPanel.snooze.aria')" size="sm"><AlarmClock /></IconButton>
  </Menu>
</template>
