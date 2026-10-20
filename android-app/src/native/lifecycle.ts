// App lifecycle: system back, App Links, resume, system bars, offline notice.
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { Router } from 'vue-router'
import { completeSignIn, finishSignOut, onBrowserFinished } from './auth'
import { notifySessionChanged } from './hooks'
import { syncPushRegistration } from './push'
import { readToken } from './storage'
import { isOpaqueToken, toastMessage, tr } from './util'

const AUTH_COMPLETE_PATH = '/app/auth-complete'
const SIGNED_OUT_PATH = '/app/signed-out'

/** Accepts only the two App Link paths this app handles. Everything else is ignored. */
export function handleAppUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return
  }
  if (url.protocol !== 'https:' || url.hostname !== 'point.aryuki.com' || url.port !== '') return
  if (url.username || url.password) return
  if (url.pathname === AUTH_COMPLETE_PATH) {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!isOpaqueToken(code) || !isOpaqueToken(state)) return
    void completeSignIn(code, state)
  } else if (url.pathname === SIGNED_OUT_PATH) {
    void finishSignOut()
  }
}

function onBack(router: Router): void {
  // An open dialog or sheet closes first. Escape is what the design-system dialogs listen for.
  if (document.querySelector('[role="dialog"],[role="alertdialog"]')) {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    return
  }
  if (window.history.state?.back) {
    router.back()
    return
  }
  void App.minimizeApp()
}

async function applySystemBars(): Promise<void> {
  const dark = document.documentElement.classList.contains('dark')
  // Edge-to-edge: the web layout already uses env(safe-area-inset-*).
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined)
  // Capacitor naming: Style.Light = dark icons for light backgrounds, Style.Dark = light icons for dark ones.
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined)
  // Only effective before Android 15; harmless otherwise.
  await StatusBar.setBackgroundColor({ color: dark ? '#16171d' : '#f8f9fb' }).catch(() => undefined)
}

function watchTheme(): void {
  const observer = new MutationObserver(() => void applySystemBars())
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

/**
 * Connectivity from the WebView (navigator.onLine). The Network plugin would need
 * ACCESS_NETWORK_STATE, which this app deliberately does not request.
 */
function watchNetwork(): void {
  let noticeShown = false
  const update = () => {
    if (navigator.onLine) {
      noticeShown = false
      return
    }
    if (noticeShown) return
    noticeShown = true
    void tr('nativePlatform.network.offline').then((msg) => toastMessage(msg, 'error'))
  }
  window.addEventListener('offline', update)
  window.addEventListener('online', update)
  if (!navigator.onLine) update()
}

export async function initLifecycle(router: Router): Promise<void> {
  await App.addListener('backButton', () => onBack(router))
  await App.addListener('appUrlOpen', ({ url }) => handleAppUrl(url))
  await App.addListener('resume', () => {
    void readToken().then((token) => {
      if (token) notifySessionChanged()
    })
    void syncPushRegistration()
  })
  await Browser.addListener('browserFinished', () => onBrowserFinished())
  await applySystemBars()
  watchTheme()
  watchNetwork()
}
