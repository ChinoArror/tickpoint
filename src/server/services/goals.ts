import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import type { goalCreateSchema, goalUpdateSchema } from '../../shared/schemas'
import type { GoalProgressModel } from '../../shared/constants'
import { assessGoalHealth, goalActualProgress } from '../../shared/insights'
import { endOfZonedDay, TIME } from '../../shared/time'
import { syncTargetReminders } from '../reminders/schedule'
import { activity, assertRefs, chunk, diff, getOwnedGoal, serializeGoal, type Actor, type GoalRow, type ServiceCtx } from './common'
import { listCheckpointsFor } from './checkpoints'
import { enrichTasks } from './tasks'

type GoalCreate = z.infer<typeof goalCreateSchema>
type GoalUpdate = z.infer<typeof goalUpdateSchema>

export async function healthFor(ctx: ServiceCtx, goals: GoalRow[]) {
  if (!goals.length) return new Map<string, ReturnType<typeof assessGoalHealth>>()
  const ids = goals.map((g) => g.id)
  const since = ctx.now - 28 * TIME.DAY
  const cps = new Map<string, { done: boolean; weight: number }[]>()
  const acts = new Map<string, number[]>()
  const gains = new Map<string, number>()
  for (const part of chunk(ids, 90)) {
    const [cpRows, prRows] = await ctx.db.batch([
      ctx.db
        .select({ goalId: schema.checkpoints.goalId, status: schema.checkpoints.status, weight: schema.checkpoints.weight })
        .from(schema.checkpoints)
        .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), inArray(schema.checkpoints.goalId, part), isNull(schema.checkpoints.deletedAt), ne(schema.checkpoints.status, 'skipped'))),
      ctx.db
        .select({ goalId: schema.progressEntries.goalId, at: schema.progressEntries.occurredAt, gain: schema.progressEntries.gain })
        .from(schema.progressEntries)
        .where(and(eq(schema.progressEntries.ownerUuid, ctx.owner), inArray(schema.progressEntries.goalId, part), gte(schema.progressEntries.occurredAt, since))),
    ])
    for (const r of cpRows) cps.set(r.goalId!, [...(cps.get(r.goalId!) ?? []), { done: r.status === 'done', weight: r.weight }])
    for (const r of prRows) {
      acts.set(r.goalId!, [...(acts.get(r.goalId!) ?? []), r.at])
      if (r.gain != null) gains.set(r.goalId!, (gains.get(r.goalId!) ?? 0) + r.gain)
    }
  }
  const out = new Map<string, ReturnType<typeof assessGoalHealth>>()
  for (const g of goals) {
    out.set(
      g.id,
      assessGoalHealth({
        now: ctx.now,
        model: g.progressModel as GoalProgressModel,
        status: g.status,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
        createdAt: g.createdAt,
        targetAt: g.targetDate ? endOfZonedDay(g.targetDate, ctx.timeZone) : null,
        checkpoints: cps.get(g.id) ?? [],
        recentActivityAt: acts.get(g.id) ?? [],
        recentGain: gains.has(g.id) ? gains.get(g.id)! : null,
      }),
    )
  }
  return out
}

export async function listGoals(ctx: ServiceCtx, opts: { status?: string; projectId?: string }) {
  const conds = [eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt)]
  if (opts.status) conds.push(eq(schema.goals.status, opts.status))
  else conds.push(ne(schema.goals.status, 'archived'))
  if (opts.projectId) conds.push(eq(schema.goals.projectId, opts.projectId))
  const rows = await ctx.db
    .select()
    .from(schema.goals)
    .where(and(...conds))
    .orderBy(sql`${schema.goals.status} = 'completed'`, asc(schema.goals.sortOrder), desc(schema.goals.createdAt))
    .limit(200)
  const health = await healthFor(ctx, rows)
  return rows.map((g) => ({ ...serializeGoal(g), health: health.get(g.id)! }))
}

export async function getGoalDetail(ctx: ServiceCtx, id: string) {
  const g = await getOwnedGoal(ctx, id)
  const [tasks, progress, history, rules] = await ctx.db.batch([
    ctx.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.ownerUuid, ctx.owner), eq(schema.tasks.goalId, id), isNull(schema.tasks.deletedAt)))
      .orderBy(asc(schema.tasks.sortOrder))
      .limit(200),
    ctx.db
      .select()
      .from(schema.progressEntries)
      .where(and(eq(schema.progressEntries.ownerUuid, ctx.owner), eq(schema.progressEntries.goalId, id)))
      .orderBy(desc(schema.progressEntries.occurredAt))
      .limit(200),
    ctx.db
      .select()
      .from(schema.activityLogs)
      .where(and(eq(schema.activityLogs.ownerUuid, ctx.owner), eq(schema.activityLogs.entityId, id)))
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(100),
    ctx.db.select().from(schema.reminderRules).where(and(eq(schema.reminderRules.ownerUuid, ctx.owner), eq(schema.reminderRules.goalId, id))),
  ])
  const health = (await healthFor(ctx, [g])).get(id)!
  return {
    ...serializeGoal(g),
    health,
    checkpoints: await listCheckpointsFor(ctx, { goalId: id }),
    tasks: await enrichTasks(ctx, tasks),
    progress: progress.map(serializeProgress),
    history: history.map((h) => ({ id: h.id, action: h.action, actor: h.actor, changes: h.changes ? JSON.parse(h.changes) : null, createdAt: h.createdAt })),
    reminders: rules.map((r) => ({ id: r.id, kind: r.kind, offsetMinutes: r.offsetMinutes, absoluteAt: r.absoluteAt, channels: JSON.parse(r.channels), enabled: r.enabled })),
  }
}

export async function createGoal(ctx: ServiceCtx, input: GoalCreate, actor: Actor = 'user'): Promise<string> {
  await assertRefs(ctx, { projectId: input.projectId })
  const id = newId()
  await ctx.db.batch([
    ctx.db.insert(schema.goals).values({
      id,
      ownerUuid: ctx.owner,
      projectId: input.projectId ?? null,
      title: input.title,
      description: input.description ?? null,
      targetDate: input.targetDate ?? null,
      progressModel: input.progressModel,
      currentValue: input.currentValue,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
      weeklyEffortMinutes: input.weeklyEffortMinutes ?? null,
      reviewFrequency: input.reviewFrequency,
      successCriteria: input.successCriteria ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      status: input.status,
      completedAt: input.status === 'completed' ? ctx.now : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }),
    activity(ctx, 'goal', id, 'created', { title: input.title, model: input.progressModel }, actor),
  ])
  return id
}

export async function updateGoal(ctx: ServiceCtx, id: string, patch: GoalUpdate) {
  const before = await getOwnedGoal(ctx, id)
  await assertRefs(ctx, { projectId: patch.projectId })
  const set: Partial<GoalRow> = { updatedAt: ctx.now }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (set as Record<string, unknown>)[k] = v
  if (patch.status && patch.status !== before.status) set.completedAt = patch.status === 'completed' ? ctx.now : null

  const model = (set.progressModel ?? before.progressModel) as GoalProgressModel
  const cur = set.currentValue ?? before.currentValue
  const target = set.targetValue !== undefined ? set.targetValue : before.targetValue
  if ((model === 'quantity' || model === 'time') && !target) throw new AppError('VALIDATION_ERROR', 400, 'Target value is required', [{ path: 'targetValue', message: 'REQUIRED' }])
  if (model === 'percentage' && cur > 100) throw new AppError('VALIDATION_ERROR', 400, 'Progress cannot exceed 100%', [{ path: 'currentValue', message: 'OUT_OF_RANGE' }])

  const changes = diff(before as Record<string, unknown>, set as Record<string, unknown>)
  const action = set.status === 'completed' ? 'completed' : before.status === 'completed' && set.status ? 'reopened' : 'updated'
  await ctx.db.batch([
    ctx.db.update(schema.goals).set(set).where(and(eq(schema.goals.id, id), eq(schema.goals.ownerUuid, ctx.owner))),
    ...(changes ? [activity(ctx, 'goal', id, action, changes)] : []),
  ] as [any, ...any[]])
  if (patch.targetDate !== undefined || patch.status !== undefined) await syncTargetReminders(ctx.db, ctx.owner, { goalId: id }, ctx.timeZone)
}

export async function deleteGoal(ctx: ServiceCtx, id: string) {
  const g = await getOwnedGoal(ctx, id)
  await ctx.db.batch([
    ctx.db.update(schema.goals).set({ deletedAt: ctx.now, updatedAt: ctx.now }).where(and(eq(schema.goals.id, id), eq(schema.goals.ownerUuid, ctx.owner))),
    activity(ctx, 'goal', id, 'deleted', { title: g.title }),
  ])
  await syncTargetReminders(ctx.db, ctx.owner, { goalId: id }, ctx.timeZone)
}

export async function restoreGoal(ctx: ServiceCtx, id: string) {
  const g = await ctx.db.query.goals.findFirst({ where: and(eq(schema.goals.id, id), eq(schema.goals.ownerUuid, ctx.owner)) })
  if (!g || !g.deletedAt) throw notFound('Deleted goal')
  await ctx.db.batch([
    ctx.db.update(schema.goals).set({ deletedAt: null, updatedAt: ctx.now }).where(eq(schema.goals.id, id)),
    activity(ctx, 'goal', id, 'restored', null),
  ])
  await syncTargetReminders(ctx.db, ctx.owner, { goalId: id }, ctx.timeZone)
}

// ---------------------------------------------------------------------------
// Progress entries
// ---------------------------------------------------------------------------

export type ProgressRow = typeof schema.progressEntries.$inferSelect
export function serializeProgress(p: ProgressRow) {
  return {
    id: p.id,
    taskId: p.taskId,
    goalId: p.goalId,
    checkpointId: p.checkpointId,
    kind: p.kind,
    previousValue: p.previousValue,
    newValue: p.newValue,
    minutes: p.minutes,
    note: p.note,
    occurredAt: p.occurredAt,
  }
}

export interface ProgressInput {
  taskId?: string | null
  goalId?: string | null
  checkpointId?: string | null
  value?: number | null
  delta?: number | null
  minutes?: number | null
  note?: string | null
  occurredAt?: number | null
}

export async function addProgress(ctx: ServiceCtx, input: ProgressInput): Promise<string> {
  const occurredAt = Math.min(input.occurredAt ?? ctx.now, ctx.now)
  const id = newId()
  const minutes = input.minutes ?? null

  if (input.taskId) {
    const t = await ctx.db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt)) })
    if (!t) throw notFound('Task')
    let next = t.progressPercent
    if (input.value != null || input.delta != null) {
      if (t.progressMode !== 'manual') throw new AppError('VALIDATION_ERROR', 400, 'Progress is derived from checkpoints or subtasks for this task')
      next = clamp(input.value ?? t.progressPercent + (input.delta ?? 0), 0, 100)
    }
    const status = t.status === 'not_started' && (next > 0 || minutes) ? 'in_progress' : t.status
    await ctx.db.batch([
      ctx.db.insert(schema.progressEntries).values({
        id,
        ownerUuid: ctx.owner,
        taskId: t.id,
        kind: input.value != null || input.delta != null ? 'value' : minutes ? 'time' : 'note',
        previousValue: t.progressPercent,
        newValue: next,
        gain: (next - t.progressPercent) / 100,
        minutes,
        note: input.note ?? null,
        occurredAt,
      }),
      ctx.db
        .update(schema.tasks)
        .set({ progressPercent: next, actualMinutes: t.actualMinutes + (minutes ?? 0), status, updatedAt: ctx.now })
        .where(eq(schema.tasks.id, t.id)),
      activity(ctx, 'task', t.id, 'progress_updated', { from: t.progressPercent, to: next, minutes }),
    ])
    return id
  }

  if (input.goalId) {
    const g = await getOwnedGoal(ctx, input.goalId)
    const model = g.progressModel as GoalProgressModel
    let next = g.currentValue
    if (input.value != null) next = input.value
    else if (input.delta != null) next = g.currentValue + input.delta
    else if (model === 'time' && minutes) next = g.currentValue + minutes / 60
    if (model === 'percentage' || model === 'binary') next = clamp(next, 0, model === 'binary' ? 1 : 100)
    next = Math.max(0, Math.round(next * 1000) / 1000)
    if (model === 'checkpoint' || model === 'weighted') next = g.currentValue

    const before = goalActualProgress({ model, status: g.status, currentValue: g.currentValue, targetValue: g.targetValue, checkpoints: [] })
    const after = goalActualProgress({ model, status: g.status, currentValue: next, targetValue: g.targetValue, checkpoints: [] })
    const reached = (model === 'binary' && next >= 1) || ((model === 'quantity' || model === 'time') && g.targetValue != null && next >= g.targetValue) || (model === 'percentage' && next >= 100)
    await ctx.db.batch([
      ctx.db.insert(schema.progressEntries).values({
        id,
        ownerUuid: ctx.owner,
        goalId: g.id,
        kind: input.value != null ? 'value' : input.delta != null || (model === 'time' && minutes) ? 'delta' : minutes ? 'time' : 'note',
        previousValue: g.currentValue,
        newValue: next,
        gain: model === 'checkpoint' || model === 'weighted' ? null : after - before,
        minutes,
        note: input.note ?? null,
        occurredAt,
      }),
      ctx.db
        .update(schema.goals)
        .set({
          currentValue: next,
          actualMinutes: g.actualMinutes + (minutes ?? 0),
          ...(reached && g.status === 'active' ? { status: 'completed', completedAt: ctx.now } : {}),
          updatedAt: ctx.now,
        })
        .where(eq(schema.goals.id, g.id)),
      activity(ctx, 'goal', g.id, reached && g.status === 'active' ? 'completed' : 'progress_updated', { from: g.currentValue, to: next, minutes }),
    ])
    return id
  }

  // Checkpoint: time/notes only; completion goes through the checkpoint endpoint.
  const cp = await ctx.db.query.checkpoints.findFirst({ where: and(eq(schema.checkpoints.id, input.checkpointId!), eq(schema.checkpoints.ownerUuid, ctx.owner), isNull(schema.checkpoints.deletedAt)) })
  if (!cp) throw notFound('Checkpoint')
  await ctx.db.batch([
    ctx.db.insert(schema.progressEntries).values({ id, ownerUuid: ctx.owner, checkpointId: cp.id, taskId: cp.taskId, goalId: cp.goalId, kind: minutes ? 'time' : 'note', minutes, note: input.note ?? null, occurredAt }),
    ...(cp.taskId && minutes
      ? [ctx.db.update(schema.tasks).set({ actualMinutes: sql`${schema.tasks.actualMinutes} + ${minutes}`, updatedAt: ctx.now }).where(eq(schema.tasks.id, cp.taskId))]
      : []),
  ] as [any, ...any[]])
  return id
}

export async function listProgress(ctx: ServiceCtx, opts: { taskId?: string; goalId?: string; limit: number }) {
  const conds = [eq(schema.progressEntries.ownerUuid, ctx.owner)]
  if (opts.taskId) conds.push(eq(schema.progressEntries.taskId, opts.taskId))
  if (opts.goalId) conds.push(eq(schema.progressEntries.goalId, opts.goalId))
  const rows = await ctx.db
    .select()
    .from(schema.progressEntries)
    .where(and(...conds))
    .orderBy(desc(schema.progressEntries.occurredAt))
    .limit(opts.limit)
  return rows.map(serializeProgress)
}

export async function deleteProgress(ctx: ServiceCtx, id: string) {
  const r = await ctx.db
    .delete(schema.progressEntries)
    .where(and(eq(schema.progressEntries.id, id), eq(schema.progressEntries.ownerUuid, ctx.owner)))
    .returning({ id: schema.progressEntries.id })
  if (!r.length) throw notFound('Progress entry')
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}
