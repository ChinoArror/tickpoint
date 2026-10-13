<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery } from '@tanstack/vue-query'
import { ShieldCheck } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import SettingRow from './SettingRow.vue'
import AiQuotaCard from './AiQuotaCard.vue'
import { useSettingSave } from './useSettingSave'
import { api } from '@/lib/api'
import { useFormat } from '@/composables/useFormat'

interface UsageTotal {
  operation: string
  requests?: number
  tokens?: number
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
}
interface UsageRecent {
  id?: string
  operation: string
  status?: string | null
  createdAt?: number
  tokens?: number
  totalTokens?: number
  model?: string | null
}
interface AiUsage {
  totals?: UsageTotal[]
  recent?: UsageRecent[]
  model?: string | null
}

const { t, te } = useI18n()
const { save, field, session } = useSettingSave()
const f = useFormat()

const aiEnabled = field('aiEnabled')
const saveSource = field('aiSaveSourceDefault')
const planningStyle = field('aiPlanningStyle')
const styleOptions = computed(() =>
  (['balanced', 'front_loaded', 'steady'] as const).map((s) => ({ value: s, label: t(`settingsPage.ai.styles.${s}`) })),
)

// Hours per day: 0.5 to 16 in half-hour steps. Validated on commit like the estimate field.
const hoursDraft = ref('')
const hoursError = ref<string | null>(null)
watch(
  () => session.settings?.aiAvailableHoursPerDay,
  (v) => {
    hoursDraft.value = v == null ? '' : String(v)
    hoursError.value = null
  },
  { immediate: true },
)
function commitHours() {
  const n = Number(hoursDraft.value.trim())
  const current = session.settings?.aiAvailableHoursPerDay
  if (!Number.isFinite(n) || n < 0.5 || n > 16 || !Number.isInteger(n * 2)) {
    hoursError.value = t('settingsPage.ai.hoursInvalid')
    return
  }
  hoursError.value = null
  if (n !== current) void save({ aiAvailableHoursPerDay: n })
}

const usage = useQuery({
  queryKey: ['ai', 'usage'],
  queryFn: ({ signal }) => api.get<AiUsage>('/ai/usage', undefined, signal),
})

const totals = computed(() => usage.data.value?.totals ?? [])
const recent = computed(() => usage.data.value?.recent ?? [])
const tokensOf = (r: { tokens?: number; totalTokens?: number; inputTokens?: number; outputTokens?: number }) =>
  r.totalTokens ?? r.tokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
function opLabel(op: string) {
  const key = `settingsPage.ai.operations.${op}`
  return te(key) ? t(key) : op
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card :title="t('settingsPage.ai.title')" :subtitle="t('settingsPage.ai.subtitle')" :padded="true">
      <p v-if="session.config?.aiConfigured === false" class="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-text" role="status">{{ t('settingsPage.ai.notConfigured') }}</p>
      <div class="divide-y divide-border">
        <SettingRow :label="t('settingsPage.ai.enabled')" :description="t('settingsPage.ai.enabledHint')">
          <Switch v-model="aiEnabled" :label="t('settingsPage.ai.enabled')" />
        </SettingRow>

        <SettingRow :label="t('settingsPage.ai.saveSource')" :description="t('settingsPage.ai.saveSourceHint')">
          <Switch v-model="saveSource" :label="t('settingsPage.ai.saveSource')" />
        </SettingRow>

        <SettingRow :label="t('settingsPage.ai.hours')" :description="t('settingsPage.ai.hoursHint')" html-for="setting-ai-hours">
          <div class="flex w-full flex-col gap-1.5 sm:w-48">
            <div class="flex items-center gap-2">
              <Input
                id="setting-ai-hours"
                v-model="hoursDraft"
                type="number"
                inputmode="decimal"
                min="0.5"
                max="16"
                step="0.5"
                class="sm:w-28"
                :invalid="!!hoursError"
                :aria-describedby="hoursError ? 'setting-ai-hours-err' : undefined"
                @keydown.enter.prevent="commitHours"
                @blur="commitHours"
              />
              <span class="text-xs text-muted">{{ t('settingsPage.ai.hoursUnit') }}</span>
            </div>
            <p v-if="hoursError" id="setting-ai-hours-err" class="text-xs text-danger-text" role="alert">{{ hoursError }}</p>
          </div>
        </SettingRow>

        <SettingRow :label="t('settingsPage.ai.planningStyle')" :description="t('settingsPage.ai.planningStyleHint')" html-for="setting-ai-style">
          <Select id="setting-ai-style" v-model="planningStyle" :options="styleOptions" class="sm:w-56" />
        </SettingRow>
      </div>
    </Card>

    <AiQuotaCard />

    <Card :title="t('settingsPage.ai.usageTitle')" :subtitle="t('settingsPage.ai.usageHint')" :padded="true">
      <Skeleton v-if="usage.isPending.value" :rows="3" height="32px" />
      <p v-else-if="usage.isError.value" class="text-sm text-danger-text" role="alert">{{ t('errors.loadFailed') }}</p>
      <template v-else>
        <div v-if="totals.length" class="-mx-1 overflow-x-auto">
          <table class="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr class="border-b border-border text-subtle">
                <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.ai.operation') }}</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('settingsPage.ai.requests') }}</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('settingsPage.ai.tokens') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in totals" :key="row.operation" class="border-b border-border/60 last:border-0">
                <td class="px-2 py-2 text-fg">{{ opLabel(row.operation) }}</td>
                <td class="tabular px-2 py-2 text-right text-muted">{{ f.number(row.requests ?? 0, 0) }}</td>
                <td class="tabular px-2 py-2 text-right text-muted">{{ f.number(tokensOf(row), 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="py-3 text-center text-xs text-subtle">{{ t('settingsPage.ai.usageEmpty') }}</p>

        <h3 class="mb-2 mt-5 text-[13px] font-semibold text-fg">{{ t('settingsPage.ai.recent') }}</h3>
        <div v-if="recent.length" class="-mx-1 overflow-x-auto">
          <table class="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr class="border-b border-border text-subtle">
                <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.ai.when') }}</th>
                <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.ai.operation') }}</th>
                <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.ai.status') }}</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('settingsPage.ai.tokens') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in recent" :key="row.id ?? i" class="border-b border-border/60 last:border-0">
                <td class="tabular whitespace-nowrap px-2 py-2 text-muted">{{ row.createdAt ? f.dateTime(row.createdAt) : '—' }}</td>
                <td class="px-2 py-2 text-fg">{{ opLabel(row.operation) }}</td>
                <td class="px-2 py-2"><Badge :tone="row.status === 'ok' || row.status === 'success' ? 'success' : row.status ? 'danger' : 'neutral'" size="sm">{{ row.status ?? '—' }}</Badge></td>
                <td class="tabular px-2 py-2 text-right text-muted">{{ f.number(tokensOf(row), 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="py-3 text-center text-xs text-subtle">{{ t('settingsPage.ai.recentEmpty') }}</p>
      </template>
    </Card>

    <Card :padded="true">
      <div class="flex gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-soft text-ai" aria-hidden="true"><ShieldCheck class="size-4" /></span>
        <div class="min-w-0 space-y-2 text-xs leading-relaxed text-muted">
          <h2 class="text-[13px] font-semibold text-fg">{{ t('settingsPage.ai.privacyTitle') }}</h2>
          <p>{{ t('settingsPage.ai.privacyBody') }}</p>
          <p>{{ t('settingsPage.ai.privacyCredentials') }}</p>
          <p>{{ t('settingsPage.ai.privacyDrafts') }}</p>
          <p>{{ t('settingsPage.ai.privacyDelete') }}</p>
        </div>
      </div>
    </Card>
  </div>
</template>
