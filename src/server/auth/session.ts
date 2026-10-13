import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import type { AppBindings, AuthIdentity, Env } from '../env'
import { getDb, schema } from '../db/client'
import { AppError } from '../lib/http'
import { decryptString, encryptString, newId, randomToken, sha256Hex } from '../lib/crypto'
import { verifyToken, type VerifiedIdentity } from './authcenter'

export const SESSION_COOKIE = 'tp_session'
const COOKIE_MAX_AGE_S = 30 * 24 * 3600
/** Re-check the JWT with AuthCenter at most this often (detects central revocation). */
const REVERIFY_INTERVAL_MS = 5 * 60_000
/** If AuthCenter is briefly unreachable, keep serving a recently verified session. */
const REVERIFY_GRACE_MS = 30 * 60_000
const JWT_PURPOSE = 'session-jwt'
export const DEV_BYPASS_MARKER = 'dev-bypass'

function isLocalRequest(c: Context): boolean {
  const host = new URL(c.req.url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function devBypassEnabled(c: Context<AppBindings>): boolean {
  return c.env.APP_ENV === 'development' && c.env.DEV_AUTH_BYPASS === 'true' && isLocalRequest(c)
}

function cookieOptions(c: Context) {
  const secure = new URL(c.req.url).protocol === 'https:'
  return { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/' }
}

/** Upsert the user, ensure workspace + settings exist, and open a local session. */
export async function createSession(
  c: Context<AppBindings>,
  identity: VerifiedIdentity,
  token: string,
  initial: { timeZone?: string | null; locale?: 'en' | 'ja' | null } = {},
): Promise<void> {
  const env = c.env
  const db = getDb(env.DB)
  const now = Date.now()
  const raw = randomToken(32)
  const idHash = await sha256Hex(raw)
  const jwtEnc = token === DEV_BYPASS_MARKER ? DEV_BYPASS_MARKER : await encryptString(token, sessionSecret(env), JWT_PURPOSE)

  await db.batch([
    db
      .insert(schema.users)
      .values({
        uuid: identity.uuid,
        name: identity.name,
        username: identity.username,
        email: identity.email,
        avatarUrl: identity.avatarUrl,
        role: identity.role,
        identityType: identity.identityType,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: schema.users.uuid,
        set: {
          name: identity.name,
          username: identity.username,
          email: identity.email,
          avatarUrl: identity.avatarUrl,
          role: identity.role,
          identityType: identity.identityType,
          lastSeenAt: now,
          updatedAt: now,
        },
      }),
    db
      .insert(schema.workspaces)
      .values({ id: newId(), ownerUuid: identity.uuid, name: 'Personal' })
      .onConflictDoNothing({ target: schema.workspaces.ownerUuid }),
    // First sign-in seeds settings from the browser; later sign-ins never overwrite them.
    db
      .insert(schema.userSettings)
      .values({ userUuid: identity.uuid, ...(initial.timeZone ? { timeZone: initial.timeZone } : {}), ...(initial.locale ? { locale: initial.locale } : {}) })
      .onConflictDoNothing(),
    db.insert(schema.sessions).values({
      idHash,
      userUuid: identity.uuid,
      jwtEnc,
      jwtExp: identity.exp,
      authSessionId: identity.authSessionId,
      role: identity.role,
      identityType: identity.identityType,
      scopePermissions: identity.scopePermissions ? JSON.stringify(identity.scopePermissions) : null,
      lastVerifiedAt: now,
      userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
    }),
  ])

  setCookie(c, SESSION_COOKIE, raw, { ...cookieOptions(c), maxAge: COOKIE_MAX_AGE_S })
}

function sessionSecret(env: Env): string {
  if (!env.AUTH_APP_SECRET) throw new AppError('NOT_CONFIGURED', 500, 'Server authentication is not configured')
  return env.AUTH_APP_SECRET
}

export async function destroySession(c: Context<AppBindings>): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE)
  if (raw) {
    const db = getDb(c.env.DB)
    await db.delete(schema.sessions).where(eq(schema.sessions.idHash, await sha256Hex(raw)))
  }
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c))
}

/**
 * Resolve the request's identity.
 * - No/unknown cookie            -> UNAUTHENTICATED (401)
 * - JWT expired or revoked       -> SESSION_EXPIRED (401): client performs the
 *   AuthCenter silent-renewal redirect.
 */
export async function loadIdentity(c: Context<AppBindings>): Promise<AuthIdentity> {
  const raw = getCookie(c, SESSION_COOKIE)
  if (!raw || raw.length > 100) throw new AppError('UNAUTHENTICATED', 401, 'Sign-in required')
  const idHash = await sha256Hex(raw)
  const db = getDb(c.env.DB)
  const s = await db.query.sessions.findFirst({ where: eq(schema.sessions.idHash, idHash) })
  if (!s || s.revokedAt) {
    deleteCookie(c, SESSION_COOKIE, cookieOptions(c))
    throw new AppError('UNAUTHENTICATED', 401, 'Sign-in required')
  }

  const now = Date.now()
  const expire = async () => {
    await db.delete(schema.sessions).where(eq(schema.sessions.idHash, idHash))
    throw new AppError('SESSION_EXPIRED', 401, 'Session expired')
  }

  const isDev = s.jwtEnc === DEV_BYPASS_MARKER
  if (isDev && !devBypassEnabled(c)) await expire()
  if (s.jwtExp <= now) await expire()

  if (!isDev && now - s.lastVerifiedAt > REVERIFY_INTERVAL_MS) {
    const token = await decryptString(s.jwtEnc, sessionSecret(c.env), JWT_PURPOSE)
    if (!token) await expire()
    try {
      const out = await verifyToken(c.env, token!)
      if (!out.ok || out.identity.uuid !== s.userUuid) await expire()
      await db.update(schema.sessions).set({ lastVerifiedAt: now }).where(eq(schema.sessions.idHash, idHash))
    } catch (e) {
      if (e instanceof AppError && e.code === 'AUTH_UNAVAILABLE' && now - s.lastVerifiedAt < REVERIFY_GRACE_MS) {
        // Tolerate a short AuthCenter outage.
      } else {
        throw e
      }
    }
  }

  return {
    uuid: s.userUuid,
    role: s.role === 'admin' ? 'admin' : 'user',
    identityType: s.identityType === 'test' ? 'test' : 'user',
    scopePermissions: s.scopePermissions ? (JSON.parse(s.scopePermissions) as string[]) : null,
    sessionHash: idHash,
  }
}

// ---------------------------------------------------------------------------
// Return-path handling and redirect-loop protection
// ---------------------------------------------------------------------------

const LOGIN_STATE_COOKIE = 'tp_login'
const LOOP_WINDOW_MS = 2 * 60_000
const LOOP_MAX_ATTEMPTS = 3

/** Only same-origin absolute paths are allowed as post-login destinations. */
export function safeReturnPath(input: string | null | undefined): string {
  if (!input || typeof input !== 'string' || input.length > 512) return '/'
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return '/'
  if (/[\u0000-\u001f\u007f]/.test(input)) return '/'
  if (input.startsWith('/api/') || input.startsWith('/sso-callback')) return '/'
  try {
    const u = new URL(input, 'https://example.invalid')
    if (u.origin !== 'https://example.invalid') return '/'
    return u.pathname + u.search + u.hash
  } catch {
    return '/'
  }
}

interface LoginState {
  r: string
  n: number
  t: number
}

export function recordLoginAttempt(c: Context, returnPath: string): { loop: boolean } {
  const now = Date.now()
  let state: LoginState = { r: returnPath, n: 0, t: now }
  const prev = getCookie(c, LOGIN_STATE_COOKIE)
  if (prev) {
    try {
      const p = JSON.parse(atob(prev)) as LoginState
      if (now - p.t < LOOP_WINDOW_MS) state = { r: returnPath, n: p.n, t: p.t }
    } catch {
      /* ignore */
    }
  }
  state.n += 1
  setCookie(c, LOGIN_STATE_COOKIE, btoa(JSON.stringify(state)), { ...cookieOptions(c), maxAge: 600 })
  return { loop: state.n > LOOP_MAX_ATTEMPTS }
}

export function consumeLoginState(c: Context): string {
  const prev = getCookie(c, LOGIN_STATE_COOKIE)
  deleteCookie(c, LOGIN_STATE_COOKIE, cookieOptions(c))
  if (!prev) return '/'
  try {
    return safeReturnPath((JSON.parse(atob(prev)) as LoginState).r)
  } catch {
    return '/'
  }
}
