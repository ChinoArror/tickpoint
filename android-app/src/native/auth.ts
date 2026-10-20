// AuthCenter sign-in and sign-out through a Chrome Custom Tab, with PKCE and a one-time code.
// Flow and contract: android-app/docs/ARCHITECTURE.md ("Sign-in").
import { Browser } from '@capacitor/browser'
import { goTo } from '@/platform/navigate'
import { i18n } from '@/i18n'
import { notifySessionChanged } from './hooks'
import { APP_ORIGIN, API_BASE, NativeError, SignInCancelled, isOpaqueToken, randomBase64Url, readEnvelope, safeReturnPath, sha256Base64Url, timeZone } from './util'
import { PKCE_KEY, clearToken, getJson, installationId, readToken, removeKey, setJson, writeToken } from './storage'
import { deleteDeviceRemote, disablePushLocally, syncPushRegistration } from './push'

/** Matches the server's native_logins TTL. */
const PKCE_TTL_MS = 10 * 60 * 1000

interface StoredLogin {
  state: string
  verifier: string
  returnTo: string
  createdAt: number
}

interface Pending {
  resolve: () => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

let pending: Pending | null = null
let completing = false

function settlePending(error?: unknown): boolean {
  const p = pending
  if (!p) return false
  pending = null
  clearTimeout(p.timer)
  if (error === undefined) p.resolve()
  else p.reject(error)
  return true
}

async function closeBrowser(): Promise<void> {
  await Browser.close().catch(() => undefined)
}

/** Starts the sign-in. Resolves after the App Link returns with a verified code and the token is stored. */
export async function signIn(returnTo: string): Promise<void> {
  const path = safeReturnPath(returnTo)
  const state = randomBase64Url(32)
  const verifier = randomBase64Url(32)
  const challenge = await sha256Base64Url(verifier)
  // A new attempt supersedes an earlier one that is still waiting.
  settlePending(new SignInCancelled())
  const stored: StoredLogin = { state, verifier, returnTo: path, createdAt: Date.now() }
  await setJson(PKCE_KEY, stored)
  const query = new URLSearchParams({ state, challenge, return: path })
  const url = `${API_BASE}/auth/native/start?${query.toString()}`
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      void removeKey(PKCE_KEY)
      settlePending(new NativeError('SIGN_IN_TIMEOUT'))
    }, PKCE_TTL_MS)
    pending = { resolve, reject, timer }
    Browser.open({ url, presentationStyle: 'popover' }).catch((e: unknown) => settlePending(e))
  })
}

/** Custom Tab closed by the user. The stored login is kept until its TTL so a late App Link still completes. */
export function onBrowserFinished(): void {
  settlePending(new SignInCancelled())
}

async function exchange(code: string, verifier: string): Promise<{ token: string; returnPath?: string }> {
  const res = await fetch(`${API_BASE}/auth/native/exchange`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, verifier, timeZone: timeZone(), locale: String(i18n.global.locale.value) }),
  })
  const data = await readEnvelope<{ token?: unknown; returnPath?: unknown }>(res)
  if (typeof data.token !== 'string' || data.token.length < 16 || data.token.length > 4096) {
    throw new NativeError('BAD_RESPONSE')
  }
  return { token: data.token, returnPath: typeof data.returnPath === 'string' ? data.returnPath : undefined }
}

/** Completes the flow for a verified https://point.aryuki.com/app/auth-complete link. */
export async function completeSignIn(code: string, state: string): Promise<void> {
  if (completing) return
  completing = true
  const hadPending = pending !== null
  try {
    const stored = await getJson<StoredLogin>(PKCE_KEY)
    if (!stored) return // not started by this app (or already used): ignore
    if (Date.now() - stored.createdAt > PKCE_TTL_MS) {
      await removeKey(PKCE_KEY)
      throw new NativeError('LOGIN_EXPIRED')
    }
    if (stored.state !== state) return // a different link: leave the real login untouched
    if (!isOpaqueToken(code)) throw new NativeError('BAD_CODE')
    await removeKey(PKCE_KEY) // single use, removed before the network call
    const result = await exchange(code, stored.verifier)
    await writeToken(result.token)
    settlePending()
    await closeBrowser()
    notifySessionChanged()
    void syncPushRegistration()
    goTo(safeReturnPath(result.returnPath ?? stored.returnTo))
  } catch (e) {
    const wasWaiting = settlePending(e)
    await closeBrowser()
    if (!wasWaiting && !hadPending) goTo('/signin')
  } finally {
    completing = false
  }
}

/** Returns from the AuthCenter logout page. */
export async function finishSignOut(): Promise<void> {
  await closeBrowser()
}

/** Clears the device registration, the token and the central AuthCenter session. */
export async function signOut(opts: { authBaseUrl: string }): Promise<void> {
  let base: URL
  try {
    base = new URL(opts.authBaseUrl)
  } catch {
    throw new NativeError('BAD_AUTH_BASE')
  }
  if (base.protocol !== 'https:') throw new NativeError('BAD_AUTH_BASE')
  if (await readToken()) {
    await deleteDeviceRemote(await installationId())
  }
  await disablePushLocally()
  await clearToken()
  await removeKey(PKCE_KEY)
  const redirect = `${APP_ORIGIN}/app/signed-out`
  const logout = `${base.origin}${base.pathname.replace(/\/+$/, '')}/logout?redirect=${encodeURIComponent(redirect)}`
  await Browser.open({ url: logout, presentationStyle: 'popover' })
}
