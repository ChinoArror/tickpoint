// Android sign-in hand-off (PKCE). The Custom Tab carries a `tp_native` cookie that binds
// the AuthCenter callback to a pending row; the app then exchanges a one-time code plus the
// PKCE verifier for a bearer session. See android-app/docs/ARCHITECTURE.md ("Sign-in").

import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { and, eq } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { getDb, schema } from '../db/client'
import { AppError } from '../lib/http'
import { decryptString, encryptString, randomToken, sha256Hex, timingSafeEqual, toBase64Url } from '../lib/crypto'
import { verifyToken, type VerifiedIdentity } from './authcenter'
import { cookieOptions, createSession, NATIVE_COOKIE, safeReturnPath, sessionSecret } from './session'

/** Pending sign-in lifetime (the user must finish AuthCenter sign-in within this window). */
export const NATIVE_LOGIN_TTL_MS = 10 * 60_000
/** One-time exchange code lifetime. */
export const NATIVE_CODE_TTL_MS = 5 * 60_000
const NATIVE_JWT_PURPOSE = 'native-login-jwt'
const NATIVE_COOKIE_MAX_AGE_S = 600
const MAX_COOKIE_LENGTH = 100

/** base64url value of 32 random bytes (state, PKCE challenge or verifier), up to 128 chars. */
export const pkceValueRegex = /^[A-Za-z0-9_-]{43,128}$/

function invalidGrant(): AppError {
  return new AppError('INVALID_GRANT', 400, 'Sign-in code is invalid or expired')
}

/** Create a pending native login and set the tp_native cookie. The caller redirects to AuthCenter. */
export async function startNativeLogin(c: Context<AppBindings>, args: { state: string; challenge: string; returnPath: string | undefined }): Promise<void> {
  const db = getDb(c.env.DB)
  const raw = randomToken(32)
  const now = Date.now()
  await db.insert(schema.nativeLogins).values({
    idHash: await sha256Hex(raw),
    state: args.state,
    codeChallenge: args.challenge,
    returnPath: safeReturnPath(args.returnPath),
    status: 'pending',
    createdAt: now,
    expiresAt: now + NATIVE_LOGIN_TTL_MS,
  })
  setCookie(c, NATIVE_COOKIE, raw, { ...cookieOptions(c), maxAge: NATIVE_COOKIE_MAX_AGE_S })
}

/** The pending native login bound to this browser's tp_native cookie, if still valid. */
export async function pendingNativeLogin(c: Context<AppBindings>) {
  const raw = getCookie(c, NATIVE_COOKIE)
  if (!raw || raw.length > MAX_COOKIE_LENGTH) return null
  const db = getDb(c.env.DB)
  const row = await db.query.nativeLogins.findFirst({ where: eq(schema.nativeLogins.idHash, await sha256Hex(raw)) })
  if (!row || row.status !== 'pending' || row.expiresAt <= Date.now()) return null
  return row
}

/**
 * Store the verified JWT on the pending row and mint the one-time code.
 * No browser session is created here; the app obtains its bearer token in exchangeNativeCode.
 * Returns the app redirect (App Link / intent fallback page).
 */
export async function authorizeNativeLogin(c: Context<AppBindings>, row: { idHash: string; state: string }, token: string, identity: VerifiedIdentity): Promise<string> {
  const db = getDb(c.env.DB)
  const code = randomToken(32)
  const now = Date.now()
  const updated = await db
    .update(schema.nativeLogins)
    .set({
      status: 'authorized',
      jwtEnc: await encryptString(token, sessionSecret(c.env), NATIVE_JWT_PURPOSE),
      userUuid: identity.uuid,
      codeHash: await sha256Hex(code),
      expiresAt: now + NATIVE_CODE_TTL_MS,
    })
    .where(and(eq(schema.nativeLogins.idHash, row.idHash), eq(schema.nativeLogins.status, 'pending')))
    .returning({ idHash: schema.nativeLogins.idHash })
  if (!updated.length) throw new AppError('AUTH_REJECTED', 401, 'Sign-in could not be verified', { reason: 'native_login_expired' })
  deleteCookie(c, NATIVE_COOKIE, cookieOptions(c))
  return `${c.env.APP_ORIGIN}/app/auth-complete?code=${code}&state=${encodeURIComponent(row.state)}`
}

/**
 * Exchange the one-time code for a bearer session. Replays fail: the code can be used once,
 * and the status flip to 'used' is a single conditional UPDATE.
 */
export async function exchangeNativeCode(
  c: Context<AppBindings>,
  input: { code: string; verifier: string; timeZone?: string | null; locale?: 'en' | 'ja' | null },
): Promise<{ token: string; expiresAt: number; returnPath: string }> {
  const db = getDb(c.env.DB)
  const now = Date.now()
  const row = await db.query.nativeLogins.findFirst({ where: eq(schema.nativeLogins.codeHash, await sha256Hex(input.code)) })
  if (!row || row.status !== 'authorized' || row.expiresAt <= now || !row.jwtEnc) throw invalidGrant()

  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.verifier))))
  if (!timingSafeEqual(challenge, row.codeChallenge)) throw invalidGrant()

  // Single use: only the request that flips authorized -> used gets past this point.
  const marked = await db
    .update(schema.nativeLogins)
    .set({ status: 'used', usedAt: now, codeHash: null, jwtEnc: null })
    .where(and(eq(schema.nativeLogins.idHash, row.idHash), eq(schema.nativeLogins.status, 'authorized')))
    .returning({ idHash: schema.nativeLogins.idHash })
  if (!marked.length) throw invalidGrant()

  const token = await decryptString(row.jwtEnc, sessionSecret(c.env), NATIVE_JWT_PURPOSE)
  if (!token) throw invalidGrant()
  // The AuthCenter session may have been revoked since the sign-in.
  const out = await verifyToken(c.env, token)
  if (!out.ok) throw new AppError('INVALID_GRANT', 400, 'Sign-in expired, please sign in again')

  const bearer = await createSession(c, out.identity, token, { timeZone: input.timeZone, locale: input.locale }, { kind: 'native' })
  return { token: bearer, expiresAt: out.identity.exp, returnPath: safeReturnPath(row.returnPath) }
}
