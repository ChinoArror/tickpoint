// FCM push through @capacitor/push-notifications (Firebase Messaging on Google Play services).
// Registration: PUT /devices (bearer). Removal: DELETE /devices/:installationId.
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type RegistrationError, type Token } from '@capacitor/push-notifications'
import type { Router } from 'vue-router'
import { i18n } from '@/i18n'
import { AppSettings, type PushSupportReason } from './plugins'
import { installationId, pushEnabled, readToken, setPushEnabled } from './storage'
import { API_BASE, readEnvelope, safePushRoute, toastMessage, tr } from './util'
import type { NativePushStatus } from '../../../src/client/platform/types'

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

const DEADLINE_CHANNEL = 'deadlines'
const GENERAL_CHANNEL = 'general'

type RegistrationOutcome = 'ok' | 'error'
let waiter: ((o: RegistrationOutcome) => void) | null = null

export async function pushSupport(): Promise<{ available: boolean; reason: PushSupportReason }> {
  try {
    return await AppSettings.pushSupport()
  } catch {
    return { available: false, reason: 'unknown' }
  }
}

/**
 * 'granted' means TickPoint push is actually on: the OS permission is granted AND the device
 * was turned on in TickPoint (pushEnabled). On Android 12 and lower the permission is granted
 * at install, so the OS permission alone is not enough. 'prompt' means "not turned on yet".
 */
export async function pushStatus(): Promise<NativePushStatus> {
  const support = await pushSupport()
  if (!support.available) return 'unavailable'
  const perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'denied') return 'denied'
  if (perm.receive === 'granted' && (await pushEnabled())) return 'granted'
  return 'prompt'
}

async function ensureChannels(): Promise<void> {
  await PushNotifications.createChannel({
    id: DEADLINE_CHANNEL,
    name: await tr('nativePlatform.push.channels.deadlines'),
    importance: 4,
    // Private: the lock screen shows a generic message, not the task title.
    visibility: 0,
    vibration: true,
  })
  await PushNotifications.createChannel({
    id: GENERAL_CHANNEL,
    name: await tr('nativePlatform.push.channels.general'),
    importance: 3,
    visibility: 0,
  })
}

function waitForRegistration(timeoutMs = 20_000): Promise<RegistrationOutcome> {
  return new Promise((resolve) => {
    const finish = (o: RegistrationOutcome) => {
      clearTimeout(timer)
      if (waiter === finish) waiter = null
      resolve(o)
    }
    const timer = setTimeout(() => finish('error'), timeoutMs)
    waiter = finish
    PushNotifications.register().catch(() => finish('error'))
  })
}

export async function pushEnable(): Promise<'granted' | 'denied' | 'unavailable'> {
  const support = await pushSupport()
  if (!support.available) return 'unavailable'
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return 'denied'
  await ensureChannels()
  await setPushEnabled(true)
  const outcome = await waitForRegistration()
  if (outcome !== 'ok') {
    await setPushEnabled(false)
    return 'unavailable'
  }
  return 'granted'
}

/** Removes this device's registration on the server (best effort). */
export async function deleteDeviceRemote(installation: string): Promise<void> {
  const bearer = await readToken()
  if (!bearer) return
  await fetch(`${API_BASE}/devices/${encodeURIComponent(installation)}`, {
    method: 'DELETE',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
  }).catch(() => undefined)
}

export async function pushDisable(): Promise<void> {
  await setPushEnabled(false)
  await deleteDeviceRemote(await installationId())
  await PushNotifications.unregister().catch(() => undefined)
}

/** Used on sign-out: stops this device from receiving pushes for the account that is leaving. */
export async function disablePushLocally(): Promise<void> {
  await setPushEnabled(false)
  await PushNotifications.unregister().catch(() => undefined)
}

export async function pushOpenSettings(): Promise<void> {
  await AppSettings.openNotificationSettings()
}

/** Refreshes the FCM token on every start (and after sign-in) when push is on and allowed. */
export async function syncPushRegistration(): Promise<void> {
  if (!(await pushEnabled())) return
  if (!(await readToken())) return
  if (!(await pushSupport()).available) return
  const perm = await PushNotifications.checkPermissions().catch(() => null)
  if (perm?.receive !== 'granted') return
  await PushNotifications.register().catch(() => undefined)
}

async function uploadRegistration(fcmToken: string): Promise<void> {
  if (!(await pushEnabled())) return
  const bearer = await readToken()
  if (!bearer) return
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'PUT',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      installationId: await installationId(),
      platform: 'android',
      fcmToken,
      appVersion: APP_VERSION,
      locale: String(i18n.global.locale.value),
    }),
  })
  await readEnvelope<unknown>(res)
}

async function showForeground(n: PushNotificationSchema): Promise<void> {
  const message = (n.title || n.body || '').trim()
  if (message) await toastMessage(message.slice(0, 200), 'info')
}

/** Listeners that live for the whole process. Called once from init(). */
export async function registerPushListeners(router: Router): Promise<void> {
  await PushNotifications.addListener('registration', (token: Token) => {
    waiter?.('ok')
    uploadRegistration(token.value).catch(() => undefined)
  })
  await PushNotifications.addListener('registrationError', (_err: RegistrationError) => {
    waiter?.('error')
  })
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    void showForeground(n)
  })
  await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const route = safePushRoute(action.notification?.data?.route)
    void router.isReady().then(() => router.push(route))
  })
}
