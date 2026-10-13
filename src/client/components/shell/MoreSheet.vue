<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Activity, Bell, Monitor, Moon, Sun } from 'lucide-vue-next'
import Dialog from '@/components/ui/Dialog.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { MOBILE_NAV, NAV } from '@/layouts/nav'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { applyTheme, themePref, type ThemePref } from '@/composables/useTheme'
import { setLocale } from '@/i18n'

const { t, locale } = useI18n()
const ui = useUiStore()
const session = useSessionStore()

// Language and theme live here on mobile (the top bar menus are desktop-only).
const localeModel = computed<'en' | 'ja'>({
  get: () => (locale.value === 'ja' ? 'ja' : 'en'),
  set: (l) => void changeLocale(l),
})
const localeOptions = computed(() => [
  { value: 'en' as const, label: t('mobile.language.en') },
  { value: 'ja' as const, label: t('mobile.language.ja') },
])
async function changeLocale(l: 'en' | 'ja') {
  setLocale(l, true)
  await session.updateSettings({ locale: l }).catch(() => undefined)
}
const themeModel = computed<ThemePref>({
  get: () => themePref.value,
  set: (th) => void changeTheme(th),
})
const themeOptions = computed(() => [
  { value: 'system' as const, label: t('theme.system'), icon: Monitor },
  { value: 'light' as const, label: t('theme.light'), icon: Sun },
  { value: 'dark' as const, label: t('theme.dark'), icon: Moon },
])
async function changeTheme(th: ThemePref) {
  applyTheme(th)
  await session.updateSettings({ theme: th }).catch(() => undefined)
}
const open = computed({
  get: () => ui.moreSheetOpen,
  set: (v: boolean) => {
    ui.moreSheetOpen = v
  },
})

/** Destinations not already in the bottom bar, plus pages that have no nav entry. */
const destinations = computed(() => {
  const pinned = new Set(MOBILE_NAV.map((m) => m.to))
  return [
    ...NAV.filter((n) => !pinned.has(n.to)).map((n) => ({ to: n.to, key: n.key, label: t(`nav.${n.key}`), icon: n.icon })),
    { to: '/notifications', key: 'notifications', label: t('notifications.title'), icon: Bell },
    { to: '/activity', key: 'activity', label: t('activity.title'), icon: Activity },
  ]
})

function go() {
  ui.moreSheetOpen = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="t('more.title')" :description="t('more.description')" size="md">
    <nav :aria-label="t('more.title')">
      <ul class="grid grid-cols-3 gap-2">
        <li v-for="d in destinations" :key="d.to">
          <RouterLink
            :to="d.to"
            class="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface px-1.5 py-3 text-center text-xs font-medium text-fg shadow-xs transition hover:bg-surface-hover active:scale-[0.97]"
            @click="go"
          >
            <span class="grid size-9 place-items-center rounded-xl bg-primary-softer text-primary-text"><component :is="d.icon" class="size-5" aria-hidden="true" /></span>
            {{ d.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <section class="mt-5 flex flex-col gap-4 border-t border-border pt-4">
      <div class="flex flex-col gap-2">
        <p class="text-[13px] font-medium text-fg">{{ t('settings.general.language') }}</p>
        <Segmented v-model="localeModel" :options="localeOptions" :label="t('settings.general.language')" class="flex w-full [&>button]:flex-1" />
      </div>
      <div class="flex flex-col gap-2">
        <p class="text-[13px] font-medium text-fg">{{ t('settings.general.theme') }}</p>
        <Segmented v-model="themeModel" :options="themeOptions" :label="t('settings.general.theme')" class="flex w-full [&>button]:flex-1" />
      </div>
    </section>
  </Dialog>
</template>
