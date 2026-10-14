import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/lib/api'
import type { Me, PublicConfig, Settings } from '@/lib/types'
import { setServerTime } from '@/composables/useNow'
import { i18n, LOCALE_STORAGE_KEY, setLocale } from '@/i18n'
import { applyTheme } from '@/composables/useTheme'

export const useSessionStore = defineStore('session', () => {
  const me = ref<Me | null>(null)
  const config = ref<PublicConfig | null>(null)
  const status = ref<'idle' | 'loading' | 'authenticated' | 'anonymous' | 'error'>('idle')
  const settings = computed<Settings | null>(() => me.value?.settings ?? null)

  async function loadConfig() {
    if (!config.value) config.value = await api.get<PublicConfig>('/auth/config')
    return config.value
  }

  async function load() {
    status.value = 'loading'
    const started = Date.now()
    try {
      const data = await api.get<Me>('/auth/me')
      setServerTime(data.serverTime, started, Date.now())
      me.value = data
      status.value = 'authenticated'
      reconcileLocale(data.settings)
      applyTheme(data.settings.theme)
    } catch (e) {
      me.value = null
      status.value = e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === 'SESSION_EXPIRED') ? 'anonymous' : 'error'
      if (status.value === 'error') throw e
    }
  }

  /**
   * Locale precedence: an explicit choice saved on the server wins; otherwise an
   * explicit local choice is pushed to the server; otherwise browser detection stays.
   */
  function reconcileLocale(s: Settings) {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (s.localeExplicit) setLocale(s.locale, true)
    else if (stored === 'en' || stored === 'ja') void updateSettings({ locale: stored })
    else if (i18n.global.locale.value !== s.locale) void updateSettings({ locale: i18n.global.locale.value as 'en' | 'ja' }).catch(() => undefined)
  }

  async function updateSettings(patch: Partial<Settings>) {
    if (!me.value) return
    const prev = me.value.settings
    me.value = { ...me.value, settings: { ...prev, ...patch } }
    try {
      const next = await api.patch<Settings>('/settings', patch)
      me.value = { ...me.value, settings: next }
    } catch (e) {
      me.value = { ...me.value, settings: prev }
      throw e
    }
  }

  /**
   * The one sign-out: ends TickPoint's session, then AuthCenter's via a browser redirect.
   * Callers clear their own caches (e.g. the query client) before calling this.
   */
  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined)
    try {
      localStorage.removeItem('tp.hadSession')
    } catch {
      /* ignore */
    }
    me.value = null
    status.value = 'anonymous'
    const cfg = await loadConfig()
    const ret = `${location.origin}/signin?signedOut=1`
    location.assign(`${cfg.authBaseUrl}/logout?redirect=${encodeURIComponent(ret)}`)
  }

  return { me, config, status, settings, load, loadConfig, updateSettings, signOut }
})
