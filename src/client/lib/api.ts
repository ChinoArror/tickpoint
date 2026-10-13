// Typed fetch wrapper for the /api/v1 envelope. Cookies carry the session;
// the JWT never reaches JavaScript storage.

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

const BASE = '/api/v1'
let renewing = false

/**
 * Silent renewal: when the session expired, bounce through AuthCenter which
 * re-issues a JWT without a prompt if its central session is still valid.
 * The server guards against redirect loops.
 */
export function startSignIn(returnTo = location.pathname + location.search + location.hash) {
  if (renewing) return
  renewing = true
  location.assign(`${BASE}/auth/login?return=${encodeURIComponent(returnTo)}`)
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
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(BASE + path + qs(opts.query), { method, headers, body, credentials: 'same-origin', signal: opts.signal })
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
    if (err.code === 'SESSION_EXPIRED') startSignIn()
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

/** Trigger a browser download for an authenticated GET endpoint. */
export function downloadUrl(path: string, query?: Query) {
  const a = document.createElement('a')
  a.href = BASE + path + qs(query)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
