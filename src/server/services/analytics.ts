// Deterministic analytics over stored data. Metric definitions:
//
// activeTasks        open (not_started|in_progress|paused), not deleted.
// completedTasks     tasks with status completed and completedAt inside the range.
// completionRate     completed / (completed + active), over non-archived, non-deleted tasks
//                    created before the range end. null when the denominator is 0.
// onTimeRate         completed tasks with a confirmed deadline (precision exact or date)
//                    completed at or before that deadline / completed tasks with a confirmed
//                    deadline. Tasks without deadlines are excluded. null when 0.
// overdueTasks       open tasks whose deadline instant has passed.
// checkpointsDone    checkpoints completed inside the range.
// estimated/actual   sums of estimatedMinutes / actualMinutes for tasks completed in range
//                    that have an estimate (planned vs actual compares like with like).
// consistency        days with any recorded activity in the last 28 days / 28.
// Day buckets use the user's time zone. Nothing is extrapolated or back-filled.

import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm'
import { schema } from '../db/client'
import { addDaysToIsoDate, isoDateInZone, TIME } from '../../shared/time'
import { goalActualProgress } from '../../shared/insights'
import type { GoalProgressModel } from '../../shared/constants'
import type { ServiceCtx } from './common'

const OPEN = ['not_started', 'in_progress', 'paused']

export async function computeAnalytics(ctx: ServiceCtx, rangeDays: number) {
  const tz = ctx.timeZone
  const rangeStart = ctx.now - rangeDays * TIME.DAY
  const yearStart = ctx.now - 365 * TIME.DAY
  const t = schema.tasks

  const [counts, completedRows, cpDone, progressRows, upcoming, goals, goalCps, overdueRows] = await ctx.db.batch([
    ctx.db
      .select({
        active: sql<number>`sum(case when ${t.status} in ('not_started','in_progress','paused') then 1 else 0 end)`,
        completedAll: sql<number>`sum(case when ${t.status} = 'completed' then 1 else 0 end)`,
        overdue: sql<number>`sum(case when ${t.status} in ('not_started','in_progress','paused') and ${t.dueSortAt} < ${ctx.now} then 1 else 0 end)`,
        deadlinesOpen: sql<number>`sum(case when ${t.status} in ('not_started','in_progress','paused') and ${t.kind} = 'deadline' then 1 else 0 end)`,
      })
      .from(t)
      .where(and(eq(t.ownerUuid, ctx.owner), isNull(t.deletedAt))),
    ctx.db
      .select({ completedAt: t.completedAt, dueSortAt: t.dueSortAt, precision: t.duePrecision, est: t.estimatedMinutes, act: t.actualMinutes })
      .from(t)
      .where(and(eq(t.ownerUuid, ctx.owner), isNull(t.deletedAt), eq(t.status, 'completed'), gte(t.completedAt, yearStart))),
    ctx.db
      .select({ completedAt: schema.checkpoints.completedAt, targetDate: schema.checkpoints.targetDate, title: schema.checkpoints.title })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), isNull(schema.checkpoints.deletedAt), eq(schema.checkpoints.status, 'done'), gte(schema.checkpoints.completedAt, yearStart))),
    ctx.db
      .select({ at: schema.progressEntries.occurredAt, minutes: schema.progressEntries.minutes })
      .from(schema.progressEntries)
      .where(and(eq(schema.progressEntries.ownerUuid, ctx.owner), gte(schema.progressEntries.occurredAt, yearStart))),
    ctx.db
      .select({ dueSortAt: t.dueSortAt, precision: t.duePrecision, kind: t.kind })
      .from(t)
      .where(and(eq(t.ownerUuid, ctx.owner), isNull(t.deletedAt), inArray(t.status, OPEN), ne(t.duePrecision, 'unknown'), isNotNull(t.dueSortAt))),
    ctx.db
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt), inArray(schema.goals.status, ['active', 'paused', 'completed'])))
      .limit(50),
    ctx.db
      .select({ goalId: schema.checkpoints.goalId, status: schema.checkpoints.status, weight: schema.checkpoints.weight })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), isNotNull(schema.checkpoints.goalId), isNull(schema.checkpoints.deletedAt), ne(schema.checkpoints.status, 'skipped'))),
    ctx.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.ownerUuid, ctx.owner), isNull(t.deletedAt), inArray(t.status, OPEN), lt(t.dueSortAt, ctx.now)))
      .limit(1),
  ])

  const c = counts[0] ?? { active: 0, completedAll: 0, overdue: 0, deadlinesOpen: 0 }
  const inRange = completedRows.filter((r) => (r.completedAt ?? 0) >= rangeStart)
  const withDeadline = inRange.filter((r) => (r.precision === 'exact' || r.precision === 'date') && r.dueSortAt != null)
  const onTime = withDeadline.filter((r) => r.completedAt! <= r.dueSortAt!)
  const estimated = inRange.filter((r) => r.est != null)
  const active = +c.active || 0
  const completedTotal = +c.completedAll || 0

  // Day buckets (user zone).
  const dayKey = (ts: number) => isoDateInZone(ts, tz)
  const today = dayKey(ctx.now)
  const heat = new Map<string, number>()
  const bump = (ts: number | null) => {
    if (ts == null) return
    const k = dayKey(ts)
    heat.set(k, (heat.get(k) ?? 0) + 1)
  }
  completedRows.forEach((r) => bump(r.completedAt))
  cpDone.forEach((r) => bump(r.completedAt))
  progressRows.forEach((r) => bump(r.at))

  const daily: { date: string; tasks: number; checkpoints: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = addDaysToIsoDate(today, -i)
    daily.push({
      date: d,
      tasks: completedRows.filter((r) => dayKey(r.completedAt!) === d).length,
      checkpoints: cpDone.filter((r) => dayKey(r.completedAt!) === d).length,
    })
  }

  // ISO-ish weeks: buckets of 7 days ending today, last 12 weeks.
  const weekly: { weekStart: string; completed: number; checkpoints: number; minutes: number; estimated: number; actual: number }[] = []
  for (let w = 11; w >= 0; w--) {
    const start = addDaysToIsoDate(today, -(w * 7 + 6))
    const end = addDaysToIsoDate(today, -(w * 7))
    const inWeek = (ts: number | null) => {
      if (ts == null) return false
      const k = dayKey(ts)
      return k >= start && k <= end
    }
    const done = completedRows.filter((r) => inWeek(r.completedAt))
    weekly.push({
      weekStart: start,
      completed: done.length,
      checkpoints: cpDone.filter((r) => inWeek(r.completedAt)).length,
      minutes: progressRows.filter((r) => inWeek(r.at)).reduce((s, r) => s + (r.minutes ?? 0), 0),
      estimated: done.filter((r) => r.est != null).reduce((s, r) => s + (r.est ?? 0), 0),
      actual: done.filter((r) => r.est != null).reduce((s, r) => s + (r.act ?? 0), 0),
    })
  }

  // Upcoming deadline distribution by week for the next 8 weeks.
  const distribution = Array.from({ length: 8 }, (_, i) => ({ weekStart: addDaysToIsoDate(today, i * 7), count: 0, strict: 0 }))
  let overdueCount = 0
  for (const u of upcoming) {
    if (u.dueSortAt! < ctx.now) {
      overdueCount++
      continue
    }
    const idx = Math.floor((u.dueSortAt! - ctx.now) / (7 * TIME.DAY))
    if (idx < 8) {
      distribution[idx].count++
      if (u.kind === 'deadline') distribution[idx].strict++
    }
  }

  const cpByGoal = new Map<string, { done: boolean; weight: number }[]>()
  for (const r of goalCps) cpByGoal.set(r.goalId!, [...(cpByGoal.get(r.goalId!) ?? []), { done: r.status === 'done', weight: r.weight }])
  const goalProgress = goals.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    progress: goalActualProgress({
      model: g.progressModel as GoalProgressModel,
      status: g.status,
      currentValue: g.currentValue,
      targetValue: g.targetValue,
      checkpoints: cpByGoal.get(g.id) ?? [],
    }),
    targetDate: g.targetDate,
  }))

  const last28 = new Set<string>()
  for (let i = 0; i < 28; i++) {
    const d = addDaysToIsoDate(today, -i)
    if (heat.has(d)) last28.add(d)
  }

  const checkpointTimeline = cpDone
    .filter((r) => (r.completedAt ?? 0) >= ctx.now - 60 * TIME.DAY)
    .sort((a, b) => a.completedAt! - b.completedAt!)
    .map((r) => {
      const doneDate = dayKey(r.completedAt!)
      return { title: r.title, completedOn: doneDate, targetDate: r.targetDate, onTime: r.targetDate ? doneDate <= r.targetDate : null }
    })

  return {
    generatedAt: ctx.now,
    rangeDays,
    timeZone: tz,
    metrics: {
      activeTasks: active,
      completedTasks: inRange.length,
      completedAllTime: completedTotal,
      completionRate: active + completedTotal > 0 ? completedTotal / (active + completedTotal) : null,
      onTimeRate: withDeadline.length > 0 ? onTime.length / withDeadline.length : null,
      onTimeSample: withDeadline.length,
      overdueTasks: +c.overdue || 0,
      openDeadlines: +c.deadlinesOpen || 0,
      checkpointsCompleted: cpDone.filter((r) => (r.completedAt ?? 0) >= rangeStart).length,
      estimatedMinutes: estimated.reduce((s, r) => s + (r.est ?? 0), 0),
      actualMinutes: estimated.reduce((s, r) => s + (r.act ?? 0), 0),
      loggedMinutes: progressRows.filter((r) => r.at >= rangeStart).reduce((s, r) => s + (r.minutes ?? 0), 0),
      activeDays28: last28.size,
      consistency: last28.size / 28,
      hasOverdue: overdueRows.length > 0,
    },
    daily,
    weekly,
    distribution: { weeks: distribution, overdue: overdueCount },
    goals: goalProgress,
    heatmap: [...heat.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    checkpointTimeline,
  }
}
