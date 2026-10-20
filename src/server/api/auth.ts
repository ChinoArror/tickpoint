import { Hono } from 'hono'
import { z } from 'zod'
import type { AppBindings } from '../env'
import { AppError, ok, parse, readJson } from '../lib/http'
import { looksLikeJwt } from '../lib/crypto'
import { getDb, schema } from '../db/client'
import { eq } from 'drizzle-orm'
import { deleteCookie, getCookie } from 'hono/cookie'
import { loginUrl, profileUrl, trackEvent, verifyToken, type VerifiedIdentity } from '../auth/authcenter'
import { consumeLoginState, createSession, destroySession, devBypassEnabled, DEV_BYPASS_MARKER, NATIVE_COOKIE, recordLoginAttempt, safeReturnPath, cookieOptions } from '../auth/session'
import { authorizeNativeLogin, exchangeNativeCode, pendingNativeLogin, pkceValueRegex, startNativeLogin } from '../auth/native'
import { hitRateLimit, requireAuth } from '../middleware'
import { timeZoneSchema } from '../../shared/schemas'
import { getSettingsRow, serializeSettings } from '../services/settings'

export const authRoutes = new Hono<AppBindings>()

/** Public configuration for the SPA (no secrets). */
authRoutes.get('/config', (c) =>
  ok(c, {
    appId: c.env.AUTH_APP_ID,
    authBaseUrl: c.env.AUTH_BASE_URL,
    devBypass: devBypassEnabled(c),
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY || null,
    emailConfigured: c.env.EMAIL_PROVIDER !== 'none',
    aiConfigured: Boolean(c.env.GEMINI_API_KEY),
  }),
)

/**
 * Start sign-in (also used for silent renewal after expiry). Remembers the
 * intended destination and guards against redirect loops.
 */
authRoutes.get('/login', (c) => {
  const ret = safeReturnPath(c.req.query('return'))
  const { loop } = recordLoginAttempt(c, ret)
  if (loop) return c.redirect('/signin?error=loop', 302)
  return c.redirect(loginUrl(c.env), 302)
})

/** Exchange the callback JWT (POSTed by the SPA, never logged) for a local session. */
authRoutes.post('/session', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  const rl = await hitRateLimit(c.env.DB, `auth:${ip}`, 600_000, 30)
  if (!rl.allowed) throw new AppError('RATE_LIMITED', 429, 'Too many sign-in attempts')

  const { token, timeZone, locale } = await readJson(c, z.object({ token: z.string().max(8192), timeZone: timeZoneSchema.nullish(), locale: z.enum(['en', 'ja']).nullish() }))
  if (!looksLikeJwt(token)) throw new AppError('AUTH_REJECTED', 401, 'Malformed sign-in token', { reason: 'malformed' })
  const out = await verifyToken(c.env, token)
  if (!out.ok) {
    const status = out.reason === 'app_not_allowed' ? 403 : 401
    throw new AppError(out.reason === 'app_not_allowed' ? 'FORBIDDEN' : 'AUTH_REJECTED', status, 'Sign-in could not be verified', { reason: out.reason })
  }
  // Android sign-in: a valid pending tp_native cookie hands the JWT to the app instead of the browser.
  const pending = await pendingNativeLogin(c)
  if (pending) {
    const redirect = await authorizeNativeLogin(c, pending, token, out.identity)
    c.executionCtx.waitUntil(trackEvent(c.env, out.identity.uuid, 'login'))
    return ok(c, { redirect, native: true })
  }
  // A stale or unknown tp_native cookie is dropped and the normal web sign-in continues.
  if (getCookie(c, NATIVE_COOKIE)) deleteCookie(c, NATIVE_COOKIE, cookieOptions(c))

  await createSession(c, out.identity, token, { timeZone, locale })
  c.executionCtx.waitUntil(trackEvent(c.env, out.identity.uuid, 'login'))
  return ok(c, { redirect: consumeLoginState(c) })
})

const nativeStartQuery = z.object({
  state: z.string().regex(pkceValueRegex, 'INVALID_STATE'),
  challenge: z.string().regex(pkceValueRegex, 'INVALID_CHALLENGE'),
  return: z.string().max(512).optional(),
})

/** Android: begin sign-in in the Custom Tab. Sets tp_native and redirects to AuthCenter. */
authRoutes.get('/native/start', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  const rl = await hitRateLimit(c.env.DB, `native-start:${ip}`, 600_000, 30)
  if (!rl.allowed) throw new AppError('RATE_LIMITED', 429, 'Too many sign-in attempts')
  const q = parse(nativeStartQuery, c.req.query())
  await startNativeLogin(c, { state: q.state, challenge: q.challenge, returnPath: q.return })
  return c.redirect(loginUrl(c.env), 302)
})

const pkceField = z.string().regex(pkceValueRegex, 'INVALID_GRANT')

/** Android: trade the one-time code and PKCE verifier for a bearer session. Public, CORS-allowed. */
authRoutes.post('/native/exchange', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  const rl = await hitRateLimit(c.env.DB, `native-exchange:${ip}`, 600_000, 20)
  if (!rl.allowed) throw new AppError('RATE_LIMITED', 429, 'Too many sign-in attempts')
  const body = await readJson(c, z.object({ code: pkceField, verifier: pkceField, timeZone: timeZoneSchema.nullish(), locale: z.enum(['en', 'ja']).nullish() }))
  return ok(c, await exchangeNativeCode(c, body))
})

/** Development-only sign-in for local testing (AuthCenter cannot redirect to localhost). */
authRoutes.post('/dev-login', async (c) => {
  if (!devBypassEnabled(c)) throw new AppError('NOT_FOUND', 404, 'Not found')
  const body = await readJson(c, z.object({ user: z.enum(['alice', 'bob']).default('alice'), timeZone: timeZoneSchema.nullish(), locale: z.enum(['en', 'ja']).nullish() }))
  const identity: VerifiedIdentity = {
    uuid: `dev-${body.user}-0000-0000-000000000000`,
    role: 'user',
    name: body.user === 'alice' ? 'Alice Developer' : 'Bob Developer',
    username: body.user,
    email: `${body.user}@example.test`,
    emailVerified: true,
    avatarUrl: null,
    identityType: 'user',
    scopePermissions: null,
    authSessionId: null,
    exp: Date.now() + 12 * 3600_000,
  }
  await createSession(c, identity, DEV_BYPASS_MARKER, { timeZone: body.timeZone, locale: body.locale })
  return ok(c, { redirect: consumeLoginState(c) })
})

/** Sign out of TickPoint only. The AuthCenter session is untouched. */
authRoutes.post('/logout', async (c) => {
  await destroySession(c)
  return ok(c, { signedOut: true })
})

authRoutes.get('/me', requireAuth, async (c) => {
  const id = c.get('identity')
  const db = getDb(c.env.DB)
  const user = await db.query.users.findFirst({ where: eq(schema.users.uuid, id.uuid) })
  const settings = await getSettingsRow(db, id.uuid)
  return ok(c, {
    user: {
      uuid: id.uuid,
      name: user?.name ?? null,
      username: user?.username ?? null,
      email: user?.email ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      role: id.role,
      identityType: id.identityType,
    },
    settings: serializeSettings(settings),
    profileUrl: profileUrl(c.env, id.uuid),
    serverTime: Date.now(),
  })
})
