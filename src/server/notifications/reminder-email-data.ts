// Collects the facts shown in a reminder email, localized for the recipient.

import { and, asc, eq, isNull } from 'drizzle-orm'
import { schema, type DB } from '../db/client'
import { goalActualProgress } from '../../shared/insights'
import type { GoalProgressModel } from '../../shared/constants'
import type { ReminderEmailData } from './email-templates'
import type { RuleRow, TargetState } from '../reminders/schedule'
import { formatWhen } from './templates'

const PRIORITY: Record<string, Record<string, string>> = {
  en: { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' },
  ja: { low: '低', medium: '中', high: '高', urgent: '緊急' },
}

/** "Due in 1 day 3 hours" / "Overdue by 2 hours", or Japanese equivalents. */
export function relativeLabel(locale: string, diffMs: number): string {
  const abs = Math.abs(diffMs)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor((abs % 86_400_000) / 3_600_000)
  const m = Math.max(1, Math.floor((abs % 3_600_000) / 60_000))
  const ja = locale === 'ja'
  let span: string
  if (ja) span = d ? `${d}日${h ? `${h}時間` : ''}` : h ? `${h}時間${m && h < 6 ? `${m}分` : ''}` : `${m}分`
  else {
    const p = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
    span = d ? [p(d, 'day'), h ? p(h, 'hour') : ''].filter(Boolean).join(' ') : h ? [p(h, 'hour'), h < 6 ? p(m, 'minute') : ''].filter(Boolean).join(' ') : p(m, 'minute')
  }
  if (diffMs < 0) return ja ? `${span}超過` : `Overdue by ${span}`
  return ja ? `あと${span}` : `Due in ${span}`
}

function zoneLabel(instant: number, tz: string, locale: string) {
  const abbr = new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date(instant))
    .find((p) => p.type === 'timeZoneName')?.value
  return abbr && abbr !== tz ? `${tz.replace(/_/g, ' ')} (${abbr})` : tz.replace(/_/g, ' ')
}

function dateLabel(iso: string | null, locale: string) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'UTC', month: locale === 'ja' ? 'numeric' : 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)))
}

async function nextCheckpoints(db: DB, where: { taskId?: string; goalId?: string }, locale: string) {
  const rows = await db
    .select({ title: schema.checkpoints.title, targetDate: schema.checkpoints.targetDate })
    .from(schema.checkpoints)
    .where(
      and(
        where.taskId ? eq(schema.checkpoints.taskId, where.taskId) : eq(schema.checkpoints.goalId, where.goalId!),
        eq(schema.checkpoints.status, 'pending'),
        isNull(schema.checkpoints.deletedAt),
      ),
    )
    .orderBy(asc(schema.checkpoints.sortOrder))
    .limit(3)
  return rows.map((r) => ({ title: r.title, dateLabel: dateLabel(r.targetDate, locale) }))
}

export async function buildReminderEmailData(
  db: DB,
  rule: RuleRow,
  target: TargetState,
  o: { locale: string; tz: string; now: number; origin: string },
): Promise<ReminderEmailData> {
  const base: ReminderEmailData = {
    locale: o.locale,
    origin: o.origin,
    title: target.title,
    link: target.link,
    kind: 'task',
    overdue: false,
    whenLabel: null,
    zoneLabel: null,
    relativeLabel: null,
    progressPercent: null,
    priorityLabel: null,
    projectName: null,
    nextCheckpoints: [],
  }

  if (rule.taskId) {
    const t = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, rule.taskId) })
    if (!t) return base
    const project = t.projectId ? await db.query.projects.findFirst({ where: eq(schema.projects.id, t.projectId), columns: { name: true } }) : null
    const exact = t.duePrecision === 'exact' && t.dueAt != null
    const anchor = exact ? t.dueAt! : t.dueSortAt
    return {
      ...base,
      kind: t.kind === 'deadline' ? 'deadline' : 'task',
      overdue: anchor != null && anchor < o.now,
      whenLabel: exact ? formatWhen(t.dueAt!, o.locale, o.tz, false) : t.dueDate ? formatWhen(Date.parse(`${t.dueDate}T12:00:00Z`), o.locale, 'UTC', true) : null,
      zoneLabel: exact ? zoneLabel(t.dueAt!, o.tz, o.locale) : null,
      relativeLabel: anchor != null ? relativeLabel(o.locale, anchor - o.now) : null,
      progressPercent: t.progressPercent,
      priorityLabel: PRIORITY[o.locale === 'ja' ? 'ja' : 'en'][t.priority] ?? null,
      projectName: project?.name ?? null,
      nextCheckpoints: await nextCheckpoints(db, { taskId: t.id }, o.locale),
    }
  }

  if (rule.checkpointId) {
    const c = await db.query.checkpoints.findFirst({ where: eq(schema.checkpoints.id, rule.checkpointId) })
    if (!c) return base
    const parent = c.taskId
      ? (await db.query.tasks.findFirst({ where: eq(schema.tasks.id, c.taskId), columns: { title: true } }))?.title
      : c.goalId
        ? (await db.query.goals.findFirst({ where: eq(schema.goals.id, c.goalId), columns: { title: true } }))?.title
        : null
    return {
      ...base,
      kind: 'checkpoint',
      parentTitle: parent ?? null,
      overdue: target.anchorAt != null && c.targetDate != null && Date.parse(`${c.targetDate}T23:59:59Z`) < o.now - 86_400_000,
      whenLabel: c.targetDate ? formatWhen(Date.parse(`${c.targetDate}T12:00:00Z`), o.locale, 'UTC', true) : null,
      relativeLabel: target.anchorAt != null ? relativeLabel(o.locale, target.anchorAt - o.now) : null,
    }
  }

  if (rule.goalId) {
    const g = await db.query.goals.findFirst({ where: eq(schema.goals.id, rule.goalId) })
    if (!g) return base
    const cps = await db
      .select({ status: schema.checkpoints.status, weight: schema.checkpoints.weight })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.goalId, g.id), isNull(schema.checkpoints.deletedAt)))
    const actual = goalActualProgress({
      model: g.progressModel as GoalProgressModel,
      status: g.status,
      currentValue: g.currentValue,
      targetValue: g.targetValue,
      checkpoints: cps.filter((x) => x.status !== 'skipped').map((x) => ({ done: x.status === 'done', weight: x.weight })),
    })
    return {
      ...base,
      kind: 'goal',
      whenLabel: g.targetDate ? formatWhen(Date.parse(`${g.targetDate}T12:00:00Z`), o.locale, 'UTC', true) : null,
      relativeLabel: target.anchorAt != null ? relativeLabel(o.locale, target.anchorAt - o.now) : null,
      progressPercent: actual * 100,
      nextCheckpoints: await nextCheckpoints(db, { goalId: g.id }, o.locale),
    }
  }
  return base
}
