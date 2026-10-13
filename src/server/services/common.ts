import { and, eq, isNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import { parseJson, schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import type { TaskLocation, TaskRequirement, TaskReward, TaskSubmission } from '../../shared/schemas'

export type Actor = 'user' | 'ai_confirmed' | 'system' | 'import'

export interface ServiceCtx {
  db: DB
  owner: string
  /** User's IANA time zone (settings). */
  timeZone: string
  hoursPerDay: number
  now: number
}

/** Build an activity log insert statement (to be batched with the change it records). */
export function activity(
  ctx: ServiceCtx,
  entityType: string,
  entityId: string,
  action: string,
  changes?: Record<string, unknown> | null,
  actor: Actor = 'user',
) {
  return ctx.db.insert(schema.activityLogs).values({
    id: newId(),
    ownerUuid: ctx.owner,
    entityType,
    entityId,
    action,
    changes: changes ? JSON.stringify(changes).slice(0, 8000) : null,
    actor,
    createdAt: ctx.now,
  })
}

/** Field-level diff of plain values for audit logs. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> | null {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of Object.keys(after)) {
    if (k === 'updatedAt') continue
    const a = before[k]
    const b = after[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b }
  }
  return Object.keys(out).length ? out : null
}

// ---------------------------------------------------------------------------
// Ownership assertions. Every referenced id from the client is re-checked
// against the session owner; ids from other users behave like missing rows.
// ---------------------------------------------------------------------------

export async function getOwnedTask(ctx: ServiceCtx, id: string) {
  const row = await ctx.db.query.tasks.findFirst({
    where: and(eq(schema.tasks.id, id), eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt)),
  })
  if (!row) throw notFound('Task')
  return row
}

export async function getOwnedGoal(ctx: ServiceCtx, id: string) {
  const row = await ctx.db.query.goals.findFirst({
    where: and(eq(schema.goals.id, id), eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt)),
  })
  if (!row) throw notFound('Goal')
  return row
}

export async function getOwnedProject(ctx: ServiceCtx, id: string) {
  const row = await ctx.db.query.projects.findFirst({
    where: and(eq(schema.projects.id, id), eq(schema.projects.ownerUuid, ctx.owner), isNull(schema.projects.deletedAt)),
  })
  if (!row) throw notFound('Project')
  return row
}

export async function getOwnedCheckpoint(ctx: ServiceCtx, id: string) {
  const row = await ctx.db.query.checkpoints.findFirst({
    where: and(
      eq(schema.checkpoints.id, id),
      eq(schema.checkpoints.ownerUuid, ctx.owner),
      isNull(schema.checkpoints.deletedAt),
    ),
  })
  if (!row) throw notFound('Checkpoint')
  return row
}

export async function assertRefs(
  ctx: ServiceCtx,
  refs: { projectId?: string | null; goalId?: string | null; parentId?: string | null; tagIds?: string[] },
) {
  if (refs.projectId) await getOwnedProject(ctx, refs.projectId)
  if (refs.goalId) await getOwnedGoal(ctx, refs.goalId)
  if (refs.parentId) await getOwnedTask(ctx, refs.parentId)
  if (refs.tagIds?.length) {
    const rows = await ctx.db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(eq(schema.tags.ownerUuid, ctx.owner))
    const owned = new Set(rows.map((r) => r.id))
    if (refs.tagIds.some((t) => !owned.has(t))) throw new AppError('NOT_FOUND', 404, 'Tag not found')
  }
}

// ---------------------------------------------------------------------------
// DTO serialization
// ---------------------------------------------------------------------------

export type TaskRow = typeof schema.tasks.$inferSelect

export function serializeTask(t: TaskRow) {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    description: t.description,
    notes: t.notes,
    projectId: t.projectId,
    goalId: t.goalId,
    parentId: t.parentId,
    status: t.status,
    priority: t.priority,
    startDate: t.startDate,
    scheduledDate: t.scheduledDate,
    due: {
      precision: t.duePrecision,
      at: t.dueAt,
      date: t.dueDate,
      time: t.dueTime,
      timeZone: t.timeZone,
      sortAt: t.dueSortAt,
    },
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    progressPercent: t.progressPercent,
    progressMode: t.progressMode,
    location: parseJson<TaskLocation | null>(t.location, null),
    submission: parseJson<TaskSubmission | null>(t.submission, null),
    deliverables: parseJson<string[]>(t.deliverables, []),
    requirements: parseJson<TaskRequirement[]>(t.requirements, []),
    rewards: parseJson<TaskReward[]>(t.rewards, []),
    sourceId: t.sourceId,
    sortOrder: t.sortOrder,
    completedAt: t.completedAt,
    archivedAt: t.archivedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

export type CheckpointRow = typeof schema.checkpoints.$inferSelect
export function serializeCheckpoint(c: CheckpointRow, dependsOnIds: string[] = []) {
  return {
    id: c.id,
    taskId: c.taskId,
    goalId: c.goalId,
    title: c.title,
    description: c.description,
    completionCriteria: c.completionCriteria,
    startDate: c.startDate,
    targetDate: c.targetDate,
    estimatedMinutes: c.estimatedMinutes,
    weight: c.weight,
    priority: c.priority,
    status: c.status,
    origin: c.origin,
    sortOrder: c.sortOrder,
    completedAt: c.completedAt,
    dependsOnIds,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export type GoalRow = typeof schema.goals.$inferSelect
export function serializeGoal(g: GoalRow) {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    projectId: g.projectId,
    targetDate: g.targetDate,
    progressModel: g.progressModel,
    currentValue: g.currentValue,
    targetValue: g.targetValue,
    unit: g.unit,
    weeklyEffortMinutes: g.weeklyEffortMinutes,
    reviewFrequency: g.reviewFrequency,
    successCriteria: g.successCriteria,
    estimatedMinutes: g.estimatedMinutes,
    actualMinutes: g.actualMinutes,
    status: g.status,
    sortOrder: g.sortOrder,
    completedAt: g.completedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
