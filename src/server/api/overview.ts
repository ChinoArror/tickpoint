// Dashboard, calendar and analytics read models.

import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { ok, parse } from '../lib/http'
import { isoDateSchema } from '../../shared/schemas'
import { addDaysToIsoDate, endOfZonedDay, isoDateInZone, startOfZonedDay, TIME } from '../../shared/time'
import { svc } from './context'
import { enrichTasks, listTasks } from '../services/tasks'
import { listGoals, serializeProgress } from '../services/goals'
import { checkpointsInRange } from '../services/checkpoints'
import { computeAnalytics } from '../services/analytics'

export const overviewRoutes = new Hono<AppBindings>()

overviewRoutes.get('/time', (c) => c.json({ success: true, data: { now: Date.now() }, error: null }))

/** Everything the Overview page needs in one round trip, with bounded result sizes. */
overviewRoutes.get('/dashboard', async (c) => {
  const ctx = await svc(c)
  const today = isoDateInZone(ctx.now, ctx.timeZone)
  const weekAgo = ctx.now - 7 * TIME.DAY

  const [todayList, upcoming, goals, todayCps, recentProgress, recentCps, week] = await Promise.all([
    listTasks(ctx, { view: 'today', limit: 30 }),
    listTasks(ctx, { view: 'upcoming', limit: 12, kind: undefined }),
    listGoals(ctx, { status: 'active' }),
    checkpointsInRange(ctx, addDaysToIsoDate(today, -30), today),
    ctx.db
      .select({ p: schema.progressEntries, taskTitle: schema.tasks.title, goalTitle: schema.goals.title })
      .from(schema.progressEntries)
      .leftJoin(schema.tasks, eq(schema.tasks.id, schema.progressEntries.taskId))
      .leftJoin(schema.goals, eq(schema.goals.id, schema.progressEntries.goalId))
      .where(eq(schema.progressEntries.ownerUuid, ctx.owner))
      .orderBy(desc(schema.progressEntries.occurredAt))
      .limit(8),
    ctx.db
      .select({ id: schema.checkpoints.id, title: schema.checkpoints.title, completedAt: schema.checkpoints.completedAt, taskId: schema.checkpoints.taskId, goalId: schema.checkpoints.goalId })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), eq(schema.checkpoints.status, 'done'), isNull(schema.checkpoints.deletedAt)))
      .orderBy(desc(schema.checkpoints.completedAt))
      .limit(6),
    ctx.db
      .select({
        completed: sql<number>`sum(case when ${schema.tasks.status} = 'completed' and ${schema.tasks.completedAt} >= ${weekAgo} then 1 else 0 end)`,
        remaining: sql<number>`sum(case when ${schema.tasks.status} in ('not_started','in_progress','paused') and ${schema.tasks.dueSortAt} <= ${ctx.now + 7 * TIME.DAY} then 1 else 0 end)`,
        created: sql<number>`sum(case when ${schema.tasks.createdAt} >= ${weekAgo} then 1 else 0 end)`,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt))),
  ])

  // Needs attention: overdue + at-risk among open dated items (bounded scan).
  const openDated = await ctx.db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt), inArray(schema.tasks.status, ['not_started', 'in_progress', 'paused']), lte(schema.tasks.dueSortAt, ctx.now + 21 * TIME.DAY)))
    .orderBy(schema.tasks.dueSortAt)
    .limit(60)
  const attention = (await enrichTasks(ctx, openDated)).filter((t) => t.risk.level === 'overdue' || t.risk.level === 'at_risk' || t.risk.level === 'attention').slice(0, 8)

  const w = week[0] ?? { completed: 0, remaining: 0, created: 0 }
  return ok(c, {
    today,
    timeZone: ctx.timeZone,
    todayTasks: todayList.items,
    todayCheckpoints: todayCps.filter((cp) => cp.status === 'pending'),
    upcoming: upcoming.items,
    attention,
    goals: goals.slice(0, 6),
    recentProgress: recentProgress.map((r) => ({ ...serializeProgress(r.p), title: r.taskTitle ?? r.goalTitle })),
    recentCheckpoints: recentCps,
    week: { completed: +w.completed || 0, dueSoon: +w.remaining || 0, created: +w.created || 0 },
  })
})

/** Calendar feed: tasks by due date or scheduled date, checkpoints, goal targets. */
overviewRoutes.get('/calendar', async (c) => {
  const ctx = await svc(c)
  const q = parse(z.object({ from: isoDateSchema, to: isoDateSchema }), c.req.query())
  const fromAt = startOfZonedDay(q.from, ctx.timeZone)
  const toAt = endOfZonedDay(q.to, ctx.timeZone)
  const [taskRows, goalRows] = await ctx.db.batch([
    ctx.db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.ownerUuid, ctx.owner),
          isNull(schema.tasks.deletedAt),
          ne(schema.tasks.status, 'archived'),
          or(and(gte(schema.tasks.dueSortAt, fromAt), lte(schema.tasks.dueSortAt, toAt + TIME.DAY)), and(gte(schema.tasks.scheduledDate, q.from), lte(schema.tasks.scheduledDate, q.to))),
        ),
      )
      .limit(800),
    ctx.db
      .select({ id: schema.goals.id, title: schema.goals.title, targetDate: schema.goals.targetDate, status: schema.goals.status, projectId: schema.goals.projectId })
      .from(schema.goals)
      .where(and(eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt), gte(schema.goals.targetDate, q.from), lte(schema.goals.targetDate, q.to))),
  ])
  return ok(c, {
    tasks: await enrichTasks(ctx, taskRows),
    checkpoints: await checkpointsInRange(ctx, q.from, q.to),
    goals: goalRows,
  })
})

overviewRoutes.get('/analytics', async (c) => {
  const q = parse(z.object({ range: z.coerce.number().int().refine((v) => [7, 30, 90, 365].includes(v)).default(30) }), c.req.query())
  return ok(c, await computeAnalytics(await svc(c), q.range))
})

/** Chronological activity timeline across the account (paginated). */
overviewRoutes.get('/activity', async (c) => {
  const ctx = await svc(c)
  const q = parse(z.object({ before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), c.req.query())
  const rows = await ctx.db
    .select()
    .from(schema.activityLogs)
    .where(and(eq(schema.activityLogs.ownerUuid, ctx.owner), q.before ? sql`${schema.activityLogs.createdAt} < ${q.before}` : undefined))
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(q.limit)
  return ok(c, rows.map((r) => ({ id: r.id, entityType: r.entityType, entityId: r.entityId, action: r.action, actor: r.actor, changes: r.changes ? JSON.parse(r.changes) : null, createdAt: r.createdAt })))
})
