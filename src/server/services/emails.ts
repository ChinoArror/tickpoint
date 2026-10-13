// Email notification recipients: the AuthCenter account email (trusted when
// AuthCenter verified it) plus extra addresses the user adds and verifies here.

import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Env } from '../env'
import { schema, type DB } from '../db/client'
import { newId, sha256Hex, timingSafeEqual } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import { hitRateLimit } from '../middleware'
import { emailProvider } from '../notifications/channels'
import { verificationEmail } from '../notifications/email-templates'
import { activity, type ServiceCtx } from './common'

export const MAX_RECIPIENTS = 5
const CODE_TTL_MIN = 20
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60_000

export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z0-9-]{2,}$/i, 'INVALID_EMAIL')

export type RecipientRow = typeof schema.notificationEmails.$inferSelect

export function serializeRecipient(r: RecipientRow) {
  return {
    id: r.id,
    address: r.address,
    source: r.source as 'account' | 'user',
    verified: r.verifiedAt != null,
    verifiedAt: r.verifiedAt,
    enabled: r.enabled,
    pendingVerification: r.verifiedAt == null && r.codeHash != null && (r.codeExpiresAt ?? 0) > Date.now(),
    lastSentAt: r.lastSentAt,
    createdAt: r.createdAt,
  }
}

export async function listRecipients(ctx: ServiceCtx) {
  const rows = await ctx.db
    .select()
    .from(schema.notificationEmails)
    .where(eq(schema.notificationEmails.ownerUuid, ctx.owner))
    .orderBy(asc(schema.notificationEmails.createdAt))
  // Account address first.
  return rows.sort((a, b) => (a.source === 'account' ? -1 : b.source === 'account' ? 1 : 0)).map(serializeRecipient)
}

/** Verified, enabled addresses for delivery. */
export async function deliverableAddresses(db: DB, owner: string): Promise<string[]> {
  const rows = await db
    .select({ address: schema.notificationEmails.address })
    .from(schema.notificationEmails)
    .where(and(eq(schema.notificationEmails.ownerUuid, owner), isNotNull(schema.notificationEmails.verifiedAt), eq(schema.notificationEmails.enabled, true)))
  return [...new Set(rows.map((r) => r.address))]
}

async function owned(ctx: ServiceCtx, id: string) {
  const r = await ctx.db.query.notificationEmails.findFirst({ where: and(eq(schema.notificationEmails.id, id), eq(schema.notificationEmails.ownerUuid, ctx.owner)) })
  if (!r) throw notFound('Email address')
  return r
}

const codeHash = (id: string, code: string) => sha256Hex(`tickpoint-email-verify:${id}:${code}`)

function newCode(): string {
  // Uniform 6-digit code from 32 random bits.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

async function sendCode(ctx: ServiceCtx, env: Env, row: RecipientRow, locale: string) {
  const provider = emailProvider(env)
  if (!provider) throw new AppError('NOT_CONFIGURED', 503, 'Email delivery is not configured on this server')
  if (row.lastSentAt && Date.now() - row.lastSentAt < RESEND_COOLDOWN_MS) throw new AppError('RATE_LIMITED', 429, 'Please wait a minute before requesting another code')
  const rl = await hitRateLimit(env.DB, `email-verify:${ctx.owner}`, 3600_000, 8)
  if (!rl.allowed) throw new AppError('RATE_LIMITED', 429, 'Too many verification emails. Try again later.')

  const code = newCode()
  const now = Date.now()
  await ctx.db
    .update(schema.notificationEmails)
    .set({ codeHash: await codeHash(row.id, code), codeExpiresAt: now + CODE_TTL_MIN * 60_000, codeAttempts: 0, lastSentAt: now })
    .where(eq(schema.notificationEmails.id, row.id))

  const verifyUrl = new URL('/settings/notifications', env.APP_ORIGIN)
  verifyUrl.searchParams.set('verifyEmail', row.id)
  verifyUrl.searchParams.set('code', code)
  const msg = verificationEmail({ locale, origin: env.APP_ORIGIN, code, verifyUrl: verifyUrl.toString(), expiresMinutes: CODE_TTL_MIN })
  const out = await provider.send({ to: row.address, ...msg })
  await ctx.db.insert(schema.notificationDeliveries).values({
    id: newId(),
    ownerUuid: ctx.owner,
    jobId: null,
    channel: 'email',
    status: out.status === 'sent' ? 'sent' : 'failed',
    detail: `verification${out.detail ? ':' + out.detail : ''}`,
    attemptedAt: now,
  })
  if (out.status !== 'sent') throw new AppError('INTERNAL_ERROR', 502, 'The verification email could not be sent', { reason: out.detail })
}

export async function addRecipient(ctx: ServiceCtx, env: Env, address: string, locale: string) {
  const existing = await ctx.db.query.notificationEmails.findFirst({
    where: and(eq(schema.notificationEmails.ownerUuid, ctx.owner), eq(schema.notificationEmails.address, address)),
  })
  if (existing?.verifiedAt) throw new AppError('CONFLICT', 409, 'This address is already verified')
  let row = existing
  if (!row) {
    // The cap applies to user-added addresses; the account email does not count.
    const count = (
      await ctx.db
        .select({ id: schema.notificationEmails.id })
        .from(schema.notificationEmails)
        .where(and(eq(schema.notificationEmails.ownerUuid, ctx.owner), eq(schema.notificationEmails.source, 'user')))
    ).length
    if (count >= MAX_RECIPIENTS) throw new AppError('CONFLICT', 409, `You can add up to ${MAX_RECIPIENTS} addresses`)
    const id = newId()
    await ctx.db.insert(schema.notificationEmails).values({ id, ownerUuid: ctx.owner, address, source: 'user' })
    row = (await owned(ctx, id))!
    await activity(ctx, 'notification_email', id, 'added', null)
  }
  await sendCode(ctx, env, row, locale)
  return serializeRecipient(await owned(ctx, row.id))
}

export async function resendCode(ctx: ServiceCtx, env: Env, id: string, locale: string) {
  const row = await owned(ctx, id)
  if (row.verifiedAt) throw new AppError('CONFLICT', 409, 'This address is already verified')
  await sendCode(ctx, env, row, locale)
  return serializeRecipient(await owned(ctx, id))
}

export async function verifyRecipient(ctx: ServiceCtx, id: string, code: string) {
  const row = await owned(ctx, id)
  if (row.verifiedAt) return serializeRecipient(row)
  if (!row.codeHash || !row.codeExpiresAt || row.codeExpiresAt < Date.now()) {
    throw new AppError('VERIFICATION_FAILED', 400, 'The code has expired. Request a new one.', { reason: 'expired' })
  }
  if (row.codeAttempts >= MAX_ATTEMPTS) throw new AppError('VERIFICATION_FAILED', 400, 'Too many attempts. Request a new code.', { reason: 'attempts' })
  const ok = /^\d{6}$/.test(code) && timingSafeEqual(await codeHash(id, code), row.codeHash)
  if (!ok) {
    await ctx.db.update(schema.notificationEmails).set({ codeAttempts: row.codeAttempts + 1 }).where(eq(schema.notificationEmails.id, id))
    throw new AppError('VERIFICATION_FAILED', 400, 'That code is not correct', { reason: 'mismatch', attemptsLeft: MAX_ATTEMPTS - row.codeAttempts - 1 })
  }
  const now = Date.now()
  const hadVerified = (await deliverableAddresses(ctx.db, ctx.owner)).length > 0
  await ctx.db.batch([
    ctx.db.update(schema.notificationEmails).set({ verifiedAt: now, codeHash: null, codeExpiresAt: null, codeAttempts: 0, enabled: true }).where(eq(schema.notificationEmails.id, id)),
    // The first verified address switches email reminders on, matching the account-email default.
    ...(hadVerified ? [] : [ctx.db.update(schema.userSettings).set({ notifyEmail: true, updatedAt: now }).where(eq(schema.userSettings.userUuid, ctx.owner))]),
    activity(ctx, 'notification_email', id, 'verified', null),
  ] as [any, ...any[]])
  return serializeRecipient(await owned(ctx, id))
}

export async function setRecipientEnabled(ctx: ServiceCtx, id: string, enabled: boolean) {
  await owned(ctx, id)
  await ctx.db.update(schema.notificationEmails).set({ enabled }).where(eq(schema.notificationEmails.id, id))
  return serializeRecipient(await owned(ctx, id))
}

export async function removeRecipient(ctx: ServiceCtx, id: string) {
  const row = await owned(ctx, id)
  if (row.source === 'account') throw new AppError('FORBIDDEN', 403, 'The account email can be turned off but not removed')
  await ctx.db.delete(schema.notificationEmails).where(eq(schema.notificationEmails.id, id))
  await activity(ctx, 'notification_email', id, 'removed', null)
}
