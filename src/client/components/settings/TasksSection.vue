<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import SettingRow from './SettingRow.vue'
import { useSettingSave } from './useSettingSave'
import { DEFAULT_VIEWS, PRIORITIES, REMINDER_PRESETS } from '@shared/constants'

const { t, te } = useI18n()
const { save, field, session } = useSettingSave()

const priority = field('defaultPriority')
const priorityOptions = computed(() => PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })))

const view = field('defaultView')
const viewOptions = computed(() => DEFAULT_VIEWS.map((v) => ({ value: v, label: t(`settingsPage.tasks.views.${v}`) })))

const offsets = computed(() => session.settings?.defaultReminderOffsets ?? [])
function toggleOffset(minutes: number) {
  const on = offsets.value.includes(minutes)
  const next = on ? offsets.value.filter((m) => m !== minutes) : [...offsets.value, minutes]
  void save({ defaultReminderOffsets: next.sort((a, b) => b - a) })
}

// Estimate is a nullable integer: an empty field clears it. Validation runs on commit.
const estimateDraft = ref('')
const estimateError = ref<string | null>(null)
watch(
  () => session.settings?.defaultEstimateMinutes,
  (v) => {
    estimateDraft.value = v == null ? '' : String(v)
    estimateError.value = null
  },
  { immediate: true },
)
function commitEstimate() {
  const raw = estimateDraft.value.trim()
  const current = session.settings?.defaultEstimateMinutes ?? null
  if (raw === '') {
    estimateError.value = null
    if (current !== null) void save({ defaultEstimateMinutes: null })
    return
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    estimateError.value = t('settingsPage.tasks.estimateInvalid')
    return
  }
  estimateError.value = null
  if (n !== current) void save({ defaultEstimateMinutes: n })
}

const showCompleted = field('showCompletedCheckpoints')
</script>

<template>
  <Card :title="t('settingsPage.tasks.title')" :subtitle="t('settingsPage.tasks.subtitle')" :padded="true">
    <div class="divide-y divide-border">
      <SettingRow :label="t('settingsPage.tasks.defaultPriority')" :description="t('settingsPage.tasks.defaultPriorityHint')" html-for="setting-default-priority">
        <Select id="setting-default-priority" v-model="priority" :options="priorityOptions" class="sm:w-48" />
      </SettingRow>

      <SettingRow :label="t('settingsPage.tasks.defaultView')" :description="t('settingsPage.tasks.defaultViewHint')" html-for="setting-default-view">
        <Select id="setting-default-view" v-model="view" :options="viewOptions" class="sm:w-48" />
      </SettingRow>

      <SettingRow stacked :label="t('settingsPage.tasks.reminders')" :description="t('settingsPage.tasks.remindersHint')">
        <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('settingsPage.tasks.reminders')">
          <button
            v-for="p in REMINDER_PRESETS"
            :key="p.key"
            type="button"
            :aria-pressed="offsets.includes(p.minutes)"
            class="h-8 rounded-full border px-3 text-xs font-medium transition-colors duration-150"
            :class="offsets.includes(p.minutes) ? 'border-primary bg-primary-soft text-primary-text' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg'"
            @click="toggleOffset(p.minutes)"
          >
            {{ te(`settingsPage.tasks.presets.${p.key}`) ? t(`settingsPage.tasks.presets.${p.key}`) : p.key }}
          </button>
        </div>
      </SettingRow>

      <SettingRow :label="t('settingsPage.tasks.estimate')" :description="t('settingsPage.tasks.estimateHint')" html-for="setting-estimate">
        <div class="flex w-full flex-col gap-1.5 sm:w-48">
          <div class="flex items-center gap-2">
            <Input
              id="setting-estimate"
              v-model="estimateDraft"
              type="number"
              inputmode="numeric"
              min="0"
              max="10000"
              step="5"
              class="sm:w-28"
              :invalid="!!estimateError"
              :placeholder="t('common.none')"
              :aria-describedby="estimateError ? 'setting-estimate-err' : undefined"
              @keydown.enter.prevent="commitEstimate"
              @blur="commitEstimate"
            />
            <span class="text-xs text-muted">{{ t('settingsPage.tasks.minutes') }}</span>
          </div>
          <p v-if="estimateError" id="setting-estimate-err" class="text-xs text-danger-text" role="alert">{{ estimateError }}</p>
        </div>
      </SettingRow>

      <SettingRow :label="t('settingsPage.tasks.showCompletedCheckpoints')" :description="t('settingsPage.tasks.showCompletedCheckpointsHint')">
        <Switch v-model="showCompleted" :label="t('settingsPage.tasks.showCompletedCheckpoints')" />
      </SettingRow>
    </div>
  </Card>
</template>
