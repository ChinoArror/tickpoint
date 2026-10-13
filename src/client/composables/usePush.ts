// Web Push subscription lifecycle for the current browser/device.
// Subscriptions are stored server-side per device; the service worker in
// src/client/sw/sw.ts displays incoming messages.

import { ref } from 'vue'
import { api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'no_key' | 'error'

/** Convert a URL-safe base64 VAPID public key into the byte array PushManager expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function isStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
}

export function usePush() {
  const session = useSessionStore()
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const permission = ref<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported')
  const subscribed = ref(false)

  async function refresh(): Promise<void> {
    if (!supported) return
    permission.value = Notification.permission
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      subscribed.value = !!sub
    } catch {
      subscribed.value = false
    }
  }

  /** Request permission, subscribe this device and register the subscription with the server. */
  async function subscribe(): Promise<PushResult> {
    if (!supported) return 'unsupported'
    const cfg = await session.loadConfig().catch(() => null)
    const key = cfg?.vapidPublicKey
    if (!key) return 'no_key'
    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return 'denied'
    try {
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }))
      await api.post('/push/subscriptions', sub.toJSON())
      subscribed.value = true
      return 'ok'
    } catch {
      return 'error'
    }
  }

  /** Remove this device's subscription on the server and in the browser. */
  async function unsubscribe(): Promise<boolean> {
    if (!supported) return true
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await api.del('/push/subscriptions', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      subscribed.value = false
      return true
    } catch {
      return false
    }
  }

  /** iOS only allows web push for apps installed to the Home Screen. */
  function isIosNeedsInstall(): boolean {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    return ios && !isStandalone()
  }

  return { supported, permission, subscribed, refresh, subscribe, unsubscribe, isIosNeedsInstall }
}
