<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useInfiniteQuery } from '@tanstack/vue-query'
import { Activity, Bell, CheckCircle2, FileText, FolderKanban, ListChecks, Sparkles, Tag, Target } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api } from '@/lib/api'
import { useFormat } from '@/composables/useFormat'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { useUiStore } from '@/stores/ui'
import { isoDateInZone } from '@shared/time'

interface ActivityItem {
  id: string
  action: string
  entityType: string
  entityId: string | null
  actor: 'user' | 'ai_confirmed' | 'system' | 'import' | string
  title?: string | null
  createdAt: number
}

const PAGE_SIZE = 40
const { t, te } = useI18n()
const router = useRouter()
const ui = useUiStore()
const f = useFormat()
const errMsg = useErrorMessage()
const toast = useToast()

const feed = useInfiniteQuery({
  queryKey: ['activity'],
  queryFn: async ({ pageParam }) => {
    const raw = await api.get<ActivityItem[] | { items: ActivityItem[] }>('/activity', { before: pageParam, limit: PAGE_SIZE })
    return Array.isArray(raw) ? raw : raw.items
  },
  initialPageParam: undefined as number | undefined,
  getNextPageParam: (last) => (last.length >= PAGE_SIZE ? last[last.length - 1].createdAt : undefined),
})

const items = computed(() => feed.data.value?.pages.flat() ?? [])

/** Chronological feed grouped by calendar day in the user's time zone. */
const days = computed(() => {
  const map = new Map<string, ActivityItem[]>()
  for (const it of items.value) {
    const day = isoDateInZone(it.createdAt, f.tz.value)
    const bucket = map.get(day)
    if (bucket) bucket.push(it)
    else map.set(day, [it])
  }
  return [...map].map(([day, list]) => ({ day, list }))
})

const entityIcons: Record<string, Component> = {
  task: ListChecks,
  deadline: ListChecks,
  goal: Target,
  project: FolderKanban,
  checkpoint: CheckCircle2,
  reminder: Bell,
  source: FileText,
  tag: Tag,
  plan: Sparkles,
}
const iconFor = (type: string): Component => entityIcons[type] ?? Activity

function actionLabel(action: string) {
  const key = `history.action.${action}`
  return te(key) ? t(key) : action.replace(/_/g, ' ')
}
function entityLabel(type: string) {
  const key = `activity.entity.${type}`
  return te(key) ? t(key) : type
}

const clickable = (it: ActivityItem) => !!it.entityId && ['task', 'deadline', 'goal'].includes(it.entityType)

function open(it: ActivityItem) {
  if (!it.entityId) return
  if (it.entityType === 'task' || it.entityType === 'deadline') ui.openTask(it.entityId)
  else if (it.entityType === 'goal') void router.push(`/goals/${it.entityId}`)
}

async function loadMore() {
  try {
    await feed.fetchNextPage()
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
    <header class="animate-fade-up">
      <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('activity.title') }}</h1>
      <p class="mt-1 text-[13px] text-muted">{{ t('activity.subtitle') }}</p>
    </header>

    <div class="mt-6">
      <Skeleton v-if="feed.isPending.value" :rows="5" height="56px" />

      <EmptyState v-else-if="!items.length" :icon="Activity" :title="t('activity.emptyTitle')" :description="t('activity.emptyHint')" />

      <div v-else class="flex flex-col gap-6">
        <section v-for="d in days" :key="d.day" :aria-label="f.relativeDay(d.day)">
          <h2 class="sticky top-[var(--topbar-h)] z-10 mb-2 bg-bg/90 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle backdrop-blur">{{ f.relativeDay(d.day) }}</h2>
          <Card :padded="false">
            <ol class="flex flex-col p-1.5">
              <li v-for="it in d.list" :key="it.id" class="flex items-start gap-3 rounded-xl px-2.5 py-2.5">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted" aria-hidden="true"><component :is="iconFor(it.entityType)" class="size-4" /></span>
                <div class="min-w-0 flex-1">
                  <button v-if="clickable(it)" type="button" class="block w-full min-w-0 rounded-md text-left transition hover:text-primary-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]" @click="open(it)">
                    <span class="block truncate text-[13px] font-medium text-fg">{{ actionLabel(it.action) }}</span>
                    <span v-if="it.title" class="block truncate text-xs text-muted">{{ it.title }}</span>
                  </button>
                  <div v-else class="min-w-0">
                    <span class="block truncate text-[13px] font-medium text-fg">{{ actionLabel(it.action) }}</span>
                    <span v-if="it.title" class="block truncate text-xs text-muted">{{ it.title }}</span>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge size="sm">{{ entityLabel(it.entityType) }}</Badge>
                    <Badge v-if="it.actor === 'ai_confirmed'" tone="ai" size="sm">{{ t('activity.actor.ai_confirmed') }}</Badge>
                    <Badge v-else-if="it.actor === 'import'" tone="info" size="sm">{{ t('activity.actor.import') }}</Badge>
                    <Badge v-else-if="it.actor === 'system'" size="sm">{{ t('activity.actor.system') }}</Badge>
                  </div>
                </div>
                <time class="tabular shrink-0 pt-0.5 text-xs text-subtle" :datetime="new Date(it.createdAt).toISOString()">{{ f.time(it.createdAt) }}</time>
              </li>
            </ol>
          </Card>
        </section>

        <div v-if="feed.hasNextPage.value" class="flex justify-center">
          <Button variant="secondary" size="sm" :loading="feed.isFetchingNextPage.value" @click="loadMore">{{ t('activity.loadMore') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
