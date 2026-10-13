<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { Bell } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useErrorMessage } from '@/composables/useTasks'
import type { AppNotification } from '@/lib/types'
import NotificationItem from './NotificationItem.vue'

defineProps<{ items: AppNotification[]; unread: number }>()
const emit = defineEmits<{ navigate: [] }>()
const { t } = useI18n()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()

const readAll = useMutation({
  mutationFn: () => api.post('/notifications/read-all'),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  onError: (e) => toast.error(errMsg(e)),
})
</script>

<template>
  <section class="flex flex-col" :aria-label="t('notifications.title')">
    <header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <h2 class="text-[13px] font-semibold text-fg">{{ t('notifications.title') }}</h2>
      <Button variant="ghost" size="xs" :disabled="unread === 0" :loading="readAll.isPending.value" @click="readAll.mutate()">{{ t('notificationsPanel.markAllRead') }}</Button>
    </header>
    <div class="max-h-[420px] overflow-y-auto p-1.5">
      <ul v-if="items.length" class="flex flex-col">
        <li v-for="n in items" :key="n.id">
          <NotificationItem :item="n" @navigate="emit('navigate')" />
        </li>
      </ul>
      <EmptyState v-else compact :icon="Bell" :title="t('notificationsPanel.emptyTitle')" :description="t('notificationsPanel.emptyHint')" />
    </div>
    <footer class="border-t border-border p-1.5">
      <RouterLink to="/notifications" class="flex h-9 items-center justify-center rounded-lg text-[13px] font-medium text-primary-text transition hover:bg-surface-hover" @click="emit('navigate')">
        {{ t('common.viewAll') }}
      </RouterLink>
    </footer>
  </section>
</template>
