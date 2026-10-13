<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Bell, FlaskConical, Info } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import type { AppNotification } from '@/lib/types'
import SnoozeMenu from './SnoozeMenu.vue'

const props = defineProps<{ item: AppNotification }>()
const emit = defineEmits<{ navigate: [] }>()
const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const f = useFormat()
const now = useNow()

const unread = computed(() => props.item.readAt == null)
const icon = computed(() => (props.item.type === 'reminder' ? Bell : props.item.type === 'test' ? FlaskConical : Info))
const tone = computed(() =>
  props.item.type === 'reminder' ? 'bg-primary-soft text-primary-text' : props.item.type === 'test' ? 'bg-info-soft text-info' : 'bg-surface-sunken text-muted',
)
/** Only same-origin paths are followed. */
const safeLink = computed(() => {
  const l = props.item.link
  return l && l.startsWith('/') && !l.startsWith('//') ? l : null
})

async function open() {
  if (unread.value) {
    try {
      await api.post(`/notifications/${props.item.id}/read`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    } catch {
      /* the list refreshes on the next poll */
    }
  }
  if (safeLink.value) router.push(safeLink.value)
  emit('navigate')
}
</script>

<template>
  <div class="relative flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-surface-hover">
    <span class="grid size-8 shrink-0 place-items-center rounded-lg" :class="tone" aria-hidden="true"><component :is="icon" class="size-4" /></span>
    <button type="button" class="min-w-0 flex-1 rounded-md text-left after:absolute after:inset-0 after:rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]" @click="open">
      <span class="flex items-center gap-2">
        <span v-if="unread" class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <span v-if="unread" class="sr-only">{{ t('notificationsPanel.unread') }}</span>
        <span class="min-w-0 truncate text-[13px]" :class="unread ? 'font-semibold text-fg' : 'font-medium text-muted'">{{ item.title }}</span>
      </span>
      <span v-if="item.body" class="mt-0.5 line-clamp-2 block text-xs text-muted">{{ item.body }}</span>
      <span class="mt-1 block text-[11px] text-subtle">{{ f.relativeTime(item.createdAt, now) }}</span>
    </button>
    <div v-if="item.jobId" class="relative z-10 shrink-0">
      <SnoozeMenu :job-id="item.jobId" />
    </div>
  </div>
</template>
