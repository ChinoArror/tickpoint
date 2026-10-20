// Android push delivery through FCM HTTP v1. The service account comes from the
// FCM_SERVICE_ACCOUNT secret (JSON with project_id, client_email, private_key). Keys and
// access tokens are never logged or returned.

import { eq, sql, and } from 'drizzle-orm'
import type { Env } from '../env'
import { schema, type DB } from '../db/client'
import { safeReturnPath } from '../auth/session'
import { sha256Hex, toBase64Url } from '../lib/crypto'
import type { OutgoingMessage, SendOutcome } from './channels'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
/** Refresh the access token this long before it expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000
/** Devices failing this many times in a row are dropped (matches web push). */
const MAX_FAILURES = 10
const enc = new TextEncoder()

export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

/** Module-level access token cache, keyed by a hash of the service account. */
let tokenCache: { key: string; token: string; expiresAt: number } | null = null

export function parseServiceAccount(raw: string): ServiceAccount {
  const v = JSON.parse(raw) as Partial<ServiceAccount>
  if (typeof v.project_id !== 'string' || typeof v.client_email !== 'string' || typeof v.private_key !== 'string') throw new Error('fcm_service_account_shape')
  return { project_id: v.project_id, client_email: v.client_email, private_key: v.private_key }
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Signed JWT assertion (RS256) for the OAuth jwt-bearer grant. */
async function signAssertion(sa: ServiceAccount, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000)
  const header = toBase64Url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = toBase64Url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })))
  const input = `${header}.${claims}`
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input))
  return `${input}.${toBase64Url(new Uint8Array(sig))}`
}

/** OAuth access token for FCM, cached until shortly before expiry. */
async function accessToken(sa: ServiceAccount): Promise<{ token: string } | { error: 'transient' | 'permanent' }> {
  const key = await sha256Hex(`${sa.client_email}\n${sa.private_key}`)
  const now = Date.now()
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > now) return { token: tokenCache.token }

  let assertion: string
  try {
    assertion = await signAssertion(sa, now)
  } catch {
    console.error('fcm_service_account_key_invalid')
    return { error: 'permanent' }
  }
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: JWT_BEARER, assertion }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { error: 'transient' }
  }
  if (!res.ok) return { error: res.status === 429 || res.status >= 500 ? 'transient' : 'permanent' }
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
  if (!body || typeof body.access_token !== 'string') return { error: 'permanent' }
  const lifetimeMs = (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000
  tokenCache = { key, token: body.access_token, expiresAt: now + lifetimeMs - TOKEN_REFRESH_MARGIN_MS }
  return { token: body.access_token }
}

/**
 * The in-app route for the notification. Only same-app paths survive: an absolute link is kept
 * only when it points at APP_ORIGIN, anything else falls back to '/'.
 */
export function notificationRoute(link: string, appOrigin: string): string {
  if (link.startsWith('/')) return safeReturnPath(link)
  try {
    const u = new URL(link)
    if (u.origin !== new URL(appOrigin).origin) return '/'
    return safeReturnPath(u.pathname + u.search + u.hash)
  } catch {
    return '/'
  }
}

/** The token is no longer valid for this app: uninstalled, or never valid. */
function tokenIsDead(status: number, text: string): boolean {
  if (status === 404 || text.includes('UNREGISTERED')) return true
  return status === 400 && text.includes('INVALID_ARGUMENT') && /token/i.test(text)
}

/** Deliver to every native device of the owner through FCM HTTP v1. */
export async function sendNative(env: Env, db: DB, msg: OutgoingMessage): Promise<SendOutcome> {
  if (!env.FCM_SERVICE_ACCOUNT) return { status: 'skipped', detail: 'fcm_not_configured' }
  let sa: ServiceAccount
  try {
    sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT)
  } catch {
    console.error('fcm_service_account_invalid')
    return { status: 'skipped', detail: 'fcm_misconfigured' }
  }

  const devices = await db.select().from(schema.nativeDevices).where(eq(schema.nativeDevices.ownerUuid, msg.owner))
  if (!devices.length) return { status: 'skipped', detail: 'no_devices' }

  const auth = await accessToken(sa)
  if ('error' in auth) return { status: auth.error === 'transient' ? 'retryable' : 'permanent', detail: 'fcm_auth_failed' }

  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`
  const route = notificationRoute(msg.link, env.APP_ORIGIN)
  let sent = 0
  let transient = 0
  let removed = 0
  for (const d of devices) {
    const body = {
      message: {
        token: d.fcmToken,
        notification: { title: msg.title, body: msg.body },
        data: { route, tag: msg.tag, kind: 'reminder' },
        android: { priority: 'HIGH', notification: { channel_id: 'deadlines', tag: msg.tag } },
      },
    }
    const bumpFailure = () => db.update(schema.nativeDevices).set({ failureCount: sql`${schema.nativeDevices.failureCount} + 1` }).where(eq(schema.nativeDevices.id, d.id))
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      transient++
      await bumpFailure()
      continue
    }
    if (res.ok) {
      sent++
      await db.update(schema.nativeDevices).set({ failureCount: 0, lastSuccessAt: Date.now() }).where(eq(schema.nativeDevices.id, d.id))
      continue
    }
    const text = await res.text().catch(() => '')
    if (tokenIsDead(res.status, text)) {
      await db.delete(schema.nativeDevices).where(eq(schema.nativeDevices.id, d.id))
      removed++
      continue
    }
    if (res.status === 401) {
      // Cached access token rejected: fetch a fresh one on the next run.
      tokenCache = null
      transient++
    } else if (res.status === 429 || res.status >= 500) {
      transient++
    }
    await bumpFailure()
  }
  await db.delete(schema.nativeDevices).where(and(eq(schema.nativeDevices.ownerUuid, msg.owner), sql`${schema.nativeDevices.failureCount} >= ${MAX_FAILURES}`))

  if (sent > 0) return { status: 'sent', detail: `${sent}/${devices.length}` }
  if (transient > 0) return { status: 'retryable', detail: 'fcm_transient_failure' }
  return { status: 'permanent', detail: removed ? 'fcm_unregistered' : 'fcm_rejected' }
}
