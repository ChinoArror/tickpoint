// Typed fetch wrapper for the /api/v1 envelope. In the browser, cookies carry the session;
// the JWT never reaches JavaScript storage. In the Android app, the native shell holds the
// token and every request carries it as a bearer header.

import { apiBase, native } from '@/platform'
import { goTo } from '@/platform/navigate'
import { toast } from '@/composables/useToast'
import { i18n } from '@/i18n'

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

const BASE = apiBase()
let renewing = false

async function authHeaders(): Promise<Record<string, string>> {
  if (!native) return {}
  const token = await native.getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Silent renewal: when the session expired, bounce through AuthCenter which
 * re-issues a JWT without a prompt if its central session is still valid.
 * The server guards against redirect loops.
 * On native, the shell runs the Custom Tab sign-in; failures land on /signin.
 */
export function startSignIn(returnTo = location.pathname + location.search + location.hash): Promise<void> {
  if (renewing) return Promise.resolve()
  renewing = true
  if (native) {
    return native
      .signIn(returnTo)
      .catch(() => {
        goTo('/signin')
      })
      .finally(() => {
        renewing = false
      })
  }
  location.assign(`${BASE}/auth/login?return=${encodeURIComponent(returnTo)}`)
  return Promise.resolve()
}

type Query = Record<string, string | number | boolean | null | undefined>

function qs(query?: Query) {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function request<T>(method: string, path: string, opts: { body?: unknown; query?: Query; raw?: boolean; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(await authHeaders()) }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(BASE + path + qs(opts.query), {
      method,
      headers,
      body,
      credentials: native ? 'omit' : 'same-origin',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('NETWORK_ERROR', 0, 'Network error')
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError('HTTP_ERROR', res.status, res.statusText)
    return res as unknown as T
  }
  let json: { success: boolean; data: T; error: ApiErrorBody | null } | null = null
  try {
    json = await res.json()
  } catch {
    throw new ApiError('BAD_RESPONSE', res.status, 'Unexpected server response')
  }
  if (!res.ok || !json?.success) {
    const err = json?.error ?? { code: 'HTTP_ERROR', message: res.statusText }
    if (err.code === 'SESSION_EXPIRED') void startSignIn()
    throw new ApiError(err.code, res.status, err.message, err.details)
  }
  return json.data
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body === undefined ? {} : { body }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
}

/**
 * Download an authenticated GET endpoint.
 * Browser: a plain navigation to the URL (the session cookie authorises it).
 * Native: fetch with the bearer token, then hand the bytes to the share sheet.
 * Never rejects; native failures are shown as an error toast.
 */
export async function downloadUrl(path: string, query?: Query): Promise<void> {
  if (native) return downloadNative(path, query)
  const a = document.createElement('a')
  a.href = BASE + path + qs(query)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function downloadNative(path: string, query?: Query): Promise<void> {
  try {
    const res = await fetch(BASE + path + qs(query), {
      headers: { Accept: '*/*', ...(await authHeaders()) },
      credentials: 'omit',
    })
    if (!res.ok) throw new ApiError('HTTP_ERROR', res.status, res.statusText)
    const blob = await res.blob()
    const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename(path, blob.type)
    await native?.saveFile(blob, filename)
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    toast(i18n.global.t('nativePlatform.download.failed'), { kind: 'error' })
  }
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = header.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)
  if (star) {
    try {
      return sanitizeFilename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')))
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain ? sanitizeFilename(plain[1].trim()) : null
}

function sanitizeFilename(name: string): string | null {
  const cleaned = name.replace(/[\/:*?"<>|\x00-\x1f]/g, '_').trim()
  return cleaned || null
}

function fallbackFilename(path: string, mime: string): string {
  const segment = path.split('/').filter(Boolean).pop() ?? 'download'
  const ext = mime.includes('json') ? '.json' : mime.includes('csv') ? '.csv' : mime.includes('zip') ? '.zip' : ''
  return `tickpoint-${segment}${ext}`
}
