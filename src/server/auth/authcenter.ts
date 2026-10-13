// AuthCenter integration. Only documented endpoints are used:
//   GET  /login?app_id&redirect            (browser redirect)
//   GET  /logout?redirect                  (browser redirect)
//   GET  /api/verify?app_id                (Bearer <user JWT>)
//   GET  /api/quota/check?uuid&app_id      (Bearer <app secret>)
//   POST /api/quota/consume                (Bearer <app secret>)
//   POST /api/test-auth/usage              (Bearer <app secret>)
//   POST /api/track                        (analytics, best effort)
// The app secret identifies TickPoint to AuthCenter. It is NOT the JWT signing
// key, so JWTs are never verified locally; /api/verify is authoritative.

import type { Env } from '../env'
import { AppError } from '../lib/http'
import { decodeJwtPayload } from '../lib/crypto'

const VERIFY_TIMEOUT_MS = 6000

export interface VerifiedIdentity {
  uuid: string
  role: 'admin' | 'user'
  name: string | null
  username: string | null
  email: string | null
  avatarUrl: string | null
  identityType: 'user' | 'test'
  scopePermissions: string[] | null
  authSessionId: string | null
  exp: number // ms
}

export type VerifyOutcome =
  | { ok: true; identity: VerifiedIdentity }
  | { ok: false; reason: 'expired' | 'rejected' | 'malformed' | 'app_not_allowed'; status?: number }

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

export function loginUrl(env: Env): string {
  const u = new URL('/login', env.AUTH_BASE_URL)
  u.searchParams.set('app_id', env.AUTH_APP_ID)
  u.searchParams.set('redirect', env.AUTH_CALLBACK_URL)
  return u.toString()
}

export function logoutUrl(env: Env, returnTo: string): string {
  const u = new URL('/logout', env.AUTH_BASE_URL)
  u.searchParams.set('redirect', returnTo)
  return u.toString()
}

export function profileUrl(env: Env, uuid: string): string {
  return new URL(`/user/${encodeURIComponent(uuid)}`, env.AUTH_BASE_URL).toString()
}

/**
 * Verify a JWT with AuthCenter. Checks the local `exp` first (cheap early
 * rejection), then calls /api/verify which also confirms account status,
 * app permission and that the central session has not been revoked.
 */
export async function verifyToken(env: Env, token: string, fetcher: typeof fetch = fetch): Promise<VerifyOutcome> {
  const payload = decodeJwtPayload(token)
  if (!payload) return { ok: false, reason: 'malformed' }
  const expSec = typeof payload.exp === 'number' ? payload.exp : null
  if (expSec == null) return { ok: false, reason: 'malformed' }
  if (expSec * 1000 <= Date.now()) return { ok: false, reason: 'expired' }

  const url = new URL('/api/verify', env.AUTH_BASE_URL)
  url.searchParams.set('app_id', env.AUTH_APP_ID)

  let res: Response
  try {
    res = await fetcher(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
  } catch {
    throw new AppError('AUTH_UNAVAILABLE', 503, 'Authentication service is unreachable')
  }
  if (res.status >= 500) throw new AppError('AUTH_UNAVAILABLE', 503, 'Authentication service error')
  if (!res.ok) return { ok: false, reason: 'rejected', status: res.status }

  let body: { valid?: boolean; user?: Record<string, unknown> } | null = null
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: 'rejected', status: res.status }
  }
  if (!body || body.valid !== true) return { ok: false, reason: 'rejected', status: res.status }

  const user = (body.user ?? {}) as Record<string, unknown>
  const claimUuid = str(payload.sub) ?? str(payload.uuid)
  const verifiedUuid = str(user.uuid) ?? str(user.sub) ?? claimUuid
  if (!claimUuid || !verifiedUuid || claimUuid !== verifiedUuid) return { ok: false, reason: 'rejected' }

  const isTest = payload.identity_type === 'test' || payload.test_session === true || user.identity_type === 'test'
  let scopePermissions: string[] | null = null
  if (isTest) {
    const allowed = Array.isArray(payload.allowed_subapps) ? (payload.allowed_subapps as unknown[]).map(String) : []
    if (!allowed.includes(env.AUTH_APP_ID) && !allowed.includes('*')) return { ok: false, reason: 'app_not_allowed' }
    const perms = Array.isArray(payload.data_scope_permissions)
      ? (payload.data_scope_permissions as unknown[]).map(String)
      : [str(payload.data_scope) ?? 'public_read']
    scopePermissions = perms
  }

  const role = (str(user.role) ?? str(payload.role)) === 'admin' && !isTest ? 'admin' : 'user'
  return {
    ok: true,
    identity: {
      uuid: verifiedUuid,
      role,
      name: str(user.name) ?? str(payload.name),
      username: str(user.username) ?? str(payload.username),
      email: str(user.email) ?? str(payload.email),
      avatarUrl: str(user.avatar_url) ?? str(payload.avatar_url),
      identityType: isTest ? 'test' : 'user',
      scopePermissions,
      authSessionId: str(payload.session_id),
      exp: expSec * 1000,
    },
  }
}

// ---------------------------------------------------------------------------
// Agent quota (AI calls)
// ---------------------------------------------------------------------------

export async function checkQuota(env: Env, uuid: string): Promise<void> {
  if (!env.AUTH_APP_SECRET) return
  const url = new URL('/api/quota/check', env.AUTH_BASE_URL)
  url.searchParams.set('uuid', uuid)
  url.searchParams.set('app_id', env.AUTH_APP_ID)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.AUTH_APP_SECRET}` },
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Fail open on network errors; the local AI rate limiter still applies.
    console.warn('quota_check_unreachable')
    return
  }
  if (res.status === 429) throw new AppError('QUOTA_EXCEEDED', 429, 'AI quota exceeded')
  if (res.status === 403) throw new AppError('FORBIDDEN', 403, 'AI access is not permitted for this account')
  if (res.status === 401) {
    console.error('quota_check_app_secret_rejected')
    return
  }
  if (!res.ok) console.warn('quota_check_failed', res.status)
}

export async function consumeQuota(env: Env, uuid: string, tokens: number): Promise<void> {
  if (!env.AUTH_APP_SECRET || tokens <= 0) return
  try {
    const res = await fetch(new URL('/api/quota/consume', env.AUTH_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AUTH_APP_SECRET}` },
      body: JSON.stringify({ uuid, app_id: env.AUTH_APP_ID, tokens }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.warn('quota_consume_failed', res.status)
  } catch {
    console.warn('quota_consume_unreachable')
  }
}

// ---------------------------------------------------------------------------
// Test identity usage + analytics (best effort, fire-and-forget)
// ---------------------------------------------------------------------------

export async function reportTestUsage(
  env: Env,
  args: { uuid: string; sessionId: string | null; path: string; method: string; status: number; amount?: number },
): Promise<void> {
  if (!env.AUTH_APP_SECRET) return
  try {
    await fetch(new URL('/api/test-auth/usage', env.AUTH_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AUTH_APP_SECRET}` },
      body: JSON.stringify({
        test_identity_id: args.uuid,
        session_id: args.sessionId,
        subapp: env.AUTH_APP_ID,
        api_path: args.path,
        method: args.method,
        amount: args.amount ?? 1,
        status_code: args.status,
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    /* best effort */
  }
}

export async function trackEvent(env: Env, uuid: string, eventType: string): Promise<void> {
  try {
    await fetch(new URL('/api/track', env.AUTH_BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: env.AUTH_APP_ID, uuid, event_type: eventType }),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    /* best effort */
  }
}
