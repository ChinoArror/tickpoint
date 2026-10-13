import type { Context, MiddlewareHandler } from 'hono'
import type { AppBindings } from '../env'
import { AppError } from '../lib/http'
import { loadIdentity } from '../auth/session'
import { reportTestUsage } from '../auth/authcenter'
import { randomToken } from '../lib/crypto'

/** Security headers for every API response. HTML security headers live in public/_headers. */
export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  c.set('requestId', randomToken(9))
  await next()
  const h = c.res.headers
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  h.set('X-Frame-Options', 'DENY')
  h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  if (!h.has('Cache-Control')) h.set('Cache-Control', 'private, no-store')
  h.set('X-Request-Id', c.get('requestId'))
}

/** Reject request bodies over the limit before parsing them. */
export function bodyLimit(maxBytes: number): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const len = Number(c.req.header('content-length') ?? '0')
    if (len > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body too large')
    await next()
  }
}

/**
 * CSRF protection for cookie-authenticated mutations: the session cookie is
 * SameSite=Lax and every state-changing request must come from our own origin.
 */
export const csrfGuard: MiddlewareHandler<AppBindings> = async (c, next) => {
  const m = c.req.method
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    const self = new URL(c.req.url).origin
    const origin = c.req.header('origin')
    const fetchSite = c.req.header('sec-fetch-site')
    const allowed = origin ? origin === self : fetchSite === 'same-origin'
    if (!allowed) throw new AppError('CSRF_REJECTED', 403, 'Cross-site request rejected')
  }
  await next()
}

/**
 * Authentication + test-identity scope enforcement.
 * TickPoint stores only private user data, so test identities need
 * private_read for reads and private_write for mutations.
 */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const identity = await loadIdentity(c)
  c.set('identity', identity)

  if (identity.identityType === 'test') {
    const perms = identity.scopePermissions ?? []
    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD'
    const needed = isRead ? 'private_read' : 'private_write'
    if (!perms.includes(needed)) throw new AppError('FORBIDDEN', 403, `Test identity lacks ${needed}`)
    if (!isRead) console.log(JSON.stringify({ audit: 'test_private_write', uuid: identity.uuid, path: c.req.path, method: c.req.method }))
    try {
      await next()
    } finally {
      const status = c.res?.status ?? 500
      c.executionCtx.waitUntil(
        reportTestUsage(c.env, {
          uuid: identity.uuid,
          sessionId: null,
          path: c.req.path,
          method: c.req.method,
          status,
        }),
      )
    }
    return
  }
  await next()
}

export function requireAdmin(c: Context<AppBindings>): void {
  if (c.get('identity').role !== 'admin') throw new AppError('FORBIDDEN', 403, 'Administrator role required')
}

/**
 * Fixed-window rate limiter backed by D1 (atomic upsert). Used for expensive
 * endpoints (AI, import/export, session creation), not for every request.
 */
export async function hitRateLimit(
  db: D1Database,
  key: string,
  windowMs: number,
  max: number,
): Promise<{ allowed: boolean; count: number; resetAt: number }> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs
  const row = await db
    .prepare(
      'INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) ' +
        'ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count',
    )
    .bind(key, windowStart)
    .first<{ count: number }>()
  const count = row?.count ?? 1
  return { allowed: count <= max, count, resetAt: windowStart + windowMs }
}

export function rateLimit(name: string, windowMs: number, max: number, by: 'user' | 'ip' = 'user'): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const who = by === 'user' ? c.get('identity')?.uuid : c.req.header('cf-connecting-ip') ?? 'local'
    const r = await hitRateLimit(c.env.DB, `${name}:${who}`, windowMs, max)
    if (!r.allowed) {
      c.header('Retry-After', String(Math.ceil((r.resetAt - Date.now()) / 1000)))
      throw new AppError('RATE_LIMITED', 429, 'Too many requests')
    }
    await next()
  }
}
