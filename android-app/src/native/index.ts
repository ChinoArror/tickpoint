// Android implementation of the platform interface (src/client/platform/types.ts).
// Vite aliases '@native-platform' to this file in android-app/vite.config.ts.
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import type { NativePlatform, NativeTermsAcceptance } from '../../../src/client/platform/types'
import { signIn, signOut } from './auth'
import { saveFile } from './files'
import { handleAppUrl, initLifecycle } from './lifecycle'
import { APP_VERSION, pushDisable, pushEnable, pushOpenSettings, pushStatus, registerPushListeners, syncPushRegistration } from './push'
import { TERMS_KEY, getJson, readToken, setJson } from './storage'
import { API_BASE, NativeError } from './util'
import { hooks } from './hooks'
import type { Router } from 'vue-router'

let initialized = false

async function openExternal(url: string): Promise<void> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new NativeError('BAD_URL')
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new NativeError('BAD_URL')
  await Browser.open({ url: target.toString(), presentationStyle: 'popover' })
}

async function termsAccepted(): Promise<NativeTermsAcceptance | null> {
  const v = await getJson<{ version?: unknown; acceptedAt?: unknown }>(TERMS_KEY)
  if (!v || typeof v.version !== 'string' || typeof v.acceptedAt !== 'number') return null
  return { version: v.version, acceptedAt: v.acceptedAt }
}

async function termsAccept(version: string): Promise<void> {
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) throw new NativeError('BAD_VERSION')
  await setJson(TERMS_KEY, { version, acceptedAt: Date.now() })
}

async function init(ctx: { router: Router; onSessionChanged: () => void }): Promise<void> {
  if (initialized) return
  initialized = true
  hooks.router = ctx.router
  hooks.onSessionChanged = ctx.onSessionChanged
  // Listeners first, so a cold-start push tap or App Link is not missed.
  await registerPushListeners(ctx.router)
  await initLifecycle(ctx.router)
  const launch = await App.getLaunchUrl().catch(() => undefined)
  if (launch?.url) handleAppUrl(launch.url)
  void syncPushRegistration()
}

export const nativePlatform: NativePlatform = {
  apiBase: API_BASE,
  appVersion: APP_VERSION,
  getAuthToken: () => readToken(),
  signIn: (returnTo: string) => signIn(returnTo),
  signOut: (opts: { authBaseUrl: string }) => signOut(opts),
  saveFile: (blob: Blob, filename: string) => saveFile(blob, filename),
  openExternal,
  push: {
    status: pushStatus,
    enable: pushEnable,
    disable: pushDisable,
    openSettings: pushOpenSettings,
  },
  terms: {
    accepted: termsAccepted,
    accept: termsAccept,
    decline: () => App.exitApp(),
  },
  init,
}
