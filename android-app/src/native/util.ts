// Small helpers shared by the native modules. No imports from the web app here, so that
// this file can be loaded before the router without creating an import cycle.

const API_ORIGIN = 'https://point.aryuki.com'

export const APP_ORIGIN = API_ORIGIN
export const API_BASE = `${API_ORIGIN}/api/v1`

/** Same-app path only (no protocol-relative, no backslashes, not the Terms gate itself). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/'
  if (value === '/welcome' || value.startsWith('/welcome?')) return '/'
  return value
}

/** Route from a push payload: letters, digits, slash, underscore, hyphen only. */
const ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]{0,200}$/
export function safePushRoute(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!ROUTE_PATTERN.test(value) || value.startsWith('//')) return '/'
  return value
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{20,200}$/
export function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value)
}

export function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base64UrlEncode(buf)
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Locale and time zone sent with the exchange and device registration. */
export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Pulls `data` out of the standard { success, data, error } envelope, or throws. */
export async function readEnvelope<T>(res: Response): Promise<T> {
  let json: { success?: boolean; data?: T; error?: { code?: string } } | null = null
  try {
    json = await res.json()
  } catch {
    /* handled below */
  }
  if (!res.ok || !json?.success || json.data === undefined) {
    throw new NativeError(json?.error?.code ?? `HTTP_${res.status}`)
  }
  return json.data
}

export class NativeError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'NativeError'
  }
}

export class SignInCancelled extends Error {
  constructor() {
    super('SIGN_IN_CANCELLED')
    this.name = 'SignInCancelled'
  }
}

/** Dynamic import keeps the web composables (which import the API client) out of the
 * module graph that the platform barrel evaluates first. */
export function tr(key: string): Promise<string> {
  return import('@/i18n').then((m) => m.i18n.global.t(key) as string)
}

export async function toastMessage(message: string, kind: 'info' | 'error' | 'success' = 'info'): Promise<void> {
  const mod = await import('@/composables/useToast')
  mod.toast(message, { kind })
}
