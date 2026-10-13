<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'
import { Bell, CalendarClock } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import NotificationItem from '@/components/shell/NotificationItem.vue'
import SnoozeMenu from '@/components/shell/SnoozeMenu.vue'
import { api } from '@/lib/api'
import { useFormat } from '@/composables/useFormat'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import type { AppNotification } from '@/lib/types'

interface NotificationPage {
  items: AppNotification[]
  unread: number
}

interface UpcomingReminder {
  jobId: string | null
  title: string
  fireAt: number
  link: string | null
}

const PAGE_SIZE = 30
const { t } = useI18n()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()
const unreadOnly = ref(false)

const history = useInfiniteQuery({
  queryKey: computed(() => ['notifications', 'history', unreadOnly.value]),
  queryFn: ({ pageParam }) =>
    api.get<NotificationPage>('/notifications', { before: pageParam, unread: unreadOnly.value ? 1 : undefined, limit: PAGE_SIZE }),
  initialPageParam: undefined as number | undefined,
  getNextPageParam: (last) => (last.items.length >= PAGE_SIZE ? last.items[last.items.length - 1].createdAt : undefined),
})
const items = computed(() => history.data.value?.pages.flatMap((p) => p.items) ?? [])

const upcoming = useQuery({
  queryKey: ['reminders', 'upcoming'],
  queryFn: async () => {
    const raw = await api.get<UpcomingReminder[] | { items?: UpcomingReminder[] }>('/reminders/upcoming')
    return Array.isArray(raw) ? raw : (raw.items ?? [])
  },
})

async function loadMore() {
  try {
    await history.fetchNextPage()
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('notifications.title') }}</h1>
        <p class="mt-1 text-[13px] text-muted">{{ t('notificationsPage.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2.5 text-[13px] font-medium text-fg">
        <Switch v-model="unreadOnly" :label="t('notificationsPage.unreadOnly')" />
        <span>{{ t('notificationsPage.unreadOnly') }}</span>
      </div>
    </header>

    <!-- Upcoming reminders -->
    <Card class="mt-6" :padded="false">
      <template #header>
        <div class="flex items-center gap-2">
          <CalendarClock class="size-4 text-primary" aria-hidden="true" />
          <h2 class="text-[13px] font-semibold">{{ t('notificationsPage.upcoming') }}</h2>
        </div>
      </template>
      <div class="px-2 pb-2">
        <Skeleton v-if="upcoming.isPending.value" :rows="2" height="48px" class="p-2" />
        <ul v-else-if="upcoming.data.value?.length" class="flex flex-col">
          <li v-for="r in upcoming.data.value" :key="`${r.jobId ?? ''}-${r.fireAt}-${r.title}`" class="flex items-center gap-3 rounded-xl px-2.5 py-2">
            <div class="min-w-0 flex-1">
              <RouterLink v-if="r.link && r.link.startsWith('/') && !r.link.startsWith('//')" :to="r.link" class="block truncate text-[13px] font-medium text-fg hover:underline">{{ r.title }}</RouterLink>
              <p v-else class="truncate text-[13px] font-medium text-fg">{{ r.title }}</p>
              <p class="tabular text-xs text-muted">{{ f.dateTime(r.fireAt) }}</p>
            </div>
            <SnoozeMenu v-if="r.jobId" :job-id="r.jobId" />
          </li>
        </ul>
        <EmptyState v-else compact :icon="CalendarClock" :title="t('notificationsPage.upcomingEmpty')" />
      </div>
    </Card>

    <!-- History -->
    <section class="mt-8" :aria-label="t('notificationsPage.history')">
      <h2 class="mb-2 px-1 text-[13px] font-semibold text-muted">{{ t('notificationsPage.history') }}</h2>
      <Card :padded="false">
        <div class="p-1.5">
          <Skeleton v-if="history.isPending.value" :rows="4" height="60px" class="p-2" />
          <ul v-else-if="items.length" class="flex flex-col">
            <li v-for="n in items" :key="n.id">
              <NotificationItem :item="n" />
            </li>
          </ul>
          <EmptyState v-else :icon="Bell" :title="unreadOnly ? t('notificationsPage.noUnread') : t('notificationsPanel.emptyTitle')" :description="t('notificationsPanel.emptyHint')" />
        </div>
        <div v-if="history.hasNextPage.value" class="flex justify-center border-t border-border p-3">
          <Button variant="secondary" size="sm" :loading="history.isFetchingNextPage.value" @click="loadMore">{{ t('notificationsPage.loadMore') }}</Button>
        </div>
      </Card>
    </section>
  </div>
</template>
