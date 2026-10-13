<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery } from '@tanstack/vue-query'
import { Infinity as UnlimitedIcon, RefreshCw } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api } from '@/lib/api'
import type { AiQuota } from '@/lib/types'
import { useFormat } from '@/composables/useFormat'

const { t, te } = useI18n()
const f = useFormat()

const quota = useQuery({
  queryKey: ['ai', 'quota'],
  queryFn: ({ signal }) => api.get<AiQuota>('/ai/quota', undefined, signal),
  staleTime: 30_000,
})

const data = computed(() => quota.data.value)
const statusKey = computed(() => data.value?.status ?? 'NOT_CONFIGURED')

type Tone = 'success' | 'warning' | 'danger' | 'neutral'
const TONES: Record<string, Tone> = {
  ok: 'success',
  QUOTA_EXCEEDED: 'warning',
  AI_FORBIDDEN: 'danger',
  QUOTA_CHECK_FAILED: 'warning',
  NOT_CONFIGURED: 'neutral',
}
const tone = computed<Tone>(() => TONES[statusKey.value] ?? 'neutral')
const statusLabel = computed(() => {
  const key = `aiQuota.status.${statusKey.value}`
  return te(key) ? t(key) : statusKey.value
})
const statusHint = computed(() => {
  const key = `aiQuota.statusHint.${statusKey.value}`
  return te(key) ? t(key) : ''
})

function valueOf(n: number | null | undefined): string {
  if (data.value?.unlimited) return t('aiQuota.unlimited')
  if (n == null) return t('aiQuota.unknown')
  return f.number(n, 0)
}

const retryText = computed(() => {
  const s = data.value?.details?.retryAfterSeconds
  if (!s || s <= 0) return null
  return t('aiQuota.retryIn', { time: f.minutes(Math.max(1, Math.ceil(s / 60))) })
})
</script>

<template>
  <Card :title="t('aiQuota.title')" :subtitle="t('aiQuota.subtitle')" :padded="true">
    <template #actions>
      <IconButton :label="t('aiQuota.refresh')" size="sm" @click="quota.refetch()">
        <RefreshCw class="size-4" :class="quota.isFetching.value && 'animate-spin'" aria-hidden="true" />
      </IconButton>
    </template>

    <Skeleton v-if="quota.isPending.value" :rows="3" height="32px" />
    <p v-else-if="quota.isError.value" class="text-sm text-danger-text" role="alert">{{ t('errors.loadFailed') }}</p>
    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <div>
          <Badge :tone="tone" size="md" dot>{{ statusLabel }}</Badge>
        </div>
        <p v-if="statusHint" class="text-xs leading-relaxed text-muted">{{ statusHint }}</p>
        <p v-if="retryText" class="text-xs text-muted">{{ retryText }}</p>
      </div>

      <dl class="grid grid-cols-2 gap-3">
        <div class="rounded-xl bg-surface-sunken p-3">
          <dt class="text-xs text-muted">{{ t('aiQuota.remainingTokens') }}</dt>
          <dd class="tabular mt-1 flex items-center gap-1.5 text-lg font-semibold text-fg">
            <UnlimitedIcon v-if="data?.unlimited" class="size-4 text-muted" aria-hidden="true" />{{ valueOf(data?.remainingTokens) }}
          </dd>
        </div>
        <div class="rounded-xl bg-surface-sunken p-3">
          <dt class="text-xs text-muted">{{ t('aiQuota.remainingRequests') }}</dt>
          <dd class="tabular mt-1 flex items-center gap-1.5 text-lg font-semibold text-fg">
            <UnlimitedIcon v-if="data?.unlimited" class="size-4 text-muted" aria-hidden="true" />{{ valueOf(data?.remainingRequests) }}
          </dd>
        </div>
      </dl>

      <p v-if="data?.testSession" class="rounded-xl bg-info-soft px-3 py-2 text-xs text-info" role="status">{{ t('aiQuota.testSession') }}</p>

      <div class="rounded-xl border border-border p-3">
        <h3 class="text-[13px] font-semibold text-fg">{{ t('aiQuota.localTitle') }}</h3>
        <p class="mt-0.5 text-xs text-muted">{{ t('aiQuota.localHint') }}</p>
        <ul class="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg">
          <li>{{ t('aiQuota.localPerHour', { count: f.number(data?.local.requestsPerHour ?? 0, 0) }) }}</li>
          <li>{{ t('aiQuota.localPerDay', { count: f.number(data?.local.requestsPerDay ?? 0, 0) }) }}</li>
        </ul>
      </div>
    </div>
  </Card>
</template>
