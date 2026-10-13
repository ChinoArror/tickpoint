<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Select from '@/components/ui/Select.vue'
import SettingRow from './SettingRow.vue'
import { useSettingSave } from './useSettingSave'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import { applyTheme, type ThemePref } from '@/composables/useTheme'
import { setLocale } from '@/i18n'
import type { Locale } from '@shared/constants'

const { t, locale } = useI18n()
const { save, field, session } = useSettingSave()
const f = useFormat()
const now = useNow()

const zones = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [] as string[]
  }
})()

const localeChoice = computed<Locale>({
  get: () => (locale.value === 'ja' ? 'ja' : 'en'),
  set: (l) => {
    setLocale(l, true)
    void save({ locale: l })
  },
})

const zone = field('timeZone')
const zoneQuery = ref('')
const zoneOptions = computed(() => {
  const q = zoneQuery.value.trim().toLowerCase().replace(/\s+/g, '_')
  const cur = zone.value
  let list = zones.length ? zones : [cur]
  if (q) list = list.filter((z) => z.toLowerCase().includes(q))
  if (cur && !list.includes(cur) && (!q || cur.toLowerCase().includes(q))) list = [cur, ...list]
  return list.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))
})
const zonePreview = computed(() => (zone.value ? f.dateTime(now.value, zone.value) : ''))

const dateFormat = field('dateFormat')
const dateFormatOptions = computed(() =>
  (['auto', 'ymd', 'mdy', 'dmy'] as const).map((v) => ({ value: v, label: t(`settingsPage.general.dateFormats.${v}`) })),
)
const timeFormat = field('timeFormat')
const timeFormatOptions = computed(() => (['auto', 'h12', 'h24'] as const).map((v) => ({ value: v, label: t(`settingsPage.general.timeFormats.${v}`) })))

const themeModel = computed<ThemePref>({
  get: () => (session.settings?.theme ?? 'system') as ThemePref,
  set: (th) => {
    applyTheme(th)
    void save({ theme: th })
  },
})
const themeOptions = computed(() => [
  { value: 'system' as const, label: t('theme.system'), icon: Monitor },
  { value: 'light' as const, label: t('theme.light'), icon: Sun },
  { value: 'dark' as const, label: t('theme.dark'), icon: Moon },
])

const weekStart = field('weekStart')
const weekStartOptions = computed(() => [0, 1, 6].map((d) => ({ value: d, label: t(`settingsPage.general.weekdays.${d}`) })))
</script>

<template>
  <Card :title="t('settingsPage.general.title')" :subtitle="t('settingsPage.general.subtitle')" :padded="true">
    <div class="divide-y divide-border">
      <SettingRow :label="t('settingsPage.general.language')" :description="t('settingsPage.general.languageHint')">
        <Segmented v-model="localeChoice" :label="t('settingsPage.general.language')" :options="[{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]" />
      </SettingRow>

      <SettingRow :label="t('settingsPage.general.timeZone')" :description="t('settingsPage.general.timeZoneHint')" html-for="setting-timezone">
        <div class="flex w-full flex-col gap-2 sm:w-72">
          <Input v-model="zoneQuery" type="search" autocomplete="off" :placeholder="t('settingsPage.general.timeZoneSearch')" :aria-label="t('settingsPage.general.timeZoneSearch')" />
          <Select id="setting-timezone" v-model="zone" :options="zoneOptions" />
          <p class="tabular text-xs text-muted" aria-live="polite">{{ t('settingsPage.general.zonePreview', { time: zonePreview }) }}</p>
        </div>
      </SettingRow>

      <SettingRow :label="t('settingsPage.general.dateFormat')" :description="t('settingsPage.general.dateFormatHint')" html-for="setting-date-format">
        <Select id="setting-date-format" v-model="dateFormat" :options="dateFormatOptions" class="sm:w-56" />
      </SettingRow>

      <SettingRow :label="t('settingsPage.general.timeFormat')" :description="t('settingsPage.general.timeFormatHint')">
        <Segmented v-model="timeFormat" :label="t('settingsPage.general.timeFormat')" :options="timeFormatOptions" />
      </SettingRow>

      <SettingRow :label="t('settingsPage.general.theme')" :description="t('settingsPage.general.themeHint')">
        <Segmented v-model="themeModel" :label="t('settingsPage.general.theme')" :options="themeOptions" />
      </SettingRow>

      <SettingRow :label="t('settingsPage.general.weekStart')" :description="t('settingsPage.general.weekStartHint')" html-for="setting-week-start">
        <Select id="setting-week-start" v-model="weekStart" :options="weekStartOptions" class="sm:w-56" />
      </SettingRow>
    </div>
  </Card>
</template>
