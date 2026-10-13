import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import type { checkpointCreateSchema, checkpointUpdateSchema } from '../../shared/schemas'
import { syncTargetReminders } from '../reminders/schedule'
import { activity, diff, getOwnedCheckpoint, getOwnedGoal, getOwnedTask, serializeCheckpoint, type Actor, type CheckpointRow, type ServiceCtx } from './common'
import { recomputeTaskProgress } from './tasks'

type CreateInput = z.infer<typeof checkpointCreateSchema>
type UpdateInput = z.infer<typeof checkpointUpdateSchema>

async function siblingsOf(ctx: ServiceCtx, parent: { taskId?: string | null; goalId?: string | null }) {
  const where = parent.taskId ? eq(schema.checkpoints.taskId, parent.taskId) : eq(schema.checkpoints.goalId, parent.goalId!)
  return ctx.db
    .select()
    .from(schema.checkpoints)
    .where(and(where, eq(schema.checkpoints.ownerUuid, ctx.owner), isNull(schema.checkpoints.deletedAt)))
    .orderBy(asc(schema.checkpoints.sortOrder))
}

async function depEdges(ctx: ServiceCtx, ids: string[]) {
  if (!ids.length) return []
  return ctx.db
    .select({ from: schema.checkpointDependencies.checkpointId, to: schema.checkpointDependencies.dependsOnId })
    .from(schema.checkpointDependencies)
    .where(and(eq(schema.checkpointDependencies.ownerUuid, ctx.owner), inArray(schema.checkpointDependencies.checkpointId, ids.slice(0, 90))))
}

/** Detects a cycle in edges (from -> dependsOn) after replacing `node`'s outgoing edges. */
export function hasCycle(edges: { from: string; to: string }[]): boolean {
  const adj = new Map<string, string[]>()
  for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
  const state = new Map<string, 1 | 2>()
  const visit = (n: string): boolean => {
    const s = state.get(n)
    if (s === 1) return true
    if (s === 2) return false
    state.set(n, 1)
    for (const m of adj.get(n) ?? []) if (visit(m)) return true
    state.set(n, 2)
    return false
  }
  for (const n of adj.keys()) if (visit(n)) return true
  return false
}

async function validateDeps(ctx: ServiceCtx, cpId: string, dependsOnIds: string[], siblings: CheckpointRow[]) {
  const siblingIds = new Set(siblings.map((s) => s.id))
  for (const d of dependsOnIds) {
    if (d === cpId || !siblingIds.has(d)) throw new AppError('VALIDATION_ERROR', 400, 'Dependencies must be other checkpoints of the same parent')
  }
  const existing = (await depEdges(ctx, [...siblingIds])).filter((e) => e.from !== cpId)
  if (hasCycle([...existing, ...dependsOnIds.map((to) => ({ from: cpId, to }))])) {
    throw new AppError('CIRCULAR_DEPENDENCY', 400, 'Checkpoint dependencies would create a cycle')
  }
}

async function afterChange(ctx: ServiceCtx, cp: { id: string; taskId: string | null; goalId: string | null }) {
  if (cp.taskId) await recomputeTaskProgress(ctx, cp.taskId)
  await syncTargetReminders(ctx.db, ctx.owner, { checkpointId: cp.id }, ctx.timeZone)
}

export async function createCheckpoint(ctx: ServiceCtx, input: CreateInput, actor: Actor = 'user'): Promise<string> {
  if (input.taskId) await getOwnedTask(ctx, input.taskId)
  if (input.goalId) await getOwnedGoal(ctx, input.goalId)
  const siblings = await siblingsOf(ctx, input)
  const id = newId()
  if (input.dependsOnIds.length) await validateDeps(ctx, id, input.dependsOnIds, siblings)
  const sortOrder = (siblings.at(-1)?.sortOrder ?? 0) + 1

  await ctx.db.batch([
    ctx.db.insert(schema.checkpoints).values({
      id,
      ownerUuid: ctx.owner,
      taskId: input.taskId ?? null,
      goalId: input.goalId ?? null,
      title: input.title,
      description: input.description ?? null,
      completionCriteria: input.completionCriteria ?? null,
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      weight: input.weight,
      priority: input.priority,
      status: input.status,
      origin: actor === 'ai_confirmed' ? 'ai' : 'manual',
      sortOrder,
      completedAt: input.status === 'done' ? ctx.now : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }),
    ...input.dependsOnIds.map((d) => ctx.db.insert(schema.checkpointDependencies).values({ ownerUuid: ctx.owner, checkpointId: id, dependsOnId: d })),
    activity(ctx, 'checkpoint', id, 'created', { title: input.title, taskId: input.taskId, goalId: input.goalId }, actor),
    activity(ctx, input.taskId ? 'task' : 'goal', (input.taskId ?? input.goalId)!, 'checkpoint_added', { checkpointId: id, title: input.title }, actor),
  ] as [any, ...any[]])
  await afterChange(ctx, { id, taskId: input.taskId ?? null, goalId: input.goalId ?? null })
  return id
}

export async function updateCheckpoint(ctx: ServiceCtx, id: string, patch: UpdateInput) {
  const before = await getOwnedCheckpoint(ctx, id)
  const set: Partial<CheckpointRow> = { updatedAt: ctx.now }
  for (const k of ['title', 'description', 'completionCriteria', 'startDate', 'targetDate', 'estimatedMinutes', 'weight', 'priority'] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k]
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status
    set.completedAt = patch.status === 'done' ? ctx.now : null
  }
  const start = set.startDate !== undefined ? set.startDate : before.startDate
  const target = set.targetDate !== undefined ? set.targetDate : before.targetDate
  if (start && target && start > target) throw new AppError('VALIDATION_ERROR', 400, 'Start date is after the target date', [{ path: 'targetDate', message: 'INVALID_RANGE' }])

  const stmts: any[] = [ctx.db.update(schema.checkpoints).set(set).where(and(eq(schema.checkpoints.id, id), eq(schema.checkpoints.ownerUuid, ctx.owner)))]
  if (patch.dependsOnIds) {
    const siblings = await siblingsOf(ctx, before)
    await validateDeps(ctx, id, patch.dependsOnIds, siblings)
    stmts.push(ctx.db.delete(schema.checkpointDependencies).where(and(eq(schema.checkpointDependencies.checkpointId, id), eq(schema.checkpointDependencies.ownerUuid, ctx.owner))))
    for (const d of patch.dependsOnIds) stmts.push(ctx.db.insert(schema.checkpointDependencies).values({ ownerUuid: ctx.owner, checkpointId: id, dependsOnId: d }))
  }
  const changes = diff(before as Record<string, unknown>, set as Record<string, unknown>)
  if (changes) {
    const action = set.status === 'done' ? 'completed' : before.status === 'done' && set.status ? 'reopened' : 'updated'
    stmts.push(activity(ctx, 'checkpoint', id, action, changes))
    if (set.status === 'done' || (before.status === 'done' && set.status)) {
      stmts.push(activity(ctx, before.taskId ? 'task' : 'goal', (before.taskId ?? before.goalId)!, action === 'completed' ? 'checkpoint_completed' : 'checkpoint_reopened', { checkpointId: id, title: before.title }))
    }
    if (set.status === 'done') {
      stmts.push(ctx.db.insert(schema.progressEntries).values({ id: newId(), ownerUuid: ctx.owner, checkpointId: id, taskId: before.taskId, goalId: before.goalId, kind: 'checkpoint', occurredAt: ctx.now, note: before.title }))
    }
  }
  await ctx.db.batch(stmts as [any, ...any[]])
  await afterChange(ctx, before)

  // Report (never auto-apply) downstream checkpoints affected by a later target date.
  let affected: { id: string; title: string; targetDate: string | null }[] = []
  if (set.targetDate && (!before.targetDate || set.targetDate > before.targetDate)) affected = await delayImpact(ctx, id, set.targetDate)
  return { affected }
}

/** Checkpoints that (transitively) depend on `id` and are scheduled before `newTarget`. */
export async function delayImpact(ctx: ServiceCtx, id: string, newTarget: string) {
  const cp = await getOwnedCheckpoint(ctx, id)
  const siblings = await siblingsOf(ctx, cp)
  const edges = await depEdges(ctx, siblings.map((s) => s.id))
  const dependents = new Map<string, string[]>()
  for (const e of edges) dependents.set(e.to, [...(dependents.get(e.to) ?? []), e.from])
  const out = new Set<string>()
  const queue = [id]
  while (queue.length) {
    for (const d of dependents.get(queue.shift()!) ?? []) {
      if (!out.has(d)) {
        out.add(d)
        queue.push(d)
      }
    }
  }
  return siblings
    .filter((s) => out.has(s.id) && s.status === 'pending' && (!s.targetDate || s.targetDate <= newTarget || (s.startDate != null && s.startDate < newTarget)))
    .map((s) => ({ id: s.id, title: s.title, targetDate: s.targetDate }))
}

export async function deleteCheckpoint(ctx: ServiceCtx, id: string) {
  const cp = await getOwnedCheckpoint(ctx, id)
  await ctx.db.batch([
    ctx.db.update(schema.checkpoints).set({ deletedAt: ctx.now, updatedAt: ctx.now }).where(and(eq(schema.checkpoints.id, id), eq(schema.checkpoints.ownerUuid, ctx.owner))),
    activity(ctx, 'checkpoint', id, 'deleted', { title: cp.title }),
  ])
  await afterChange(ctx, { ...cp, id })
}

export async function restoreCheckpoint(ctx: ServiceCtx, id: string) {
  const cp = await ctx.db.query.checkpoints.findFirst({ where: and(eq(schema.checkpoints.id, id), eq(schema.checkpoints.ownerUuid, ctx.owner)) })
  if (!cp || !cp.deletedAt) throw notFound('Deleted checkpoint')
  await ctx.db.batch([
    ctx.db.update(schema.checkpoints).set({ deletedAt: null, updatedAt: ctx.now }).where(eq(schema.checkpoints.id, id)),
    activity(ctx, 'checkpoint', id, 'restored', null),
  ])
  await afterChange(ctx, cp)
}

export async function reorderCheckpoints(ctx: ServiceCtx, orderedIds: string[]) {
  const rows = await ctx.db
    .select({ id: schema.checkpoints.id, taskId: schema.checkpoints.taskId, goalId: schema.checkpoints.goalId })
    .from(schema.checkpoints)
    .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), inArray(schema.checkpoints.id, orderedIds.slice(0, 90))))
  if (rows.length !== Math.min(orderedIds.length, 90)) throw notFound('Checkpoint')
  const parents = new Set(rows.map((r) => r.taskId ?? r.goalId))
  if (parents.size !== 1) throw new AppError('VALIDATION_ERROR', 400, 'Checkpoints must share one parent')
  await ctx.db.batch(
    orderedIds.map((cid, i) =>
      ctx.db.update(schema.checkpoints).set({ sortOrder: i + 1 }).where(and(eq(schema.checkpoints.id, cid), eq(schema.checkpoints.ownerUuid, ctx.owner))),
    ) as [any, ...any[]],
  )
}

export async function listCheckpointsFor(ctx: ServiceCtx, parent: { taskId?: string; goalId?: string }) {
  const rows = await siblingsOf(ctx, parent)
  const edges = await depEdges(ctx, rows.map((r) => r.id))
  const map = new Map<string, string[]>()
  for (const e of edges) map.set(e.from, [...(map.get(e.from) ?? []), e.to])
  return rows.map((r) => serializeCheckpoint(r, map.get(r.id) ?? []))
}

/** Checkpoints with target dates in a range (calendar / timeline). */
export async function checkpointsInRange(ctx: ServiceCtx, from: string, to: string) {
  const rows = await ctx.db
    .select({
      cp: schema.checkpoints,
      taskTitle: schema.tasks.title,
      goalTitle: schema.goals.title,
      projectId: sql<string | null>`coalesce(${schema.tasks.projectId}, ${schema.goals.projectId})`,
    })
    .from(schema.checkpoints)
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.checkpoints.taskId))
    .leftJoin(schema.goals, eq(schema.goals.id, schema.checkpoints.goalId))
    .where(
      and(
        eq(schema.checkpoints.ownerUuid, ctx.owner),
        isNull(schema.checkpoints.deletedAt),
        sql`${schema.checkpoints.targetDate} >= ${from} and ${schema.checkpoints.targetDate} <= ${to}`,
        sql`(${schema.tasks.deletedAt} is null) and (${schema.goals.deletedAt} is null)`,
      ),
    )
    .orderBy(asc(schema.checkpoints.targetDate))
    .limit(500)
  return rows.map((r) => ({ ...serializeCheckpoint(r.cp), parentTitle: r.taskTitle ?? r.goalTitle, projectId: r.projectId }))
}
