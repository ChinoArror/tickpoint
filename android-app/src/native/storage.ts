// Local state. Preferences holds non-secret values; the session token lives only in
// SecureStore (Android Keystore-backed) and is cached in memory for this process.
import { Preferences } from '@capacitor/preferences'
import { SecureStore } from './plugins'

const TOKEN_KEY = 'tp.session.token'
export const PKCE_KEY = 'tp.native.pkce'
export const TERMS_KEY = 'tp.terms'
export const INSTALL_KEY = 'tp.native.installationId'
export const PUSH_FLAG_KEY = 'tp.native.pushEnabled'

let cachedToken: string | null | undefined

export async function readToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken
  try {
    const { value } = await SecureStore.get({ key: TOKEN_KEY })
    cachedToken = value && value.length > 0 ? value : null
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export async function writeToken(token: string): Promise<void> {
  await SecureStore.set({ key: TOKEN_KEY, value: token })
  cachedToken = token
}

export async function clearToken(): Promise<void> {
  cachedToken = null
  try {
    await SecureStore.remove({ key: TOKEN_KEY })
  } catch {
    /* already gone */
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key })
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) })
}

export async function removeKey(key: string): Promise<void> {
  await Preferences.remove({ key }).catch(() => undefined)
}

/** Random per-install id, created once. It is not the user id and carries no identity. */
export async function installationId(): Promise<string> {
  const existing = await Preferences.get({ key: INSTALL_KEY })
  if (existing.value && /^[A-Za-z0-9_-]{16,80}$/.test(existing.value)) return existing.value
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  await Preferences.set({ key: INSTALL_KEY, value: id })
  return id
}

export async function pushEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: PUSH_FLAG_KEY })
  return value === '1'
}

export async function setPushEnabled(on: boolean): Promise<void> {
  await Preferences.set({ key: PUSH_FLAG_KEY, value: on ? '1' : '0' })
}
