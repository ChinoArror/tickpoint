// Reminder rule -> job materialisation.
// A rule describes *when relative to its target* to remind; a job is one
// concrete occurrence (fire instant). Jobs are re-derived whenever the target's
// due information, status or the rule itself changes, so deadline edits
// reschedule and completion cancels.

import { and, eq, inArray } from 'drizzle-orm'
import { parseJson, schema } from '../db/client'
import type { DB } from '../db/client'
import { newId } from '../lib/crypto'
import { zonedTimeToUtc } from '../../shared/time'

/** Anchor time-of-day for reminders on date-only targets (never shown as a due time). */
export const DATE_ONLY_REMINDER_ANCHOR = '09:00'
/** Jobs whose fire time passed less than this long ago are still created (e.g. just-created reminders). */
const LATE_GRACE_MS = 5 * 60_000

export type RuleRow = typeof schema.reminderRules.$inferSelect

export interface TargetState {
  /** Instant offsets are measured from, or null when the target has no usable date. */
  anchorAt: number | null
  /** Completed/archived/deleted targets get no reminders. */
  active: boolean
  title: string
  link: string
}

export async function loadTargetState(db: DB, rule: RuleRow, fallbackZone: string): Promise<TargetState | null> {
  if (rule.taskId) {
    const t = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, rule.taskId) })
    if (!t || t.ownerUuid !== rule.ownerUuid) return null
    let anchorAt: number | null = null
    if (t.duePrecision === 'exact' && t.dueAt != null) anchorAt = t.dueAt
    else if ((t.duePrecision === 'date' || t.duePrecision === 'approximate') && t.dueDate)
      anchorAt = zonedTimeToUtc(t.dueDate, DATE_ONLY_REMINDER_ANCHOR, t.timeZone || fallbackZone)
    return {
      anchorAt,
      active: !t.deletedAt && t.status !== 'completed' && t.status !== 'archived',
      title: t.title,
      link: `/tasks/${t.id}`,
    }
  }
  if (rule.checkpointId) {
    const c = await db.query.checkpoints.findFirst({ where: eq(schema.checkpoints.id, rule.checkpointId) })
    if (!c || c.ownerUuid !== rule.ownerUuid) return null
    return {
      anchorAt: c.targetDate ? zonedTimeToUtc(c.targetDate, DATE_ONLY_REMINDER_ANCHOR, fallbackZone) : null,
      active: !c.deletedAt && c.status === 'pending',
      title: c.title,
      link: c.taskId ? `/tasks/${c.taskId}` : `/goals/${c.goalId}`,
    }
  }
  if (rule.goalId) {
    const g = await db.query.goals.findFirst({ where: eq(schema.goals.id, rule.goalId) })
    if (!g || g.ownerUuid !== rule.ownerUuid) return null
    return {
      anchorAt: g.targetDate ? zonedTimeToUtc(g.targetDate, DATE_ONLY_REMINDER_ANCHOR, fallbackZone) : null,
      active: !g.deletedAt && g.status === 'active',
      title: g.title,
      link: `/goals/${g.id}`,
    }
  }
  return null
}

export function computeFireAt(rule: Pick<RuleRow, 'kind' | 'offsetMinutes' | 'absoluteAt'>, anchorAt: number | null): number | null {
  if (rule.kind === 'absolute') return rule.absoluteAt ?? null
  if (anchorAt == null || rule.offsetMinutes == null) return null
  return anchorAt - rule.offsetMinutes * 60_000
}

/**
 * Bring the pending job for one rule in line with the current target state.
 * Idempotent: the unique dedupe key (rule id + fire instant) prevents duplicates.
 */
export async function syncRule(db: DB, rule: RuleRow, fallbackZone: string, now = Date.now()): Promise<void> {
  const target = await loadTargetState(db, rule, fallbackZone)
  const fireAt = target && target.active && rule.enabled ? computeFireAt(rule, target.anchorAt) : null

  // Cancel pending jobs that no longer match.
  const pending = await db
    .select()
    .from(schema.reminderJobs)
    .where(and(eq(schema.reminderJobs.ruleId, rule.id), inArray(schema.reminderJobs.status, ['pending', 'retryable_failure'])))
  const stale = pending.filter((j) => j.fireAt !== fireAt).map((j) => j.id)
  if (stale.length) {
    await db
      .update(schema.reminderJobs)
      .set({ status: 'cancelled', updatedAt: now })
      .where(inArray(schema.reminderJobs.id, stale))
  }

  if (fireAt == null || fireAt < now - LATE_GRACE_MS) return
  await db
    .insert(schema.reminderJobs)
    .values({
      id: newId(),
      ownerUuid: rule.ownerUuid,
      ruleId: rule.id,
      fireAt,
      status: 'pending',
      dedupeKey: `${rule.id}:${fireAt}`,
    })
    .onConflictDoNothing({ target: schema.reminderJobs.dedupeKey })
}

export async function syncTargetReminders(
  db: DB,
  owner: string,
  target: { taskId?: string; checkpointId?: string; goalId?: string },
  fallbackZone: string,
): Promise<void> {
  const where = target.taskId
    ? eq(schema.reminderRules.taskId, target.taskId)
    : target.checkpointId
      ? eq(schema.reminderRules.checkpointId, target.checkpointId)
      : eq(schema.reminderRules.goalId, target.goalId!)
  const rules = await db.select().from(schema.reminderRules).where(and(where, eq(schema.reminderRules.ownerUuid, owner)))
  for (const r of rules) await syncRule(db, r, fallbackZone)
}

export function ruleChannels(rule: RuleRow): string[] {
  return parseJson<string[]>(rule.channels, ['in_app'])
}
