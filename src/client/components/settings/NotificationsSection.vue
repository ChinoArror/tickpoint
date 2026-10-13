<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query'
import { AlertTriangle, CheckCircle2, CircleSlash, FlaskConical, Smartphone, XCircle } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import SettingRow from './SettingRow.vue'
import { useSettingSave } from './useSettingSave'
import { api } from '@/lib/api'
import { usePush, type PushResult } from '@/composables/usePush'
import { useFormat } from '@/composables/useFormat'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'

type Channel = 'in_app' | 'push' | 'email'
interface ChannelRaw {
  status?: string
  ok?: boolean
  detail?: string | null
  code?: string | null
  reason?: string | null
}
interface DeliveryRow {
  id?: string
  channel?: string
  status?: string
  detail?: string | null
  code?: string | null
  error?: string | null
  createdAt?: number
  at?: number
}
interface DeviceRow {
  id?: string
  userAgent?: string | null
  createdAt?: number
}

const { t, te } = useI18n()
const { save, field, session } = useSettingSave()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()
const qc = useQueryClient()
const push = usePush()

const notifyInApp = field('notifyInApp')
const notifyEmail = field('notifyEmail')
const quietOn = field('quietHoursEnabled')
const quietStart = field('quietStart')
const quietEnd = field('quietEnd')
const emailMissing = computed(() => session.config?.emailConfigured === false)

onMounted(() => {
  void session.loadConfig().catch(() => undefined)
  void push.refresh()
})

// ---- Push --------------------------------------------------------------
const pushBusy = ref(false)
const pushNote = ref<string | null>(null)
const pushOn = computed(() => !!session.settings?.notifyPush)
const iosNote = computed(() => push.isIosNeedsInstall())

async function togglePush(on: boolean) {
  pushNote.value = null
  pushBusy.value = true
  try {
    if (on) {
      const result: PushResult = await push.subscribe()
      if (result !== 'ok') {
        pushNote.value = t(`settingsPage.notifications.pushResult.${result}`)
        return
      }
      await save({ notifyPush: true })
    } else {
      await push.unsubscribe()
      await save({ notifyPush: false })
    }
  } finally {
    pushBusy.value = false
  }
}

// ---- Test notification -----------------------------------------------------
interface TestRow {
  channel: Channel
  status: string
  detail: string | null
}
const testRows = ref<TestRow[] | null>(null)

function normalizeTest(raw: Record<string, string | ChannelRaw | undefined | null>): TestRow[] {
  const rows: TestRow[] = []
  for (const ch of ['in_app', 'push', 'email'] as const) {
    const v = raw[ch]
    if (v === undefined || v === null) continue
    if (typeof v === 'string') rows.push({ channel: ch, status: v, detail: null })
    else
      rows.push({
        channel: ch,
        status: v.status ?? (v.ok === true ? 'sent' : v.ok === false ? 'failed' : 'unknown'),
        detail: v.detail ?? v.code ?? v.reason ?? null,
      })
  }
  return rows
}

const testMutation = useMutation({
  mutationFn: () => api.post<Record<string, string | ChannelRaw | undefined | null>>('/notifications/test'),
  onSuccess: (raw) => {
    testRows.value = normalizeTest(raw)
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  },
  onError: (e) => toast.error(errMsg(e)),
})

function statusIcon(status: string) {
  if (status === 'sent') return CheckCircle2
  if (status === 'failed') return XCircle
  if (status === 'skipped') return CircleSlash
  return AlertTriangle
}
type Tone = 'success' | 'danger' | 'neutral' | 'warning'
function statusTone(status: string): Tone {
  return status === 'sent' ? 'success' : status === 'failed' ? 'danger' : status === 'skipped' ? 'neutral' : 'warning'
}
function statusLabel(status: string) {
  const key = `settingsPage.notifications.status.${status}`
  return te(key) ? t(key) : status
}
function detailLabel(code: string | null) {
  if (!code) return null
  const key = `settingsPage.notifications.details.${code}`
  return te(key) ? t(key) : code
}
function channelLabel(ch: Channel) {
  return t(`settingsPage.notifications.channels.${ch}`)
}

// ---- Delivery log and devices ----------------------------------------------
const deliveries = useQuery({
  queryKey: ['notifications', 'deliveries'],
  queryFn: async () => {
    const raw = await api.get<DeliveryRow[] | { items: DeliveryRow[] }>('/notifications/deliveries')
    return Array.isArray(raw) ? raw : (raw.items ?? [])
  },
})

const devices = useQuery({
  queryKey: ['push', 'subscriptions'],
  queryFn: async () => {
    const raw = await api.get<DeviceRow[] | { items: DeviceRow[] }>('/push/subscriptions')
    return Array.isArray(raw) ? raw : (raw.items ?? [])
  },
})

function deviceName(ua: string | null | undefined) {
  if (!ua) return t('settingsPage.notifications.devices.unknown')
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Macintosh/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return t('settingsPage.notifications.devices.unknown')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card :title="t('settingsPage.notifications.title')" :subtitle="t('settingsPage.notifications.subtitle')" :padded="true">
      <div class="divide-y divide-border">
        <SettingRow :label="t('settingsPage.notifications.inApp')" :description="t('settingsPage.notifications.inAppHint')">
          <Switch v-model="notifyInApp" :label="t('settingsPage.notifications.inApp')" />
        </SettingRow>

        <SettingRow :label="t('settingsPage.notifications.push')" :description="t('settingsPage.notifications.pushHint')">
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Switch :model-value="pushOn" :disabled="pushBusy || !push.supported" :label="t('settingsPage.notifications.push')" @update:model-value="togglePush" />
            <p v-if="!push.supported" class="text-xs text-muted">{{ t('settingsPage.notifications.pushResult.unsupported') }}</p>
            <p v-if="pushNote" class="max-w-xs text-xs text-warning-text sm:text-right" role="status">{{ pushNote }}</p>
            <p v-if="iosNote" class="max-w-xs rounded-lg bg-info-soft px-2.5 py-1.5 text-xs text-info sm:text-right">{{ t('settingsPage.notifications.iosInstallNote') }}</p>
          </div>
        </SettingRow>

        <SettingRow :label="t('settingsPage.notifications.email')" :description="t('settingsPage.notifications.emailHint')">
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Switch v-model="notifyEmail" :disabled="emailMissing" :label="t('settingsPage.notifications.email')" />
            <p v-if="emailMissing" class="max-w-xs text-xs text-warning-text sm:text-right">{{ t('settingsPage.notifications.emailNotConfigured') }}</p>
          </div>
        </SettingRow>

        <SettingRow :label="t('settingsPage.notifications.quietHours')" :description="t('settingsPage.notifications.quietHoursHint')">
          <div class="flex w-full flex-col gap-2.5 sm:w-auto sm:items-end">
            <Switch v-model="quietOn" :label="t('settingsPage.notifications.quietHours')" />
            <div class="flex flex-wrap items-center gap-2" :class="!quietOn && 'opacity-50'">
              <label class="flex items-center gap-2 text-xs text-muted">
                {{ t('settingsPage.notifications.quietFrom') }}
                <Input v-model="quietStart" type="time" class="w-32" :disabled="!quietOn" />
              </label>
              <label class="flex items-center gap-2 text-xs text-muted">
                {{ t('settingsPage.notifications.quietUntil') }}
                <Input v-model="quietEnd" type="time" class="w-32" :disabled="!quietOn" />
              </label>
            </div>
          </div>
        </SettingRow>

        <SettingRow :label="t('settingsPage.notifications.test')" :description="t('settingsPage.notifications.testHint')">
          <div class="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <Button variant="secondary" size="sm" :loading="testMutation.isPending.value" @click="testMutation.mutate()">
              <FlaskConical class="size-4" aria-hidden="true" />{{ t('settingsPage.notifications.sendTest') }}
            </Button>
            <ul v-if="testRows" class="flex w-full flex-col gap-1.5 rounded-xl bg-surface-sunken p-2.5 text-xs" :aria-label="t('settingsPage.notifications.testResults')">
              <li v-for="r in testRows" :key="r.channel" class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-medium text-fg">{{ channelLabel(r.channel) }}</span>
                <Badge :tone="statusTone(r.status)" size="sm">
                  <component :is="statusIcon(r.status)" class="mr-1 inline size-3" aria-hidden="true" />{{ statusLabel(r.status) }}
                </Badge>
                <span v-if="detailLabel(r.detail)" class="min-w-0 text-muted">{{ detailLabel(r.detail) }}</span>
              </li>
            </ul>
          </div>
        </SettingRow>
      </div>
    </Card>

    <Card :title="t('settingsPage.notifications.deliveries')" :subtitle="t('settingsPage.notifications.deliveriesHint')" :padded="true">
      <Skeleton v-if="deliveries.isPending.value" :rows="3" height="32px" />
      <p v-else-if="deliveries.isError.value" class="text-sm text-danger-text" role="alert">{{ t('errors.loadFailed') }}</p>
      <p v-else-if="!deliveries.data.value?.length" class="py-4 text-center text-xs text-subtle">{{ t('settingsPage.notifications.deliveriesEmpty') }}</p>
      <div v-else class="-mx-1 overflow-x-auto">
        <table class="w-full min-w-[420px] text-left text-xs">
          <thead>
            <tr class="border-b border-border text-subtle">
              <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.notifications.logTime') }}</th>
              <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.notifications.logChannel') }}</th>
              <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.notifications.logStatus') }}</th>
              <th scope="col" class="px-2 py-2 font-medium">{{ t('settingsPage.notifications.logDetail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in deliveries.data.value" :key="d.id ?? i" class="border-b border-border/60 last:border-0">
              <td class="tabular whitespace-nowrap px-2 py-2 text-muted">{{ (d.createdAt ?? d.at) ? f.dateTime(d.createdAt ?? d.at) : '—' }}</td>
              <td class="px-2 py-2 text-fg">{{ d.channel && te(`settingsPage.notifications.channels.${d.channel}`) ? channelLabel(d.channel as Channel) : (d.channel ?? '—') }}</td>
              <td class="px-2 py-2"><Badge :tone="statusTone(d.status ?? 'unknown')" size="sm">{{ statusLabel(d.status ?? 'unknown') }}</Badge></td>
              <td class="max-w-[220px] truncate px-2 py-2 text-muted" :title="detailLabel(d.detail ?? d.code ?? d.error ?? null) ?? undefined">{{ detailLabel(d.detail ?? d.code ?? d.error ?? null) ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <Card :title="t('settingsPage.notifications.devicesTitle')" :subtitle="t('settingsPage.notifications.devicesHint')" :padded="true">
      <Skeleton v-if="devices.isPending.value" :rows="2" height="40px" />
      <ul v-else-if="devices.data.value?.length" class="flex flex-col gap-1">
        <li v-for="(d, i) in devices.data.value" :key="d.id ?? i" class="flex items-center gap-3 rounded-xl px-2 py-2">
          <span class="grid size-8 place-items-center rounded-lg bg-surface-sunken text-muted" aria-hidden="true"><Smartphone class="size-4" /></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-fg">{{ deviceName(d.userAgent) }}</p>
            <p v-if="d.createdAt" class="text-xs text-muted">{{ t('settingsPage.notifications.devices.added', { date: f.dateTime(d.createdAt) }) }}</p>
          </div>
        </li>
      </ul>
      <p v-else class="py-4 text-center text-xs text-subtle">{{ t('settingsPage.notifications.devicesEmpty') }}</p>
    </Card>
  </div>
</template>
