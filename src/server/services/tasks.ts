import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import { LIMITS, type TaskStatus } from '../../shared/constants'
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from '../../shared/schemas'
import { addDaysToIsoDate, isoDateInZone, resolveDue, startOfZonedDay, TIME } from '../../shared/time'
import { assessDeadlineRisk } from '../../shared/insights'
import { syncTargetReminders } from '../reminders/schedule'
import {
  activity,
  assertRefs,
  chunk,
  diff,
  getOwnedTask,
  serializeCheckpoint,
  serializeTask,
  type Actor,
  type ServiceCtx,
  type TaskRow,
} from './common'

const OPEN = ['not_started', 'in_progress', 'paused'] as const

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function listTasks(ctx: ServiceCtx, q: TaskListQuery) {
  const t = schema.tasks
  const today = isoDateInZone(ctx.now, ctx.timeZone)
  const dayStart = startOfZonedDay(today, ctx.timeZone)
  const dayEnd = startOfZonedDay(addDaysToIsoDate(today, 1), ctx.timeZone)
  const conds: (SQL | undefined)[] = [eq(t.ownerUuid, ctx.owner), isNull(t.deletedAt)]
  let order: SQL[] = [asc(t.sortOrder), asc(t.createdAt)]

  switch (q.view) {
    case 'inbox':
      conds.push(isNull(t.projectId), isNull(t.goalId), isNull(t.parentId), isNull(t.dueSortAt), inArray(t.status, [...OPEN]))
      break
    case 'today':
      conds.push(
        inArray(t.status, [...OPEN]),
        or(eq(t.scheduledDate, today), and(isNotNull(t.dueSortAt), lt(t.dueSortAt, dayEnd))),
      )
      order = [sql`${t.dueSortAt} IS NULL`, asc(t.dueSortAt), asc(t.sortOrder)]
      break
    case 'upcoming': {
      const horizon = ctx.now + 14 * TIME.DAY
      conds.push(
        inArray(t.status, [...OPEN]),
        or(
          and(gte(t.dueSortAt, dayStart), lte(t.dueSortAt, horizon)),
          and(gte(t.scheduledDate, today), lte(t.scheduledDate, addDaysToIsoDate(today, 14))),
        ),
      )
      order = [sql`${t.dueSortAt} IS NULL`, asc(t.dueSortAt), asc(t.scheduledDate)]
      break
    }
    case 'deadlines':
      conds.push(eq(t.kind, 'deadline'), ne(t.status, 'archived'))
      order = [sql`${t.status} = 'completed'`, sql`${t.dueSortAt} IS NULL`, asc(t.dueSortAt)]
      break
    case 'overdue':
      conds.push(inArray(t.status, [...OPEN]), lt(t.dueSortAt, ctx.now))
      order = [asc(t.dueSortAt)]
      break
    case 'completed':
      conds.push(eq(t.status, 'completed'))
      order = [desc(t.completedAt)]
      break
    case 'archived':
      conds.push(eq(t.status, 'archived'))
      order = [desc(t.archivedAt)]
      break
    default:
      conds.push(ne(t.status, 'archived'))
  }

  if (q.projectId) conds.push(eq(t.projectId, q.projectId))
  if (q.goalId) conds.push(eq(t.goalId, q.goalId))
  if (q.parentId === 'root') conds.push(isNull(t.parentId))
  else if (q.parentId) conds.push(eq(t.parentId, q.parentId))
  if (q.status) conds.push(eq(t.status, q.status))
  if (q.priority) conds.push(eq(t.priority, q.priority))
  if (q.kind) conds.push(eq(t.kind, q.kind))
  if (q.q) conds.push(like(t.title, `%${q.q.replace(/[%_]/g, '')}%`))
  if (q.from != null) conds.push(gte(t.dueSortAt, q.from))
  if (q.to != null) conds.push(lte(t.dueSortAt, q.to))

  const offset = q.cursor ? Math.max(0, Number.parseInt(q.cursor, 36) || 0) : 0
  const rows = await ctx.db
    .select()
    .from(t)
    .where(and(...conds))
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(offset)

  const page = rows.slice(0, q.limit)
  return {
    items: await enrichTasks(ctx, page),
    nextCursor: rows.length > q.limit ? (offset + q.limit).toString(36) : null,
  }
}

/** Attach risk, counts and tags to a page of tasks using a fixed number of grouped queries (no N+1). */
export async function enrichTasks(ctx: ServiceCtx, rows: TaskRow[]) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const today = isoDateInZone(ctx.now, ctx.timeZone)
  const cp = new Map<string, { total: number; done: number; pending: number; delayed: number }>()
  const deps = new Map<string, number>()
  const subs = new Map<string, { total: number; done: number }>()
  const tagMap = new Map<string, string[]>()

  for (const part of chunk(ids, 90)) {
    const [cpRows, depRows, subRows, tagRows] = await ctx.db.batch([
      ctx.db
        .select({
          taskId: schema.checkpoints.taskId,
          total: sql<number>`count(*)`,
          done: sql<number>`sum(case when ${schema.checkpoints.status} = 'done' then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${schema.checkpoints.status} = 'pending' then 1 else 0 end)`,
          delayed: sql<number>`sum(case when ${schema.checkpoints.status} = 'pending' and ${schema.checkpoints.targetDate} < ${today} then 1 else 0 end)`,
        })
        .from(schema.checkpoints)
        .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), inArray(schema.checkpoints.taskId, part), isNull(schema.checkpoints.deletedAt)))
        .groupBy(schema.checkpoints.taskId),
      ctx.db
        .select({ taskId: schema.taskDependencies.taskId, open: sql<number>`count(*)` })
        .from(schema.taskDependencies)
        .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.dependsOnId))
        .where(
          and(
            eq(schema.taskDependencies.ownerUuid, ctx.owner),
            inArray(schema.taskDependencies.taskId, part),
            notInArray(schema.tasks.status, ['completed', 'archived']),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .groupBy(schema.taskDependencies.taskId),
      ctx.db
        .select({
          parentId: schema.tasks.parentId,
          total: sql<number>`count(*)`,
          done: sql<number>`sum(case when ${schema.tasks.status} = 'completed' then 1 else 0 end)`,
        })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.parentId, part), isNull(schema.tasks.deletedAt), ne(schema.tasks.status, 'archived')))
        .groupBy(schema.tasks.parentId),
      ctx.db
        .select({ taskId: schema.taskTags.taskId, tagId: schema.taskTags.tagId })
        .from(schema.taskTags)
        .where(and(eq(schema.taskTags.ownerUuid, ctx.owner), inArray(schema.taskTags.taskId, part))),
    ])
    for (const r of cpRows) cp.set(r.taskId!, { total: +r.total, done: +r.done, pending: +r.pending, delayed: +r.delayed })
    for (const r of depRows) deps.set(r.taskId, +r.open)
    for (const r of subRows) subs.set(r.parentId!, { total: +r.total, done: +r.done })
    for (const r of tagRows) tagMap.set(r.taskId, [...(tagMap.get(r.taskId) ?? []), r.tagId])
  }

  return rows.map((r) => {
    const c = cp.get(r.id) ?? { total: 0, done: 0, pending: 0, delayed: 0 }
    const startAt = r.startDate ? startOfZonedDay(r.startDate, r.timeZone || ctx.timeZone) : r.createdAt
    const risk = assessDeadlineRisk({
      now: ctx.now,
      status: r.status,
      dueSortAt: r.dueSortAt,
      startAt,
      progressPercent: r.progressPercent,
      estimatedMinutes: r.estimatedMinutes,
      hoursPerDay: ctx.hoursPerDay,
      openBlockingDependencies: deps.get(r.id) ?? 0,
      delayedCheckpoints: c.delayed,
      pendingCheckpoints: c.pending,
    })
    return {
      ...serializeTask(r),
      tagIds: tagMap.get(r.id) ?? [],
      counts: { checkpoints: c.total, checkpointsDone: c.done, subtasks: subs.get(r.id)?.total ?? 0, subtasksDone: subs.get(r.id)?.done ?? 0, openDependencies: deps.get(r.id) ?? 0 },
      risk: { level: risk.level, reasons: risk.reasons, remainingEffortMinutes: risk.remainingEffortMinutes, availableMinutes: risk.availableMinutes, expectedProgress: risk.expectedProgress },
    }
  })
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getTaskDetail(ctx: ServiceCtx, id: string) {
  const task = await getOwnedTask(ctx, id)
  const [children, cps, cpDeps, depRows, dependents, rules, tagRows, files, history] = await ctx.db.batch([
    ctx.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.ownerUuid, ctx.owner), eq(schema.tasks.parentId, id), isNull(schema.tasks.deletedAt)))
      .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.createdAt)),
    ctx.db
      .select()
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), eq(schema.checkpoints.taskId, id), isNull(schema.checkpoints.deletedAt)))
      .orderBy(asc(schema.checkpoints.sortOrder)),
    ctx.db
      .select({ checkpointId: schema.checkpointDependencies.checkpointId, dependsOnId: schema.checkpointDependencies.dependsOnId })
      .from(schema.checkpointDependencies)
      .innerJoin(schema.checkpoints, eq(schema.checkpoints.id, schema.checkpointDependencies.checkpointId))
      .where(and(eq(schema.checkpointDependencies.ownerUuid, ctx.owner), eq(schema.checkpoints.taskId, id))),
    ctx.db
      .select({
        id: schema.taskDependencies.id,
        dependsOnId: schema.taskDependencies.dependsOnId,
        type: schema.taskDependencies.type,
        note: schema.taskDependencies.note,
        title: schema.tasks.title,
        status: schema.tasks.status,
      })
      .from(schema.taskDependencies)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.dependsOnId))
      .where(and(eq(schema.taskDependencies.ownerUuid, ctx.owner), eq(schema.taskDependencies.taskId, id))),
    ctx.db
      .select({ taskId: schema.taskDependencies.taskId, title: schema.tasks.title, status: schema.tasks.status })
      .from(schema.taskDependencies)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskDependencies.taskId))
      .where(and(eq(schema.taskDependencies.ownerUuid, ctx.owner), eq(schema.taskDependencies.dependsOnId, id))),
    ctx.db.select().from(schema.reminderRules).where(and(eq(schema.reminderRules.ownerUuid, ctx.owner), eq(schema.reminderRules.taskId, id))),
    ctx.db.select({ tagId: schema.taskTags.tagId }).from(schema.taskTags).where(and(eq(schema.taskTags.ownerUuid, ctx.owner), eq(schema.taskTags.taskId, id))),
    ctx.db
      .select({ id: schema.attachments.id, filename: schema.attachments.filename, contentType: schema.attachments.contentType, size: schema.attachments.size, createdAt: schema.attachments.createdAt })
      .from(schema.attachments)
      .where(and(eq(schema.attachments.ownerUuid, ctx.owner), eq(schema.attachments.taskId, id))),
    ctx.db
      .select()
      .from(schema.activityLogs)
      .where(and(eq(schema.activityLogs.ownerUuid, ctx.owner), eq(schema.activityLogs.entityId, id)))
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(100),
  ])

  const ruleIds = rules.map((r) => r.id)
  const jobs = ruleIds.length
    ? await ctx.db
        .select()
        .from(schema.reminderJobs)
        .where(and(eq(schema.reminderJobs.ownerUuid, ctx.owner), inArray(schema.reminderJobs.ruleId, ruleIds.slice(0, 90)), notInArray(schema.reminderJobs.status, ['cancelled'])))
        .orderBy(desc(schema.reminderJobs.fireAt))
    : []

  const source = task.sourceId
    ? await ctx.db.query.sourceDocuments.findFirst({
        where: and(eq(schema.sourceDocuments.id, task.sourceId), eq(schema.sourceDocuments.ownerUuid, ctx.owner)),
        columns: { id: true, title: true, url: true, sourceDate: true, contentChars: true, contentDeletedAt: true, createdAt: true },
      })
    : null

  const [enriched] = await enrichTasks(ctx, [task])
  const cpDepMap = new Map<string, string[]>()
  for (const d of cpDeps) cpDepMap.set(d.checkpointId, [...(cpDepMap.get(d.checkpointId) ?? []), d.dependsOnId])

  return {
    ...enriched,
    tagIds: tagRows.map((r) => r.tagId),
    subtasks: await enrichTasks(ctx, children),
    checkpoints: cps.map((c) => serializeCheckpoint(c, cpDepMap.get(c.id) ?? [])),
    dependencies: depRows,
    dependents,
    reminders: rules.map((r) => ({
      id: r.id,
      kind: r.kind,
      offsetMinutes: r.offsetMinutes,
      absoluteAt: r.absoluteAt,
      channels: JSON.parse(r.channels) as string[],
      enabled: r.enabled,
      jobs: jobs.filter((j) => j.ruleId === r.id).slice(0, 5).map((j) => ({ id: j.id, fireAt: j.fireAt, status: j.status, sentAt: j.sentAt, attempts: j.attempts })),
    })),
    attachments: files,
    history: history.map((h) => ({ id: h.id, action: h.action, actor: h.actor, changes: h.changes ? JSON.parse(h.changes) : null, createdAt: h.createdAt })),
    source,
  }
}

// ---------------------------------------------------------------------------
// Hierarchy guards
// ---------------------------------------------------------------------------

async function ancestorsOf(ctx: ServiceCtx, id: string): Promise<string[]> {
  const out: string[] = []
  let cur: string | null = id
  for (let i = 0; cur && i < 50; i++) {
    const row: { parentId: string | null } | undefined = await ctx.db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, cur), eq(schema.tasks.ownerUuid, ctx.owner)),
      columns: { parentId: true },
    })
    if (!row) break
    out.push(cur)
    cur = row.parentId
  }
  return out
}

async function subtreeHeight(ctx: ServiceCtx, id: string): Promise<number> {
  let frontier = [id]
  let height = 0
  while (frontier.length && height < 50) {
    const next: string[] = []
    for (const part of chunk(frontier, 90)) {
      const rows = await ctx.db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.parentId, part), isNull(schema.tasks.deletedAt)))
      next.push(...rows.map((r) => r.id))
    }
    if (!next.length) break
    height++
    frontier = next
  }
  return height
}

export async function assertValidParent(ctx: ServiceCtx, taskId: string | null, parentId: string) {
  if (taskId && parentId === taskId) throw new AppError('CIRCULAR_HIERARCHY', 400, 'A task cannot be its own parent')
  const chain = await ancestorsOf(ctx, parentId)
  if (taskId && chain.includes(taskId)) throw new AppError('CIRCULAR_HIERARCHY', 400, 'Move would create a cycle')
  const below = taskId ? await subtreeHeight(ctx, taskId) : 0
  if (chain.length + 1 + below > LIMITS.maxNestingDepth) {
    throw new AppError('NESTING_TOO_DEEP', 400, `Nesting is limited to ${LIMITS.maxNestingDepth} levels`)
  }
}

async function descendantIds(ctx: ServiceCtx, id: string): Promise<string[]> {
  const all: string[] = []
  let frontier = [id]
  for (let depth = 0; frontier.length && depth < 50; depth++) {
    const next: string[] = []
    for (const part of chunk(frontier, 90)) {
      const rows = await ctx.db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.parentId, part)))
      next.push(...rows.map((r) => r.id))
    }
    all.push(...next)
    frontier = next
  }
  return all
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

function dueColumns(ctx: ServiceCtx, due: TaskCreateInput['due']) {
  const r = resolveDue(due ?? null, ctx.timeZone)
  return {
    duePrecision: r.precision,
    dueAt: r.dueAt,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    timeZone: r.timeZone,
    dueSortAt: r.dueSortAt,
  }
}

export async function createTask(
  ctx: ServiceCtx,
  input: TaskCreateInput & { sourceId?: string | null },
  actor: Actor = 'user',
): Promise<string> {
  await assertRefs(ctx, { projectId: input.projectId, goalId: input.goalId, parentId: input.parentId, tagIds: input.tagIds })
  if (input.parentId) await assertValidParent(ctx, null, input.parentId)
  if (input.startDate && input.due?.date && input.startDate > input.due.date) {
    throw new AppError('VALIDATION_ERROR', 400, 'Start date is after the due date', [{ path: 'startDate', message: 'INVALID_RANGE' }])
  }

  const id = newId()
  const status = input.status === 'archived' ? 'not_started' : input.status
  const maxOrder = await ctx.db
    .select({ m: sql<number>`coalesce(max(${schema.tasks.sortOrder}), 0)` })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.ownerUuid, ctx.owner), input.parentId ? eq(schema.tasks.parentId, input.parentId) : isNull(schema.tasks.parentId)))

  const stmts: any[] = [
    ctx.db.insert(schema.tasks).values({
      id,
      ownerUuid: ctx.owner,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      notes: input.notes ?? null,
      projectId: input.projectId ?? null,
      goalId: input.goalId ?? null,
      parentId: input.parentId ?? null,
      status,
      priority: input.priority,
      startDate: input.startDate ?? null,
      scheduledDate: input.scheduledDate ?? null,
      ...dueColumns(ctx, input.due),
      estimatedMinutes: input.estimatedMinutes ?? null,
      actualMinutes: input.actualMinutes ?? 0,
      progressPercent: status === 'completed' ? 100 : input.progressPercent,
      progressMode: input.progressMode,
      location: input.location ? JSON.stringify(input.location) : null,
      submission: input.submission ? JSON.stringify(input.submission) : null,
      deliverables: JSON.stringify(input.deliverables),
      requirements: JSON.stringify(input.requirements),
      rewards: JSON.stringify(input.rewards),
      sourceId: input.sourceId ?? null,
      sortOrder: (maxOrder[0]?.m ?? 0) + 1,
      completedAt: status === 'completed' ? ctx.now : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }),
    activity(ctx, 'task', id, 'created', { title: input.title, kind: input.kind }, actor),
  ]
  for (const tagId of input.tagIds) stmts.push(ctx.db.insert(schema.taskTags).values({ ownerUuid: ctx.owner, taskId: id, tagId }))
  for (const off of input.reminderOffsets ?? []) {
    stmts.push(
      ctx.db.insert(schema.reminderRules).values({ id: newId(), ownerUuid: ctx.owner, taskId: id, kind: 'offset', offsetMinutes: off, channels: '["in_app","push","email"]' }),
    )
  }
  await ctx.db.batch(stmts as [any, ...any[]])
  if (input.reminderOffsets?.length) await syncTargetReminders(ctx.db, ctx.owner, { taskId: id }, ctx.timeZone)
  if (input.parentId) await recomputeTaskProgress(ctx, input.parentId)
  return id
}

export async function updateTask(ctx: ServiceCtx, id: string, patch: TaskUpdateInput, actor: Actor = 'user') {
  const before = await getOwnedTask(ctx, id)
  await assertRefs(ctx, { projectId: patch.projectId, goalId: patch.goalId, tagIds: patch.tagIds })
  if (patch.parentId !== undefined && patch.parentId !== before.parentId && patch.parentId) {
    await getOwnedTask(ctx, patch.parentId)
    await assertValidParent(ctx, id, patch.parentId)
  }

  const set: Partial<TaskRow> = { updatedAt: ctx.now }
  const assign = <K extends keyof TaskRow>(k: K, v: TaskRow[K] | undefined) => {
    if (v !== undefined) set[k] = v
  }
  assign('title', patch.title)
  assign('kind', patch.kind)
  assign('description', patch.description)
  assign('notes', patch.notes)
  assign('projectId', patch.projectId)
  assign('goalId', patch.goalId)
  assign('parentId', patch.parentId)
  assign('priority', patch.priority)
  assign('startDate', patch.startDate)
  assign('scheduledDate', patch.scheduledDate)
  assign('estimatedMinutes', patch.estimatedMinutes)
  assign('actualMinutes', patch.actualMinutes ?? undefined)
  assign('progressMode', patch.progressMode)
  if (patch.progressPercent !== undefined) set.progressPercent = patch.progressPercent
  if (patch.location !== undefined) set.location = patch.location ? JSON.stringify(patch.location) : null
  if (patch.submission !== undefined) set.submission = patch.submission ? JSON.stringify(patch.submission) : null
  if (patch.deliverables !== undefined) set.deliverables = JSON.stringify(patch.deliverables)
  if (patch.requirements !== undefined) set.requirements = JSON.stringify(patch.requirements)
  if (patch.rewards !== undefined) set.rewards = JSON.stringify(patch.rewards)
  if (patch.due !== undefined) Object.assign(set, dueColumns(ctx, patch.due))
  if (patch.status !== undefined && patch.status !== before.status) Object.assign(set, statusColumns(ctx, before, patch.status))

  const startDate = set.startDate !== undefined ? set.startDate : before.startDate
  const dueDate = set.dueDate !== undefined ? set.dueDate : before.dueDate
  if (startDate && dueDate && startDate > dueDate) {
    throw new AppError('VALIDATION_ERROR', 400, 'Start date is after the due date', [{ path: 'startDate', message: 'INVALID_RANGE' }])
  }

  const changes = diff(before as Record<string, unknown>, set as Record<string, unknown>)
  const stmts: any[] = [ctx.db.update(schema.tasks).set(set).where(and(eq(schema.tasks.id, id), eq(schema.tasks.ownerUuid, ctx.owner)))]
  if (changes) stmts.push(activity(ctx, 'task', id, actionFor(before, set), changes, actor))
  if (patch.tagIds) {
    stmts.push(ctx.db.delete(schema.taskTags).where(and(eq(schema.taskTags.taskId, id), eq(schema.taskTags.ownerUuid, ctx.owner))))
    for (const tagId of patch.tagIds) stmts.push(ctx.db.insert(schema.taskTags).values({ ownerUuid: ctx.owner, taskId: id, tagId }))
  }
  await ctx.db.batch(stmts as [any, ...any[]])

  const dueChanged = patch.due !== undefined
  const statusChanged = set.status !== undefined
  if (dueChanged || statusChanged) await syncTargetReminders(ctx.db, ctx.owner, { taskId: id }, ctx.timeZone)
  if (statusChanged || patch.parentId !== undefined) {
    if (before.parentId) await recomputeTaskProgress(ctx, before.parentId)
    if (set.parentId && set.parentId !== before.parentId) await recomputeTaskProgress(ctx, set.parentId)
  }
  return { changed: Boolean(changes), previous: serializeTask(before) }
}

function actionFor(before: TaskRow, set: Partial<TaskRow>): string {
  if (set.status && set.status !== before.status) {
    if (set.status === 'completed') return 'completed'
    if (before.status === 'completed') return 'reopened'
    if (set.status === 'paused') return 'paused'
    if (before.status === 'paused') return 'resumed'
    if (set.status === 'archived') return 'archived'
    if (before.status === 'archived') return 'unarchived'
    return 'status_changed'
  }
  if (set.dueSortAt !== undefined && set.dueSortAt !== before.dueSortAt) return 'deadline_changed'
  if (set.progressPercent !== undefined && set.progressPercent !== before.progressPercent) return 'progress_updated'
  if (set.estimatedMinutes !== undefined && set.estimatedMinutes !== before.estimatedMinutes) return 'estimate_revised'
  if (set.parentId !== undefined || set.projectId !== undefined) return 'moved'
  return 'updated'
}

/** Consistent completion state: completedAt/archivedAt/progress follow status. */
function statusColumns(ctx: ServiceCtx, before: TaskRow, next: TaskStatus): Partial<TaskRow> {
  const out: Partial<TaskRow> = { status: next }
  if (next === 'completed') {
    out.completedAt = ctx.now
    out.progressPercent = 100
  } else if (before.status === 'completed') {
    out.completedAt = null
    if (before.progressMode === 'manual' && before.progressPercent >= 100) out.progressPercent = 90
  }
  if (next === 'archived') {
    out.archivedAt = ctx.now
    out.previousStatus = before.status
  } else if (before.status === 'archived') {
    out.archivedAt = null
  }
  if (next === 'paused') out.previousStatus = before.status
  return out
}

/** Transition helpers used by dedicated endpoints. */
export async function transitionTask(ctx: ServiceCtx, id: string, action: 'complete' | 'reopen' | 'pause' | 'resume' | 'archive' | 'unarchive') {
  const t = await getOwnedTask(ctx, id)
  let next: TaskStatus
  switch (action) {
    case 'complete':
      next = 'completed'
      break
    case 'reopen':
      next = t.progressPercent > 0 ? 'in_progress' : 'not_started'
      break
    case 'pause':
      next = 'paused'
      break
    case 'resume':
      next = (t.previousStatus && t.previousStatus !== 'paused' && t.previousStatus !== 'archived' ? t.previousStatus : 'in_progress') as TaskStatus
      break
    case 'archive':
      next = 'archived'
      break
    case 'unarchive':
      next = (t.previousStatus && t.previousStatus !== 'archived' ? t.previousStatus : 'not_started') as TaskStatus
      break
  }
  return updateTask(ctx, id, { status: next })
}

// ---------------------------------------------------------------------------
// Duplicate / delete / restore / move
// ---------------------------------------------------------------------------

export async function duplicateTask(ctx: ServiceCtx, id: string): Promise<string> {
  const t = await getOwnedTask(ctx, id)
  const s = serializeTask(t)
  const newTaskId = await createTask(ctx, {
    kind: s.kind as 'task' | 'deadline',
    title: s.title,
    description: s.description,
    notes: s.notes,
    projectId: s.projectId,
    goalId: s.goalId,
    parentId: s.parentId,
    status: 'not_started',
    priority: s.priority as TaskCreateInput['priority'],
    startDate: s.startDate,
    scheduledDate: s.scheduledDate,
    due:
      s.due.precision === 'unknown'
        ? { precision: 'unknown' }
        : { precision: s.due.precision as 'exact', date: s.due.date, time: s.due.time, timeZone: s.due.timeZone },
    estimatedMinutes: s.estimatedMinutes,
    actualMinutes: 0,
    progressPercent: 0,
    progressMode: s.progressMode as TaskCreateInput['progressMode'],
    location: s.location,
    submission: s.submission,
    deliverables: s.deliverables,
    requirements: s.requirements,
    rewards: s.rewards,
    tagIds: [],
  })
  const cps = await ctx.db
    .select()
    .from(schema.checkpoints)
    .where(and(eq(schema.checkpoints.ownerUuid, ctx.owner), eq(schema.checkpoints.taskId, id), isNull(schema.checkpoints.deletedAt)))
  if (cps.length) {
    await ctx.db.batch(
      cps.map((c) =>
        ctx.db.insert(schema.checkpoints).values({
          ...c,
          id: newId(),
          taskId: newTaskId,
          status: 'pending',
          completedAt: null,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        }),
      ) as [any, ...any[]],
    )
  }
  await ctx.db.insert(schema.activityLogs).values({ id: newId(), ownerUuid: ctx.owner, entityType: 'task', entityId: newTaskId, action: 'duplicated', changes: JSON.stringify({ from: id }), actor: 'user', createdAt: ctx.now })
  return newTaskId
}

/** Soft delete a task and its descendants (recoverable via restore). */
export async function deleteTask(ctx: ServiceCtx, id: string) {
  const t = await getOwnedTask(ctx, id)
  const ids = [id, ...(await descendantIds(ctx, id))]
  const stmts: any[] = []
  for (const part of chunk(ids, 90)) {
    stmts.push(
      ctx.db.update(schema.tasks).set({ deletedAt: ctx.now, updatedAt: ctx.now }).where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.id, part))),
    )
    // Pending reminders for deleted tasks are cancelled.
    stmts.push(
      ctx.db
        .update(schema.reminderJobs)
        .set({ status: 'cancelled', updatedAt: ctx.now })
        .where(
          and(
            eq(schema.reminderJobs.ownerUuid, ctx.owner),
            inArray(schema.reminderJobs.status, ['pending', 'retryable_failure']),
            inArray(
              schema.reminderJobs.ruleId,
              ctx.db.select({ id: schema.reminderRules.id }).from(schema.reminderRules).where(inArray(schema.reminderRules.taskId, part)),
            ),
          ),
        ),
    )
  }
  stmts.push(activity(ctx, 'task', id, 'deleted', { title: t.title, descendants: ids.length - 1 }))
  await ctx.db.batch(stmts as [any, ...any[]])
  if (t.parentId) await recomputeTaskProgress(ctx, t.parentId)
  return { deletedIds: ids }
}

export async function restoreTask(ctx: ServiceCtx, id: string) {
  const t = await ctx.db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, id), eq(schema.tasks.ownerUuid, ctx.owner)) })
  if (!t || !t.deletedAt) throw notFound('Deleted task')
  // Restore the subtree deleted in the same operation.
  const ids = [id, ...(await descendantIds(ctx, id))]
  const stmts: any[] = []
  for (const part of chunk(ids, 90)) {
    stmts.push(
      ctx.db
        .update(schema.tasks)
        .set({ deletedAt: null, updatedAt: ctx.now })
        .where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.id, part), eq(schema.tasks.deletedAt, t.deletedAt))),
    )
  }
  stmts.push(activity(ctx, 'task', id, 'restored', null))
  await ctx.db.batch(stmts as [any, ...any[]])
  for (const tid of ids) await syncTargetReminders(ctx.db, ctx.owner, { taskId: tid }, ctx.timeZone)
  if (t.parentId) await recomputeTaskProgress(ctx, t.parentId)
}

export async function moveTask(
  ctx: ServiceCtx,
  id: string,
  m: { parentId?: string | null; projectId?: string | null; goalId?: string | null; orderedSiblingIds?: string[] },
) {
  const patch: TaskUpdateInput = {}
  if (m.parentId !== undefined) patch.parentId = m.parentId
  if (m.projectId !== undefined) patch.projectId = m.projectId
  if (m.goalId !== undefined) patch.goalId = m.goalId
  if (Object.keys(patch).length) await updateTask(ctx, id, patch)

  if (m.orderedSiblingIds?.length) {
    const owned = await ctx.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.ownerUuid, ctx.owner), inArray(schema.tasks.id, m.orderedSiblingIds.slice(0, 90))))
    const ok = new Set(owned.map((r) => r.id))
    const stmts = m.orderedSiblingIds
      .filter((sid) => ok.has(sid))
      .map((sid, i) => ctx.db.update(schema.tasks).set({ sortOrder: i + 1 }).where(and(eq(schema.tasks.id, sid), eq(schema.tasks.ownerUuid, ctx.owner))))
    if (stmts.length) await ctx.db.batch(stmts as [any, ...any[]])
  }
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/** Would adding task -> dependsOn create a cycle? (DFS over the owner's graph.) */
export async function wouldCreateDependencyCycle(ctx: ServiceCtx, taskId: string, dependsOnId: string): Promise<boolean> {
  if (taskId === dependsOnId) return true
  const edges = await ctx.db
    .select({ from: schema.taskDependencies.taskId, to: schema.taskDependencies.dependsOnId })
    .from(schema.taskDependencies)
    .where(eq(schema.taskDependencies.ownerUuid, ctx.owner))
  const adj = new Map<string, string[]>()
  for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
  // Cycle iff taskId is reachable from dependsOnId.
  const stack = [dependsOnId]
  const seen = new Set<string>()
  while (stack.length) {
    const n = stack.pop()!
    if (n === taskId) return true
    if (seen.has(n)) continue
    seen.add(n)
    stack.push(...(adj.get(n) ?? []))
  }
  return false
}

export async function addDependency(ctx: ServiceCtx, taskId: string, dependsOnId: string, type: string, note?: string | null) {
  await getOwnedTask(ctx, taskId)
  await getOwnedTask(ctx, dependsOnId)
  if (await wouldCreateDependencyCycle(ctx, taskId, dependsOnId)) {
    throw new AppError('CIRCULAR_DEPENDENCY', 400, 'This dependency would create a cycle')
  }
  const id = newId()
  await ctx.db.batch([
    ctx.db
      .insert(schema.taskDependencies)
      .values({ id, ownerUuid: ctx.owner, taskId, dependsOnId, type, note: note ?? null })
      .onConflictDoNothing(),
    activity(ctx, 'task', taskId, 'dependency_added', { dependsOnId, type }),
  ])
  return id
}

export async function removeDependency(ctx: ServiceCtx, taskId: string, depId: string) {
  await getOwnedTask(ctx, taskId)
  const r = await ctx.db
    .delete(schema.taskDependencies)
    .where(and(eq(schema.taskDependencies.id, depId), eq(schema.taskDependencies.taskId, taskId), eq(schema.taskDependencies.ownerUuid, ctx.owner)))
    .returning({ id: schema.taskDependencies.id })
  if (!r.length) throw notFound('Dependency')
  await activity(ctx, 'task', taskId, 'dependency_removed', { dependencyId: depId })
}

// ---------------------------------------------------------------------------
// Progress roll-up
// ---------------------------------------------------------------------------

/**
 * Recompute derived progress for tasks in checkpoints/subtasks mode.
 * Only direct children count, so nested tasks are never double-counted.
 */
export async function recomputeTaskProgress(ctx: ServiceCtx, taskId: string): Promise<void> {
  const t = await ctx.db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.ownerUuid, ctx.owner)) })
  if (!t || t.progressMode === 'manual' || t.status === 'completed') return
  let pct = t.progressPercent
  if (t.progressMode === 'checkpoints') {
    const rows = await ctx.db
      .select({ status: schema.checkpoints.status, weight: schema.checkpoints.weight })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.taskId, taskId), eq(schema.checkpoints.ownerUuid, ctx.owner), isNull(schema.checkpoints.deletedAt), ne(schema.checkpoints.status, 'skipped')))
    const total = rows.reduce((s, r) => s + r.weight, 0)
    pct = total > 0 ? (rows.filter((r) => r.status === 'done').reduce((s, r) => s + r.weight, 0) / total) * 100 : 0
  } else if (t.progressMode === 'subtasks') {
    const rows = await ctx.db
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.parentId, taskId), eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt), ne(schema.tasks.status, 'archived')))
    pct = rows.length ? (rows.filter((r) => r.status === 'completed').length / rows.length) * 100 : 0
  }
  pct = Math.round(pct * 10) / 10
  if (pct !== t.progressPercent) {
    const status = t.status === 'not_started' && pct > 0 ? 'in_progress' : t.status
    await ctx.db.update(schema.tasks).set({ progressPercent: pct, status, updatedAt: ctx.now }).where(eq(schema.tasks.id, taskId))
  }
}
