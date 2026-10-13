<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryClient } from '@tanstack/vue-query'
import { Bell, Mail, Plus, Smartphone, Trash2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Field from '@/components/ui/Field.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { api } from '@/lib/api'
import { invalidatePlanning, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import { useToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import { NOTIFICATION_CHANNELS, REMINDER_PRESETS, type NotificationChannel } from '@shared/constants'
import type { ReminderRule } from '@/lib/types'

/** Reminder rules for a task, goal or checkpoint. Offsets are relative to the due instant. */
const props = defineProps<{ reminders: ReminderRule[]; target: { taskId?: string; goalId?: string; checkpointId?: string }; hasDue: boolean }>()

const { t, te, locale } = useI18n()
const f = useFormat()
const now = useNow()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()

const busy = ref(false)
const panel = ref<'custom' | 'at' | null>(null)
const amount = ref<number | null>(30)
const unit = ref<'minutes' | 'hours' | 'days'>('minutes')
const atValue = ref('')
const channels = ref<NotificationChannel[]>(['in_app', 'push'])
const formError = ref('')

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const
const unitOptions = computed(() => (['minutes', 'hours', 'days'] as const).map((u) => ({ value: u, label: t(`reminders.unit.${u}`) })))
const channelIcon: Record<NotificationChannel, Component> = { in_app: Bell, push: Smartphone, email: Mail }
const jobTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  sent: 'success',
  retryable_failure: 'warning',
  permanent_failure: 'danger',
}

/** Localised "1 day" / "90 minutes" style duration for custom offsets. */
function duration(minutes: number): string {
  const unitName = minutes % 1440 === 0 ? 'day' : minutes % 60 === 0 ? 'hour' : 'minute'
  const value = unitName === 'day' ? minutes / 1440 : unitName === 'hour' ? minutes / 60 : minutes
  return new Intl.NumberFormat(locale.value === 'ja' ? 'ja-JP' : 'en-US', { style: 'unit', unit: unitName, unitDisplay: 'long' }).format(value)
}

function label(r: ReminderRule): string {
  if (r.kind === 'absolute' && r.absoluteAt != null) return t('reminders.at', { when: f.dateTime(r.absoluteAt) })
  const m = r.offsetMinutes ?? 0
  const preset = REMINDER_PRESETS.find((p) => p.minutes === m)
  return preset ? t(`reminders.presets.${preset.key}`) : t('reminders.before', { when: duration(m) })
}

function nextText(r: ReminderRule): string {
  const job = r.jobs?.[0]
  return job ? t('reminders.next', { when: f.relativeTime(job.fireAt, now.value) }) : t('reminders.noNext')
}

function jobLabel(status: string): string {
  const key = `reminders.jobStatus.${status}`
  return te(key) ? t(key) : status
}

async function mutate(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    invalidatePlanning(qc)
    qc.invalidateQueries({ queryKey: ['task'] })
    qc.invalidateQueries({ queryKey: ['goal'] })
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    busy.value = false
  }
}

function setEnabled(r: ReminderRule, enabled: boolean) {
  return mutate(() => api.patch(`/reminders/${r.id}`, { enabled }))
}

async function remove(r: ReminderRule) {
  const ok = await confirm({ title: t('reminders.removeConfirm'), danger: true, confirmLabel: t('common.delete') })
  if (ok) await mutate(() => api.del(`/reminders/${r.id}`))
}

function toggleChannel(c: NotificationChannel) {
  channels.value = channels.value.includes(c) ? channels.value.filter((x) => x !== c) : [...channels.value, c]
  formError.value = ''
}

async function create(body: Record<string, unknown>) {
  if (!channels.value.length) {
    formError.value = t('reminders.noChannel')
    return
  }
  formError.value = ''
  await mutate(() => api.post('/reminders', { ...props.target, ...body, channels: channels.value }))
  panel.value = null
}

function addPreset(minutes: number) {
  return create({ kind: 'offset', offsetMinutes: minutes })
}

function addCustom() {
  const n = amount.value
  if (n == null || !Number.isFinite(n) || n < 0) {
    formError.value = t('reminders.invalidAmount')
    return
  }
  const minutes = Math.round(n * UNIT_MINUTES[unit.value])
  return create({ kind: 'offset', offsetMinutes: minutes })
}

function addAt() {
  const ms = atValue.value ? new Date(atValue.value).getTime() : Number.NaN
  if (!Number.isFinite(ms) || ms <= now.value) {
    formError.value = t('reminders.invalidTime')
    return
  }
  return create({ kind: 'absolute', absoluteAt: ms })
}

function openPanel(p: 'custom' | 'at') {
  formError.value = ''
  panel.value = p
}

const menuItems = computed<MenuItem[]>(() => [
  ...(props.hasDue ? [] : [{ heading: t('reminders.noDue') } as MenuItem]),
  { heading: t('reminders.presetsHeading') },
  ...REMINDER_PRESETS.map((p) => ({ label: t(`reminders.presets.${p.key}`), disabled: !props.hasDue, onSelect: () => addPreset(p.minutes) })),
  { separator: true },
  { label: t('reminders.customOffset'), disabled: !props.hasDue, onSelect: () => openPanel('custom') },
  { label: t('reminders.atTime'), onSelect: () => openPanel('at') },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <Menu :items="menuItems" width="240px">
        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-soft px-2.5 text-[13px] font-medium text-primary-text transition hover:bg-primary-soft/80 disabled:opacity-50" :disabled="busy">
          <Plus class="size-4" aria-hidden="true" />{{ t('reminders.add') }}
        </button>
      </Menu>
    </div>

    <Transition name="fade">
      <div v-if="panel" class="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-3">
        <div v-if="panel === 'custom'" class="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field v-slot="{ id, invalid }" :label="t('reminders.amount')">
            <Input :id="id" type="number" min="0" :invalid="invalid" :model-value="amount ?? ''" @update:model-value="(v) => (amount = v === '' || v == null ? null : Number(v))" />
          </Field>
          <Field v-slot="{ id }" :label="t('reminders.unitLabel')">
            <Select :id="id" v-model="unit" :options="unitOptions" />
          </Field>
        </div>
        <Field v-else v-slot="{ id, invalid }" :label="t('reminders.dateTime')">
          <Input :id="id" type="datetime-local" :invalid="invalid" :model-value="atValue" @update:model-value="(v) => (atValue = String(v ?? ''))" />
        </Field>

        <div class="flex flex-col gap-1.5">
          <span class="text-[13px] font-medium text-fg">{{ t('reminders.channels') }}</span>
          <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('reminders.channels')">
            <button
              v-for="c in NOTIFICATION_CHANNELS"
              :key="c"
              type="button"
              :aria-pressed="channels.includes(c)"
              class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition"
              :class="channels.includes(c) ? 'border-primary bg-primary-softer text-primary-text' : 'border-border bg-surface text-muted hover:text-fg'"
              @click="toggleChannel(c)"
            >
              <component :is="channelIcon[c]" class="size-3.5" aria-hidden="true" />{{ t(`reminders.channel.${c}`) }}
            </button>
          </div>
        </div>

        <p v-if="formError" class="text-xs text-danger-text" role="alert">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="h-8 rounded-md px-3 text-[13px] font-medium text-muted transition hover:bg-surface-hover hover:text-fg" @click="panel = null">{{ t('common.cancel') }}</button>
          <button
            type="button"
            class="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-on-primary shadow-sm transition hover:bg-primary-hover disabled:opacity-50"
            :disabled="busy"
            @click="panel === 'custom' ? addCustom() : addAt()"
          >
            {{ t('reminders.confirmAdd') }}
          </button>
        </div>
      </div>
    </Transition>

    <ul v-if="reminders.length" class="flex flex-col gap-2" role="list">
      <li v-for="(r, i) in reminders" :key="r.id" class="stagger flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5" :style="{ '--i': i }">
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
            {{ label(r) }}
            <span class="inline-flex items-center gap-1 text-muted">
              <template v-for="c in r.channels" :key="c">
                <component :is="channelIcon[c]" class="size-3.5" aria-hidden="true" />
                <span class="sr-only">{{ t(`reminders.channel.${c}`) }}</span>
              </template>
            </span>
          </p>
          <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{{ nextText(r) }}</span>
            <Badge v-if="r.jobs?.[0]" :tone="jobTone[r.jobs[0].status] ?? 'neutral'" size="sm">{{ jobLabel(r.jobs[0].status) }}</Badge>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Switch :model-value="r.enabled" :label="t('reminders.enabledLabel')" :disabled="busy" @update:model-value="(v: boolean) => setEnabled(r, v)" />
          <IconButton :label="t('reminders.remove')" size="sm" :disabled="busy" @click="remove(r)">
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-subtle">{{ t('reminders.empty') }}</p>
  </div>
</template>
