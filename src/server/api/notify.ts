// Reminders, notifications and push subscriptions.

import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound, ok, parse, readJson } from '../lib/http'
import { idSchema, pushSubscriptionSchema, reminderCreateSchema, reminderUpdateSchema, snoozeSchema } from '../../shared/schemas'
import { svc } from './context'
import { activity, getOwnedCheckpoint, getOwnedGoal, getOwnedTask } from '../services/common'
import { syncRule } from '../reminders/schedule'
import { copyFor } from '../notifications/templates'
import { emailProvider, sendPush } from '../notifications/channels'
import * as emails from '../services/emails'
import { testEmail } from '../notifications/email-templates'
import { rateLimit } from '../middleware'

export const notifyRoutes = new Hono<AppBindings>()
const idParam = (v: string) => parse(idSchema, v)

// Reminder rules ----------------------------------------------------------------

notifyRoutes.post('/reminders', async (c) => {
  const ctx = await svc(c)
  const input = await readJson(c, reminderCreateSchema)
  if (input.taskId) await getOwnedTask(ctx, input.taskId)
  if (input.goalId) await getOwnedGoal(ctx, input.goalId)
  if (input.checkpointId) await getOwnedCheckpoint(ctx, input.checkpointId)
  if (input.kind === 'absolute' && input.absoluteAt! < ctx.now) throw new AppError('VALIDATION_ERROR', 400, 'Reminder time is in the past', [{ path: 'absoluteAt', message: 'IN_PAST' }])
  const id = newId()
  const target = (input.taskId ?? input.goalId ?? input.checkpointId)!
  await ctx.db.batch([
    ctx.db.insert(schema.reminderRules).values({
      id,
      ownerUuid: ctx.owner,
      taskId: input.taskId ?? null,
      goalId: input.goalId ?? null,
      checkpointId: input.checkpointId ?? null,
      kind: input.kind,
      offsetMinutes: input.kind === 'offset' ? input.offsetMinutes! : null,
      absoluteAt: input.kind === 'absolute' ? input.absoluteAt! : null,
      channels: JSON.stringify(input.channels),
    }),
    activity(ctx, input.taskId ? 'task' : input.goalId ? 'goal' : 'checkpoint', target, 'reminder_added', { kind: input.kind, offsetMinutes: input.offsetMinutes, absoluteAt: input.absoluteAt }),
  ])
  const rule = (await ctx.db.query.reminderRules.findFirst({ where: eq(schema.reminderRules.id, id) }))!
  await syncRule(ctx.db, rule, ctx.timeZone)
  const job = await ctx.db.query.reminderJobs.findFirst({ where: and(eq(schema.reminderJobs.ruleId, id), eq(schema.reminderJobs.status, 'pending')) })
  return ok(c, { id, nextFireAt: job?.fireAt ?? null }, 201)
})

notifyRoutes.patch('/reminders/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const input = await readJson(c, reminderUpdateSchema)
  const set: Record<string, unknown> = { updatedAt: ctx.now }
  if (input.enabled !== undefined) set.enabled = input.enabled
  if (input.offsetMinutes !== undefined) set.offsetMinutes = input.offsetMinutes
  if (input.absoluteAt !== undefined) set.absoluteAt = input.absoluteAt
  if (input.channels) set.channels = JSON.stringify(input.channels)
  const r = await ctx.db.update(schema.reminderRules).set(set).where(and(eq(schema.reminderRules.id, id), eq(schema.reminderRules.ownerUuid, ctx.owner))).returning()
  if (!r.length) throw notFound('Reminder')
  const rule = r[0]
  await activity(ctx, rule.taskId ? 'task' : rule.goalId ? 'goal' : 'checkpoint', (rule.taskId ?? rule.goalId ?? rule.checkpointId)!, 'reminder_modified', input)
  await syncRule(ctx.db, rule, ctx.timeZone)
  return ok(c, { id })
})

notifyRoutes.delete('/reminders/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const r = await ctx.db.delete(schema.reminderRules).where(and(eq(schema.reminderRules.id, id), eq(schema.reminderRules.ownerUuid, ctx.owner))).returning()
  if (!r.length) throw notFound('Reminder')
  const rule = r[0]
  await activity(ctx, rule.taskId ? 'task' : rule.goalId ? 'goal' : 'checkpoint', (rule.taskId ?? rule.goalId ?? rule.checkpointId)!, 'reminder_removed', null)
  return ok(c, { deleted: true })
})

/** Upcoming reminder occurrences (for the dashboard / notification center). */
notifyRoutes.get('/reminders/upcoming', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db
    .select({ id: schema.reminderJobs.id, fireAt: schema.reminderJobs.fireAt, status: schema.reminderJobs.status, taskId: schema.reminderRules.taskId, goalId: schema.reminderRules.goalId, checkpointId: schema.reminderRules.checkpointId, taskTitle: schema.tasks.title, goalTitle: schema.goals.title, checkpointTitle: schema.checkpoints.title })
    .from(schema.reminderJobs)
    .innerJoin(schema.reminderRules, eq(schema.reminderRules.id, schema.reminderJobs.ruleId))
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.reminderRules.taskId))
    .leftJoin(schema.goals, eq(schema.goals.id, schema.reminderRules.goalId))
    .leftJoin(schema.checkpoints, eq(schema.checkpoints.id, schema.reminderRules.checkpointId))
    .where(and(eq(schema.reminderJobs.ownerUuid, ctx.owner), inArray(schema.reminderJobs.status, ['pending', 'retryable_failure'])))
    .orderBy(schema.reminderJobs.fireAt)
    .limit(30)
  return ok(
    c,
    rows.map((r) => ({
      id: r.id,
      jobId: r.id,
      fireAt: r.fireAt,
      status: r.status,
      taskId: r.taskId,
      goalId: r.goalId,
      checkpointId: r.checkpointId,
      title: r.taskTitle ?? r.goalTitle ?? r.checkpointTitle,
      link: r.taskId ? `/tasks/${r.taskId}` : r.goalId ? `/goals/${r.goalId}` : null,
    })),
  )
})

/** Snooze: schedule one extra occurrence of the same rule. */
notifyRoutes.post('/reminders/jobs/:id/snooze', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const { minutes } = await readJson(c, snoozeSchema)
  const job = await ctx.db.query.reminderJobs.findFirst({ where: and(eq(schema.reminderJobs.id, id), eq(schema.reminderJobs.ownerUuid, ctx.owner)) })
  if (!job) throw notFound('Reminder')
  const fireAt = ctx.now + minutes * 60_000
  await ctx.db.batch([
    ctx.db.insert(schema.reminderJobs).values({ id: newId(), ownerUuid: ctx.owner, ruleId: job.ruleId, fireAt, status: 'pending', dedupeKey: `${job.ruleId}:snooze:${fireAt}` }).onConflictDoNothing(),
    ...(job.status === 'pending' ? [ctx.db.update(schema.reminderJobs).set({ status: 'cancelled', lastError: 'snoozed', updatedAt: ctx.now }).where(eq(schema.reminderJobs.id, id))] : []),
  ] as [any, ...any[]])
  return ok(c, { fireAt })
})

// Notifications -------------------------------------------------------------------

notifyRoutes.get('/notifications', async (c) => {
  const ctx = await svc(c)
  const q = parse(z.object({ before: z.coerce.number().int().optional(), unread: z.enum(['1', '0']).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), c.req.query())
  const conds = [eq(schema.notifications.ownerUuid, ctx.owner)]
  if (q.before) conds.push(lt(schema.notifications.createdAt, q.before))
  if (q.unread === '1') conds.push(isNull(schema.notifications.readAt))
  const [items, unread] = await ctx.db.batch([
    ctx.db.select().from(schema.notifications).where(and(...conds)).orderBy(desc(schema.notifications.createdAt)).limit(q.limit),
    ctx.db.select({ n: sql<number>`count(*)` }).from(schema.notifications).where(and(eq(schema.notifications.ownerUuid, ctx.owner), isNull(schema.notifications.readAt))),
  ])
  return ok(c, { items: items.map(({ ownerUuid: _o, ...n }) => n), unread: +(unread[0]?.n ?? 0) })
})

notifyRoutes.post('/notifications/:id/read', async (c) => {
  const ctx = await svc(c)
  await ctx.db.update(schema.notifications).set({ readAt: ctx.now }).where(and(eq(schema.notifications.id, idParam(c.req.param('id'))), eq(schema.notifications.ownerUuid, ctx.owner), isNull(schema.notifications.readAt)))
  return ok(c, { read: true })
})
notifyRoutes.post('/notifications/read-all', async (c) => {
  const ctx = await svc(c)
  await ctx.db.update(schema.notifications).set({ readAt: ctx.now }).where(and(eq(schema.notifications.ownerUuid, ctx.owner), isNull(schema.notifications.readAt)))
  return ok(c, { read: true })
})

notifyRoutes.get('/notifications/deliveries', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db.select().from(schema.notificationDeliveries).where(eq(schema.notificationDeliveries.ownerUuid, ctx.owner)).orderBy(desc(schema.notificationDeliveries.attemptedAt)).limit(50)
  return ok(c, rows.map(({ ownerUuid: _o, ...d }) => ({ ...d, createdAt: d.attemptedAt })))
})

/** Send a test through every enabled channel; reports real per-channel outcomes. */
notifyRoutes.post('/notifications/test', rateLimit('notify-test', 600_000, 5), async (c) => {
  const ctx = await svc(c)
  const s = ctx.settings
  const copy = copyFor(s.locale)
  const results: Record<string, { status: string; detail?: string; sent?: number; total?: number }> = {}
  await ctx.db.insert(schema.notifications).values({ id: newId(), ownerUuid: ctx.owner, type: 'test', title: copy.testTitle, body: copy.testBody, link: '/settings/notifications' })
  results.in_app = { status: 'sent' }
  if (s.notifyPush) results.push = await sendPush(c.env, ctx.db, { owner: ctx.owner, title: copy.testTitle, body: copy.testBody, link: '/settings/notifications', tag: 'tp-test' })
  if (s.notifyEmail) {
    const provider = emailProvider(c.env)
    const addresses = await emails.deliverableAddresses(ctx.db, ctx.owner)
    if (!provider) results.email = { status: 'skipped', detail: 'email_provider_not_configured' }
    else if (!addresses.length) results.email = { status: 'skipped', detail: 'no_verified_email' }
    else {
      const msg = testEmail({ locale: s.locale, origin: c.env.APP_ORIGIN })
      const outs = await Promise.all(addresses.map((to) => provider.send({ to, ...msg })))
      const sent = outs.filter((o) => o.status === 'sent').length
      results.email = sent ? { status: 'sent', detail: `${sent}/${addresses.length}`, sent, total: addresses.length } : { ...outs[0], sent: 0, total: addresses.length }
    }
  }
  for (const [channel, r] of Object.entries(results)) {
    await ctx.db.insert(schema.notificationDeliveries).values({ id: newId(), ownerUuid: ctx.owner, jobId: null, channel, status: r.status === 'sent' ? 'sent' : r.status === 'skipped' ? 'skipped' : 'failed', detail: `test${r.detail ? ':' + r.detail : ''}`, attemptedAt: ctx.now })
  }
  return ok(c, results)
})

// Push subscriptions ----------------------------------------------------------------

notifyRoutes.post('/push/subscriptions', async (c) => {
  const ctx = await svc(c)
  const sub = await readJson(c, pushSubscriptionSchema)
  await ctx.db
    .insert(schema.pushSubscriptions)
    .values({ id: newId(), ownerUuid: ctx.owner, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: (c.req.header('user-agent') ?? '').slice(0, 300) })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { ownerUuid: ctx.owner, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failureCount: 0 } })
  return ok(c, { subscribed: true }, 201)
})
notifyRoutes.delete('/push/subscriptions', async (c) => {
  const ctx = await svc(c)
  const { endpoint } = await readJson(c, z.object({ endpoint: z.string().max(2048) }))
  await ctx.db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.ownerUuid, ctx.owner)))
  return ok(c, { unsubscribed: true })
})
notifyRoutes.get('/push/subscriptions', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db.select({ id: schema.pushSubscriptions.id, userAgent: schema.pushSubscriptions.userAgent, createdAt: schema.pushSubscriptions.createdAt, lastSuccessAt: schema.pushSubscriptions.lastSuccessAt }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.ownerUuid, ctx.owner))
  return ok(c, rows)
})

// Email recipients --------------------------------------------------------------------

notifyRoutes.get('/notification-emails', async (c) => {
  const ctx = await svc(c)
  return ok(c, { items: await emails.listRecipients(ctx), max: emails.MAX_RECIPIENTS, emailConfigured: Boolean(emailProvider(c.env)) })
})
notifyRoutes.post('/notification-emails', async (c) => {
  const ctx = await svc(c)
  const { address } = await readJson(c, z.object({ address: emails.emailAddressSchema }))
  return ok(c, await emails.addRecipient(ctx, c.env, address, ctx.settings.locale), 201)
})
notifyRoutes.post('/notification-emails/:id/resend', async (c) => {
  const ctx = await svc(c)
  return ok(c, await emails.resendCode(ctx, c.env, idParam(c.req.param('id')), ctx.settings.locale))
})
notifyRoutes.post('/notification-emails/:id/verify', rateLimit('email-verify-attempt', 600_000, 30), async (c) => {
  const ctx = await svc(c)
  const { code } = await readJson(c, z.object({ code: z.string().trim().max(12) }))
  return ok(c, await emails.verifyRecipient(ctx, idParam(c.req.param('id')), code.replace(/\s+/g, '')))
})
notifyRoutes.patch('/notification-emails/:id', async (c) => {
  const ctx = await svc(c)
  const { enabled } = await readJson(c, z.object({ enabled: z.boolean() }))
  return ok(c, await emails.setRecipientEnabled(ctx, idParam(c.req.param('id')), enabled))
})
notifyRoutes.delete('/notification-emails/:id', async (c) => {
  await emails.removeRecipient(await svc(c), idParam(c.req.param('id')))
  return ok(c, { deleted: true })
})
