// Cron-driven reminder dispatch.
// Lifecycle: pending -> (due) -> claimed -> sending -> sent | retryable_failure | permanent_failure
// - Claiming is a single atomic UPDATE ... RETURNING, so overlapping cron runs never double-claim.
// - Each channel delivery is logged; channels already delivered for a job are skipped on retry,
//   and the in-app notification is unique per job, so retries are idempotent.
// - Cron granularity is one minute; delivery is "within about a minute", never second-exact.

import { and, eq, inArray, lt, or, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getDb, schema, type DB } from '../db/client'
import { newId, randomToken } from '../lib/crypto'
import { copyFor, formatWhen } from '../notifications/templates'
import { reminderEmail } from '../notifications/email-templates'
import { buildReminderEmailData } from '../notifications/reminder-email-data'
import { deliverableAddresses } from '../services/emails'
import { emailProvider, sendPush, type SendOutcome } from '../notifications/channels'
import { loadTargetState, ruleChannels } from './schedule'
import { wallClockAt, zonedTimeToUtc, isoDateInZone, addDaysToIsoDate } from '../../shared/time'

const BATCH = 50
const MAX_ATTEMPTS = 5
const STALE_CLAIM_MS = 10 * 60_000

export interface DispatchReport {
  claimed: number
  sent: number
  deferred: number
  cancelled: number
  retry: number
  failed: number
}

export async function dispatchDueReminders(env: Env, now = Date.now()): Promise<DispatchReport> {
  const db = getDb(env.DB)
  const report: DispatchReport = { claimed: 0, sent: 0, deferred: 0, cancelled: 0, retry: 0, failed: 0 }

  // Recover jobs stuck in claimed/sending (worker crashed mid-run).
  await db
    .update(schema.reminderJobs)
    .set({ status: 'retryable_failure', nextAttemptAt: now, lastError: 'stale_claim', updatedAt: now })
    .where(and(inArray(schema.reminderJobs.status, ['claimed', 'sending']), lt(schema.reminderJobs.claimedAt, now - STALE_CLAIM_MS)))

  const token = randomToken(12)
  const claimed = await env.DB.prepare(
    `UPDATE reminder_jobs SET status = 'claimed', claim_token = ?1, claimed_at = ?2, updated_at = ?2
     WHERE id IN (
       SELECT id FROM reminder_jobs
       WHERE (status = 'pending' AND fire_at <= ?2)
          OR (status = 'retryable_failure' AND coalesce(next_attempt_at, 0) <= ?2)
       ORDER BY fire_at LIMIT ?3
     )
     RETURNING id`,
  )
    .bind(token, now, BATCH)
    .all<{ id: string }>()

  const ids = (claimed.results ?? []).map((r) => r.id)
  report.claimed = ids.length
  for (const id of ids) {
    try {
      const outcome = await processJob(env, db, id, token, now)
      report[outcome]++
    } catch (e) {
      console.error('reminder_job_error', id, (e as Error).message)
      await db
        .update(schema.reminderJobs)
        .set({ status: 'retryable_failure', lastError: 'internal_error', nextAttemptAt: now + 60_000, updatedAt: now })
        .where(and(eq(schema.reminderJobs.id, id), eq(schema.reminderJobs.claimToken, token)))
      report.retry++
    }
  }
  return report
}

function inQuietHours(now: number, tz: string, start: string, end: string): boolean {
  const w = wallClockAt(now, tz)
  const cur = w.hour * 60 + w.minute
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm
  const e = eh * 60 + em
  if (s === e) return false
  return s < e ? cur >= s && cur < e : cur >= s || cur < e
}

function quietEndInstant(now: number, tz: string, end: string): number {
  const today = isoDateInZone(now, tz)
  const t = zonedTimeToUtc(today, end, tz)
  return t > now ? t : zonedTimeToUtc(addDaysToIsoDate(today, 1), end, tz)
}

async function processJob(env: Env, db: DB, id: string, token: string, now: number): Promise<keyof Omit<DispatchReport, 'claimed'>> {
  const job = await db.query.reminderJobs.findFirst({ where: and(eq(schema.reminderJobs.id, id), eq(schema.reminderJobs.claimToken, token)) })
  if (!job) return 'cancelled'
  const finish = (set: Partial<typeof schema.reminderJobs.$inferInsert>) =>
    db.update(schema.reminderJobs).set({ ...set, updatedAt: now }).where(and(eq(schema.reminderJobs.id, id), eq(schema.reminderJobs.claimToken, token)))

  const rule = await db.query.reminderRules.findFirst({ where: eq(schema.reminderRules.id, job.ruleId) })
  const settings = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userUuid, job.ownerUuid) })
  const tz = settings?.timeZone ?? 'UTC'
  const target = rule ? await loadTargetState(db, rule, tz) : null
  if (!rule || !rule.enabled || !target || !target.active) {
    await finish({ status: 'cancelled', lastError: 'target_inactive' })
    return 'cancelled'
  }

  if (settings?.quietHoursEnabled && inQuietHours(now, tz, settings.quietStart, settings.quietEnd)) {
    await finish({ status: 'pending', fireAt: quietEndInstant(now, tz, settings.quietEnd), claimToken: null })
    return 'deferred'
  }

  await finish({ status: 'sending', attempts: job.attempts + 1 })

  const locale = settings?.locale ?? 'en'
  const copy = copyFor(locale)
  const dateOnly = !!rule.taskId && (await isDateOnlyTask(db, rule.taskId))
  const title = copy.reminderTitle(target.title)
  const body = target.anchorAt != null ? copy.reminderBody(formatWhen(target.anchorAt, locale, tz, dateOnly || !rule.taskId)) : copy.reminderBodyNoDate
  const link = target.link

  const enabled = new Set(ruleChannels(rule))
  if (!settings?.notifyInApp) enabled.delete('in_app')
  if (!settings?.notifyPush) enabled.delete('push')
  if (!settings?.notifyEmail) enabled.delete('email')

  const done = await db
    .select({ channel: schema.notificationDeliveries.channel })
    .from(schema.notificationDeliveries)
    .where(and(eq(schema.notificationDeliveries.jobId, id), or(eq(schema.notificationDeliveries.status, 'sent'), eq(schema.notificationDeliveries.status, 'skipped'))))
  const alreadyDone = new Set(done.map((d) => d.channel))

  const outcomes: SendOutcome[] = []
  const log = (channel: string, o: SendOutcome) =>
    db.insert(schema.notificationDeliveries).values({
      id: newId(),
      ownerUuid: job.ownerUuid,
      jobId: id,
      channel,
      status: o.status === 'sent' ? 'sent' : o.status === 'skipped' ? 'skipped' : 'failed',
      detail: o.detail ?? null,
      attemptedAt: now,
    })

  // In-app notification history is always recorded (unique per job => idempotent).
  if (!alreadyDone.has('in_app')) {
    await db
      .insert(schema.notifications)
      .values({ id: newId(), ownerUuid: job.ownerUuid, type: 'reminder', title, body, link, jobId: id, targetType: rule.taskId ? 'task' : rule.goalId ? 'goal' : 'checkpoint', targetId: rule.taskId ?? rule.goalId ?? rule.checkpointId })
      .onConflictDoNothing({ target: schema.notifications.jobId })
    const o: SendOutcome = { status: enabled.has('in_app') ? 'sent' : 'skipped', detail: enabled.has('in_app') ? undefined : 'history_only' }
    await log('in_app', o)
  }

  if (enabled.has('push') && !alreadyDone.has('push')) {
    const o = await sendPush(env, db, { owner: job.ownerUuid, title, body, link, tag: `tp-${job.ruleId}` })
    outcomes.push(o)
    await log('push', o)
  }

  if (enabled.has('email') && !alreadyDone.has('email')) {
    const provider = emailProvider(env)
    const addresses = await deliverableAddresses(db, job.ownerUuid)
    let o: SendOutcome
    if (!addresses.length) o = { status: 'skipped', detail: 'no_verified_email' }
    else if (!provider) o = { status: 'skipped', detail: 'email_provider_not_configured' }
    else {
      const m = reminderEmail(await buildReminderEmailData(db, rule, target, { locale, tz, now, origin: env.APP_ORIGIN }))
      const outs = await Promise.all(addresses.map((to) => provider.send({ to, ...m })))
      const sent = outs.filter((x) => x.status === 'sent').length
      o = sent
        ? { status: 'sent', detail: `${sent}/${addresses.length}` }
        : { status: outs.some((x) => x.status === 'retryable') ? 'retryable' : 'permanent', detail: outs[0]?.detail }
    }
    outcomes.push(o)
    await log('email', o)
  }

  const retryable = outcomes.some((o) => o.status === 'retryable')
  const permanent = outcomes.some((o) => o.status === 'permanent')
  if (retryable && job.attempts + 1 < MAX_ATTEMPTS) {
    await finish({ status: 'retryable_failure', nextAttemptAt: now + 2 ** job.attempts * 60_000, lastError: outcomes.find((o) => o.status === 'retryable')?.detail ?? null })
    return 'retry'
  }
  if (retryable || permanent) {
    await finish({ status: 'permanent_failure', sentAt: now, lastError: outcomes.find((o) => o.status !== 'sent' && o.status !== 'skipped')?.detail ?? null })
    return 'failed'
  }
  await finish({ status: 'sent', sentAt: now, lastError: null })
  return 'sent'
}

async function isDateOnlyTask(db: DB, taskId: string) {
  const t = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId), columns: { duePrecision: true } })
  return t?.duePrecision !== 'exact'
}

/** Daily housekeeping: expired sessions, old jobs/deliveries, stale drafts, rate-limit windows. */
export async function housekeeping(env: Env, now = Date.now()) {
  const db = getDb(env.DB)
  const day = 86_400_000
  await db.batch([
    db.delete(schema.sessions).where(lt(schema.sessions.jwtExp, now - day)),
    db.delete(schema.reminderJobs).where(and(inArray(schema.reminderJobs.status, ['sent', 'cancelled', 'permanent_failure']), lt(schema.reminderJobs.updatedAt, now - 60 * day))),
    db.delete(schema.notificationDeliveries).where(lt(schema.notificationDeliveries.attemptedAt, now - 90 * day)),
    db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, now - 2 * day)),
    // Pending extraction drafts keep a temporary source copy; drop it after 7 days.
    db.update(schema.aiExtractionDrafts).set({ sourceText: null, status: 'rejected' }).where(and(eq(schema.aiExtractionDrafts.status, 'pending'), lt(schema.aiExtractionDrafts.createdAt, now - 7 * day))),
    db.delete(schema.aiExtractionDrafts).where(and(inArray(schema.aiExtractionDrafts.status, ['rejected']), lt(schema.aiExtractionDrafts.updatedAt, now - 30 * day))),
    db.delete(schema.aiPlanningDrafts).where(and(inArray(schema.aiPlanningDrafts.status, ['rejected', 'pending']), lt(schema.aiPlanningDrafts.updatedAt, now - 30 * day))),
    db.delete(schema.notifications).where(and(sql`${schema.notifications.readAt} is not null`, lt(schema.notifications.createdAt, now - 180 * day))),
  ])
}
