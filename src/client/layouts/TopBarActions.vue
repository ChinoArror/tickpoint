<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Bell, Check, ExternalLink, Languages, LogOut, Monitor, Moon, Plus, Settings, Sun } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import Avatar from '@/components/ui/Avatar.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { applyTheme, themePref, type ThemePref } from '@/composables/useTheme'
import { setLocale } from '@/i18n'
import { api } from '@/lib/api'
import { qk, useErrorMessage } from '@/composables/useTasks'
import { runActivity } from '@/composables/useActivity'
import { useToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import type { AppNotification } from '@/lib/types'

const NotificationsPanel = defineAsyncComponent(() => import('@/components/shell/NotificationsPanel.vue'))

const { t, locale } = useI18n()
const router = useRouter()
const session = useSessionStore()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()
const ui = useUiStore()

const { data: notif } = useQuery({
  queryKey: qk.notifications,
  queryFn: () => api.get<{ items: AppNotification[]; unread: number }>('/notifications', { limit: 30 }),
  refetchInterval: 60_000,
})
const unread = computed(() => notif.value?.unread ?? 0)

async function changeLocale(l: 'en' | 'ja') {
  setLocale(l, true)
  await session.updateSettings({ locale: l }).catch(() => undefined)
}
async function changeTheme(th: ThemePref) {
  applyTheme(th)
  await session.updateSettings({ theme: th }).catch(() => undefined)
}

const langItems = computed<MenuItem[]>(() => [
  { heading: t('settings.general.language') },
  { label: 'English', icon: locale.value === 'en' ? Check : undefined, onSelect: () => changeLocale('en') },
  { label: '日本語', icon: locale.value === 'ja' ? Check : undefined, onSelect: () => changeLocale('ja') },
])
const themeIcon = computed(() => (themePref.value === 'dark' ? Moon : themePref.value === 'light' ? Sun : Monitor))
const themeItems = computed<MenuItem[]>(() => [
  { heading: t('settings.general.theme') },
  { label: t('theme.system'), icon: Monitor, onSelect: () => changeTheme('system') },
  { label: t('theme.light'), icon: Sun, onSelect: () => changeTheme('light') },
  { label: t('theme.dark'), icon: Moon, onSelect: () => changeTheme('dark') },
])
const profileItems = computed<MenuItem[]>(() => [
  { heading: session.me?.user.name ?? session.me?.user.username ?? '' },
  { label: t('account.profile'), icon: ExternalLink, onSelect: () => window.open(session.me?.profileUrl, '_blank', 'noopener') },
  { label: t('nav.settings'), icon: Settings, onSelect: () => router.push('/settings') },
  { separator: true },
  { label: t('account.signOut'), icon: LogOut, onSelect: signOutUser },
])

async function signOutUser() {
  if (!(await confirm({ title: t('feedback.signOutTitle'), message: t('feedback.signOutMessage'), confirmLabel: t('account.signOut') }))) return
  try {
    await runActivity(t('feedback.activity.signingOut'), async () => {
      qc.clear()
      await session.signOut()
    })
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5">
    <IconButton class="max-md:hidden" :label="t('actions.quickAdd')" @click="ui.openQuickAdd()"><Plus /></IconButton>

    <PopoverRoot v-model:open="ui.notificationsOpen">
      <PopoverTrigger as-child>
        <button type="button" class="relative grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-fg max-md:size-11" :aria-label="t('notifications.title') + (unread ? ` (${unread})` : '')">
          <Bell class="size-[18px]" :class="unread ? 'origin-top animate-[wiggle_1.2s_ease-in-out_1]' : ''" />
          <Transition name="pop">
            <span v-if="unread" class="tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-bg">{{ unread > 9 ? '9+' : unread }}</span>
          </Transition>
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end" :side-offset="8" class="menu-anim z-50 w-[min(380px,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface-raised shadow-lg outline-none">
          <NotificationsPanel :items="notif?.items ?? []" :unread="unread" @navigate="ui.notificationsOpen = false" />
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>

    <Menu :items="langItems" width="160px">
      <IconButton class="max-md:hidden" :label="t('settings.general.language')"><Languages /></IconButton>
    </Menu>
    <Menu :items="themeItems" width="160px">
      <IconButton class="max-md:hidden" :label="t('settings.general.theme')"><component :is="themeIcon" /></IconButton>
    </Menu>
    <Menu :items="profileItems" width="240px">
      <button type="button" class="ml-1 grid place-items-center rounded-full transition hover:ring-2 hover:ring-primary/30 max-md:ml-0 max-md:size-11" :aria-label="t('account.menu')">
        <Avatar :src="session.me?.user.avatarUrl" :name="session.me?.user.name ?? session.me?.user.username" :size="30" />
      </button>
    </Menu>
  </div>
</template>

<style>
@keyframes wiggle {
  0%, 100% { transform: rotate(0) }
  20% { transform: rotate(14deg) }
  40% { transform: rotate(-10deg) }
  60% { transform: rotate(6deg) }
  80% { transform: rotate(-3deg) }
}
</style>
