// Delivery channels behind a small provider abstraction. Each send returns a
// classified outcome so the dispatcher can retry only transient failures.

import { and, eq, sql } from 'drizzle-orm'
import { buildPushPayload } from '@block65/webcrypto-web-push'
import type { Env } from '../env'
import { schema, type DB } from '../db/client'

export type SendOutcome = { status: 'sent' | 'skipped' | 'retryable' | 'permanent'; detail?: string }

export interface OutgoingMessage {
  owner: string
  title: string
  body: string
  link: string
  tag: string
}

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

export async function sendPush(env: Env, db: DB, msg: OutgoingMessage): Promise<SendOutcome> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { status: 'skipped', detail: 'vapid_not_configured' }
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.ownerUuid, msg.owner))
  if (!subs.length) return { status: 'skipped', detail: 'no_subscriptions' }

  let sent = 0
  let transient = 0
  for (const s of subs) {
    try {
      const payload = await buildPushPayload(
        { data: { title: msg.title, body: msg.body, url: msg.link, tag: msg.tag }, options: { ttl: 3600, urgency: 'high', topic: msg.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') } },
        { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
        { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
      )
      const res = await fetch(s.endpoint, { ...payload, signal: AbortSignal.timeout(8000) })
      if (res.status === 404 || res.status === 410) {
        // Subscription expired or revoked by the browser.
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id))
      } else if (res.ok) {
        sent++
        await db.update(schema.pushSubscriptions).set({ lastSuccessAt: Date.now(), failureCount: 0 }).where(eq(schema.pushSubscriptions.id, s.id))
      } else {
        transient += res.status === 429 || res.status >= 500 ? 1 : 0
        await db
          .update(schema.pushSubscriptions)
          .set({ failureCount: sql`${schema.pushSubscriptions.failureCount} + 1` })
          .where(eq(schema.pushSubscriptions.id, s.id))
      }
    } catch {
      transient++
    }
  }
  // Drop subscriptions that keep failing.
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.ownerUuid, msg.owner), sql`${schema.pushSubscriptions.failureCount} >= 10`))
  if (sent > 0) return { status: 'sent', detail: `${sent}/${subs.length}` }
  return transient > 0 ? { status: 'retryable', detail: 'push_transient_failure' } : { status: 'permanent', detail: 'push_rejected' }
}

// ---------------------------------------------------------------------------
// Email (provider abstraction)
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface EmailProvider {
  name: string
  send(msg: EmailMessage): Promise<SendOutcome>
}

class ResendProvider implements EmailProvider {
  name = 'resend'
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(m: EmailMessage): Promise<SendOutcome> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return { status: 'sent' }
      return { status: res.status === 429 || res.status >= 500 ? 'retryable' : 'permanent', detail: `resend_${res.status}` }
    } catch {
      return { status: 'retryable', detail: 'resend_network' }
    }
  }
}

/** Parses 'Name <addr@host>' into the structured sender the Email Service expects. */
export function parseSender(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { email: m[2].trim(), ...(m[1] ? { name: m[1].replace(/^"|"$/g, '') } : {}) } : { email: from.trim() }
}

const CF_RETRYABLE = new Set(['E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED', 'E_DELIVERY_FAILED', 'E_INTERNAL_SERVER_ERROR'])

/** Cloudflare Email Service via the Workers send_email binding (no API key; domain onboarded in Cloudflare). */
class CloudflareEmailProvider implements EmailProvider {
  name = 'cloudflare'
  constructor(
    private binding: NonNullable<Env['EMAIL']>,
    private from: string,
  ) {}
  async send(m: EmailMessage): Promise<SendOutcome> {
    try {
      const r = await this.binding.send({ to: m.to, from: parseSender(this.from), subject: m.subject, html: m.html, text: m.text })
      return { status: 'sent', detail: r?.messageId ? `id:${String(r.messageId).slice(0, 80)}` : undefined }
    } catch (e) {
      const code = String((e as { code?: string }).code ?? 'E_UNKNOWN')
      return { status: CF_RETRYABLE.has(code) ? 'retryable' : 'permanent', detail: code }
    }
  }
}

export function emailProvider(env: Env): EmailProvider | null {
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) return new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
  if (env.EMAIL_PROVIDER === 'cloudflare' && env.EMAIL) return new CloudflareEmailProvider(env.EMAIL, env.EMAIL_FROM)
  return null
}
