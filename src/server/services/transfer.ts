// Versioned export / validated import. Exports never contain owner ids; imports
// always get fresh ids owned by the importing session, so a file can never
// claim another user's records.

import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { parseJson, schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError } from '../lib/http'
import { EXPORT_SCHEMA_VERSION } from '../../shared/constants'
import { syncTargetReminders } from '../reminders/schedule'
import { chunk, type ServiceCtx } from './common'

const strip = <T extends Record<string, unknown>>(row: T) => {
  const { ownerUuid: _o, ...rest } = row as T & { ownerUuid?: string }
  return rest
}

export async function buildExport(ctx: ServiceCtx, opts: { includeSources: boolean }) {
  const o = ctx.owner
  const [projects, goals, tasks, taskDeps, checkpoints, cpDeps, progress, tags, taskTags, rules, sources] = await ctx.db.batch([
    ctx.db.select().from(schema.projects).where(and(eq(schema.projects.ownerUuid, o), isNull(schema.projects.deletedAt))),
    ctx.db.select().from(schema.goals).where(and(eq(schema.goals.ownerUuid, o), isNull(schema.goals.deletedAt))),
    ctx.db.select().from(schema.tasks).where(and(eq(schema.tasks.ownerUuid, o), isNull(schema.tasks.deletedAt))),
    ctx.db.select().from(schema.taskDependencies).where(eq(schema.taskDependencies.ownerUuid, o)),
    ctx.db.select().from(schema.checkpoints).where(and(eq(schema.checkpoints.ownerUuid, o), isNull(schema.checkpoints.deletedAt))),
    ctx.db.select().from(schema.checkpointDependencies).where(eq(schema.checkpointDependencies.ownerUuid, o)),
    ctx.db.select().from(schema.progressEntries).where(eq(schema.progressEntries.ownerUuid, o)),
    ctx.db.select().from(schema.tags).where(eq(schema.tags.ownerUuid, o)),
    ctx.db.select().from(schema.taskTags).where(eq(schema.taskTags.ownerUuid, o)),
    ctx.db.select().from(schema.reminderRules).where(eq(schema.reminderRules.ownerUuid, o)),
    ctx.db.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.ownerUuid, o)),
  ])
  return {
    schema: 'tickpoint.export',
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date(ctx.now).toISOString(),
    data: {
      projects: projects.map(strip),
      goals: goals.map(strip),
      tasks: tasks.map(strip),
      taskDependencies: taskDeps.map(strip),
      checkpoints: checkpoints.map(strip),
      checkpointDependencies: cpDeps.map(strip),
      progressEntries: progress.map(strip),
      tags: tags.map(strip),
      taskTags: taskTags.map(strip),
      reminderRules: rules.map(strip),
      sourceDocuments: opts.includeSources ? sources.map(strip) : sources.map((s) => ({ ...strip(s), content: null })),
    },
  }
}

const csvCell = (v: unknown) => {
  if (v == null) return ''
  let s = String(v)
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function buildTasksCsv(ctx: ServiceCtx): Promise<string> {
  const rows = await ctx.db
    .select({ t: schema.tasks, project: schema.projects.name, goal: schema.goals.title })
    .from(schema.tasks)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    .leftJoin(schema.goals, eq(schema.goals.id, schema.tasks.goalId))
    .where(and(eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt)))
  const header = ['id', 'kind', 'title', 'status', 'priority', 'project', 'goal', 'parent_id', 'due_precision', 'due_date', 'due_time', 'time_zone', 'due_at_utc', 'progress_percent', 'estimated_minutes', 'actual_minutes', 'completed_at_utc', 'created_at_utc']
  const iso = (n: number | null) => (n == null ? '' : new Date(n).toISOString())
  const lines = rows.map(({ t, project, goal }) =>
    [t.id, t.kind, t.title, t.status, t.priority, project, goal, t.parentId, t.duePrecision, t.dueDate, t.dueTime, t.timeZone, iso(t.dueAt), t.progressPercent, t.estimatedMinutes, t.actualMinutes, iso(t.completedAt), iso(t.createdAt)]
      .map(csvCell)
      .join(','),
  )
  return '﻿' + [header.join(','), ...lines].join('\r\n')
}

export async function buildProgressCsv(ctx: ServiceCtx): Promise<string> {
  const rows = await ctx.db
    .select({ p: schema.progressEntries, task: schema.tasks.title, goal: schema.goals.title })
    .from(schema.progressEntries)
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.progressEntries.taskId))
    .leftJoin(schema.goals, eq(schema.goals.id, schema.progressEntries.goalId))
    .where(eq(schema.progressEntries.ownerUuid, ctx.owner))
  const header = ['occurred_at_utc', 'task', 'goal', 'kind', 'previous_value', 'new_value', 'minutes', 'note']
  const lines = rows.map(({ p, task, goal }) => [new Date(p.occurredAt).toISOString(), task, goal, p.kind, p.previousValue, p.newValue, p.minutes, p.note].map(csvCell).join(','))
  return '﻿' + [header.join(','), ...lines].join('\r\n')
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(64)
const ts = z.number().int().nullable().optional()
const str = (max: number) => z.string().max(max).nullable().optional()

const importSchema = z.object({
  schema: z.literal('tickpoint.export'),
  version: z.number().int().min(1).max(EXPORT_SCHEMA_VERSION),
  data: z.object({
    projects: z.array(z.object({ id, name: z.string().min(1).max(300), description: str(20000), color: str(7), icon: str(40), status: z.string().max(20).optional(), sortOrder: z.number().optional() })).max(2000).default([]),
    goals: z
      .array(
        z.object({
          id,
          projectId: str(64),
          title: z.string().min(1).max(300),
          description: str(20000),
          targetDate: str(10),
          progressModel: z.enum(['binary', 'percentage', 'quantity', 'time', 'checkpoint', 'weighted']),
          currentValue: z.number().min(0).max(1e9),
          targetValue: z.number().positive().max(1e9).nullable().optional(),
          unit: str(40),
          weeklyEffortMinutes: z.number().int().min(0).nullable().optional(),
          reviewFrequency: z.string().max(20).optional(),
          successCriteria: str(2000),
          estimatedMinutes: z.number().int().min(0).nullable().optional(),
          actualMinutes: z.number().int().min(0).optional(),
          status: z.enum(['active', 'paused', 'completed', 'archived']),
          completedAt: ts,
          createdAt: ts,
        }),
      )
      .max(5000)
      .default([]),
    tasks: z
      .array(
        z.object({
          id,
          projectId: str(64),
          goalId: str(64),
          parentId: str(64),
          kind: z.enum(['task', 'deadline']),
          title: z.string().min(1).max(300),
          description: str(20000),
          notes: str(20000),
          status: z.enum(['not_started', 'in_progress', 'paused', 'completed', 'archived']),
          priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
          startDate: str(10),
          scheduledDate: str(10),
          duePrecision: z.enum(['exact', 'date', 'approximate', 'unknown']),
          dueAt: ts,
          dueDate: str(10),
          dueTime: str(5),
          timeZone: str(64),
          dueSortAt: ts,
          estimatedMinutes: z.number().int().min(0).nullable().optional(),
          actualMinutes: z.number().int().min(0).optional(),
          progressPercent: z.number().min(0).max(100),
          progressMode: z.enum(['manual', 'checkpoints', 'subtasks']),
          location: str(5000),
          submission: str(5000),
          deliverables: z.string().max(100000).optional(),
          requirements: z.string().max(100000).optional(),
          rewards: z.string().max(100000).optional(),
          sourceId: str(64),
          sortOrder: z.number().optional(),
          completedAt: ts,
          createdAt: ts,
        }),
      )
      .max(20000)
      .default([]),
    taskDependencies: z.array(z.object({ taskId: id, dependsOnId: id, type: z.string().max(30).optional(), note: str(500) })).max(20000).default([]),
    checkpoints: z
      .array(
        z.object({
          id,
          taskId: str(64),
          goalId: str(64),
          title: z.string().min(1).max(300),
          description: str(4000),
          completionCriteria: str(2000),
          startDate: str(10),
          targetDate: str(10),
          estimatedMinutes: z.number().int().min(0).nullable().optional(),
          weight: z.number().positive().max(1000).optional(),
          priority: z.string().max(10).optional(),
          status: z.enum(['pending', 'done', 'skipped']),
          origin: z.string().max(10).optional(),
          sortOrder: z.number().optional(),
          completedAt: ts,
        }),
      )
      .max(50000)
      .default([]),
    checkpointDependencies: z.array(z.object({ checkpointId: id, dependsOnId: id })).max(50000).default([]),
    progressEntries: z
      .array(z.object({ taskId: str(64), goalId: str(64), checkpointId: str(64), kind: z.string().max(20), previousValue: z.number().nullable().optional(), newValue: z.number().nullable().optional(), gain: z.number().nullable().optional(), minutes: z.number().int().min(0).nullable().optional(), note: str(2000), occurredAt: z.number().int() }))
      .max(100000)
      .default([]),
    tags: z.array(z.object({ id, name: z.string().min(1).max(40), color: str(7) })).max(500).default([]),
    taskTags: z.array(z.object({ taskId: id, tagId: id })).max(50000).default([]),
    reminderRules: z
      .array(z.object({ taskId: str(64), goalId: str(64), checkpointId: str(64), kind: z.enum(['offset', 'absolute']), offsetMinutes: z.number().int().min(0).nullable().optional(), absoluteAt: ts, channels: z.string().max(100).optional(), enabled: z.boolean().optional() }))
      .max(20000)
      .default([]),
    sourceDocuments: z.array(z.object({ id, title: str(300), url: str(2048), sourceDate: str(10), context: str(2000), content: str(60000), contentChars: z.number().int().optional(), language: str(20) })).max(5000).default([]),
  }),
})
export type ImportFile = z.infer<typeof importSchema>

export function parseImport(raw: unknown): ImportFile {
  const r = importSchema.safeParse(raw)
  if (!r.success) {
    throw new AppError('VALIDATION_ERROR', 400, 'Invalid TickPoint export file', r.error.issues.slice(0, 15).map((i) => ({ path: i.path.join('.'), message: i.message })))
  }
  return r.data
}

async function duplicateIndex(ctx: ServiceCtx) {
  const [projects, goals, tasks, tags] = await ctx.db.batch([
    ctx.db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(and(eq(schema.projects.ownerUuid, ctx.owner), isNull(schema.projects.deletedAt))),
    ctx.db.select({ id: schema.goals.id, title: schema.goals.title }).from(schema.goals).where(and(eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt))),
    ctx.db.select({ id: schema.tasks.id, title: schema.tasks.title, dueDate: schema.tasks.dueDate, parentId: schema.tasks.parentId }).from(schema.tasks).where(and(eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt))),
    ctx.db.select({ id: schema.tags.id, name: schema.tags.name }).from(schema.tags).where(eq(schema.tags.ownerUuid, ctx.owner)),
  ])
  return {
    projects: new Map(projects.map((p) => [p.name.toLowerCase(), p.id])),
    goals: new Map(goals.map((g) => [g.title.toLowerCase(), g.id])),
    tasks: new Map(tasks.map((t) => [`${t.title.toLowerCase()}|${t.dueDate ?? ''}`, t.id])),
    tags: new Map(tags.map((t) => [t.name.toLowerCase(), t.id])),
  }
}

export async function previewImport(ctx: ServiceCtx, file: ImportFile) {
  const idx = await duplicateIndex(ctx)
  const d = file.data
  const dup = {
    projects: d.projects.filter((p) => idx.projects.has(p.name.toLowerCase())).length,
    goals: d.goals.filter((g) => idx.goals.has(g.title.toLowerCase())).length,
    tasks: d.tasks.filter((t) => idx.tasks.has(`${t.title.toLowerCase()}|${t.dueDate ?? ''}`)).length,
    tags: d.tags.filter((t) => idx.tags.has(t.name.toLowerCase())).length,
  }
  return {
    version: file.version,
    counts: {
      projects: d.projects.length,
      goals: d.goals.length,
      tasks: d.tasks.length,
      checkpoints: d.checkpoints.length,
      progressEntries: d.progressEntries.length,
      tags: d.tags.length,
      reminderRules: d.reminderRules.length,
      sourceDocuments: d.sourceDocuments.length,
    },
    duplicates: dup,
    sampleTasks: d.tasks.slice(0, 10).map((t) => ({ title: t.title, kind: t.kind, dueDate: t.dueDate, status: t.status })),
  }
}

export async function commitImport(ctx: ServiceCtx, file: ImportFile, skipDuplicates: boolean) {
  const idx = await duplicateIndex(ctx)
  const d = file.data
  const map = new Map<string, string>() // old id -> new (or existing) id, namespaced
  const k = (ns: string, old: string | null | undefined) => (old ? map.get(`${ns}:${old}`) ?? null : null)
  const stmts: any[] = []
  const created = { projects: 0, goals: 0, tasks: 0, checkpoints: 0, progressEntries: 0, tags: 0, reminderRules: 0, sourceDocuments: 0, skipped: 0 }
  const now = ctx.now

  for (const s of d.sourceDocuments) {
    const nid = newId()
    map.set(`src:${s.id}`, nid)
    stmts.push(ctx.db.insert(schema.sourceDocuments).values({ id: nid, ownerUuid: ctx.owner, title: s.title ?? null, url: s.url ?? null, sourceDate: s.sourceDate ?? null, context: s.context ?? null, content: s.content ?? null, contentChars: s.content?.length ?? 0, language: s.language ?? null, contentDeletedAt: s.content ? null : now }))
    created.sourceDocuments++
  }
  for (const t of d.tags) {
    const existing = idx.tags.get(t.name.toLowerCase())
    if (existing) {
      map.set(`tag:${t.id}`, existing)
      created.skipped++
      continue
    }
    const nid = newId()
    map.set(`tag:${t.id}`, nid)
    stmts.push(ctx.db.insert(schema.tags).values({ id: nid, ownerUuid: ctx.owner, name: t.name, color: t.color ?? null }))
    created.tags++
  }
  for (const p of d.projects) {
    const existing = skipDuplicates ? idx.projects.get(p.name.toLowerCase()) : undefined
    if (existing) {
      map.set(`project:${p.id}`, existing)
      created.skipped++
      continue
    }
    const nid = newId()
    map.set(`project:${p.id}`, nid)
    stmts.push(ctx.db.insert(schema.projects).values({ id: nid, ownerUuid: ctx.owner, name: p.name, description: p.description ?? null, color: p.color ?? null, icon: p.icon ?? null, status: p.status === 'archived' ? 'archived' : 'active', sortOrder: p.sortOrder ?? 0 }))
    created.projects++
  }
  for (const g of d.goals) {
    const existing = skipDuplicates ? idx.goals.get(g.title.toLowerCase()) : undefined
    if (existing) {
      map.set(`goal:${g.id}`, existing)
      created.skipped++
      continue
    }
    const nid = newId()
    map.set(`goal:${g.id}`, nid)
    stmts.push(
      ctx.db.insert(schema.goals).values({
        id: nid,
        ownerUuid: ctx.owner,
        projectId: k('project', g.projectId),
        title: g.title,
        description: g.description ?? null,
        targetDate: g.targetDate ?? null,
        progressModel: g.progressModel,
        currentValue: g.currentValue,
        targetValue: g.targetValue ?? null,
        unit: g.unit ?? null,
        weeklyEffortMinutes: g.weeklyEffortMinutes ?? null,
        reviewFrequency: g.reviewFrequency ?? 'weekly',
        successCriteria: g.successCriteria ?? null,
        estimatedMinutes: g.estimatedMinutes ?? null,
        actualMinutes: g.actualMinutes ?? 0,
        status: g.status,
        completedAt: g.completedAt ?? null,
        createdAt: g.createdAt ?? now,
      }),
    )
    created.goals++
  }
  // Tasks: assign ids first so parent references resolve regardless of order.
  const taskSkip = new Set<string>()
  for (const t of d.tasks) {
    const existing = skipDuplicates ? idx.tasks.get(`${t.title.toLowerCase()}|${t.dueDate ?? ''}`) : undefined
    if (existing) {
      map.set(`task:${t.id}`, existing)
      taskSkip.add(t.id)
      created.skipped++
    } else map.set(`task:${t.id}`, newId())
  }
  // Break any parent cycles present in the file by detaching offending nodes.
  const parentOf = new Map(d.tasks.map((t) => [t.id, t.parentId ?? null]))
  for (const t of d.tasks) {
    const seen = new Set<string>([t.id])
    let p = parentOf.get(t.id)
    while (p) {
      if (seen.has(p)) {
        parentOf.set(t.id, null)
        break
      }
      seen.add(p)
      p = parentOf.get(p) ?? null
    }
  }
  for (const t of d.tasks) {
    if (taskSkip.has(t.id)) continue
    const parent = parentOf.get(t.id)
    stmts.push(
      ctx.db.insert(schema.tasks).values({
        id: k('task', t.id)!,
        ownerUuid: ctx.owner,
        projectId: k('project', t.projectId),
        goalId: k('goal', t.goalId),
        parentId: parent ? k('task', parent) : null,
        kind: t.kind,
        title: t.title,
        description: t.description ?? null,
        notes: t.notes ?? null,
        status: t.status,
        priority: t.priority,
        startDate: t.startDate ?? null,
        scheduledDate: t.scheduledDate ?? null,
        duePrecision: t.duePrecision,
        dueAt: t.dueAt ?? null,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        timeZone: t.timeZone ?? null,
        dueSortAt: t.dueSortAt ?? null,
        estimatedMinutes: t.estimatedMinutes ?? null,
        actualMinutes: t.actualMinutes ?? 0,
        progressPercent: t.progressPercent,
        progressMode: t.progressMode,
        location: t.location ?? null,
        submission: t.submission ?? null,
        deliverables: JSON.stringify(parseJson(t.deliverables, [])),
        requirements: JSON.stringify(parseJson(t.requirements, [])),
        rewards: JSON.stringify(parseJson(t.rewards, [])),
        sourceId: k('src', t.sourceId),
        sortOrder: t.sortOrder ?? 0,
        completedAt: t.completedAt ?? null,
        createdAt: t.createdAt ?? now,
        updatedAt: now,
      }),
    )
    created.tasks++
  }
  for (const dep of d.taskDependencies) {
    const a = k('task', dep.taskId)
    const b = k('task', dep.dependsOnId)
    if (a && b && a !== b && !(taskSkip.has(dep.taskId) && taskSkip.has(dep.dependsOnId))) {
      stmts.push(ctx.db.insert(schema.taskDependencies).values({ id: newId(), ownerUuid: ctx.owner, taskId: a, dependsOnId: b, type: dep.type ?? 'finish_to_start', note: dep.note ?? null }).onConflictDoNothing())
    }
  }
  for (const tt of d.taskTags) {
    const a = k('task', tt.taskId)
    const b = k('tag', tt.tagId)
    if (a && b && !taskSkip.has(tt.taskId)) stmts.push(ctx.db.insert(schema.taskTags).values({ ownerUuid: ctx.owner, taskId: a, tagId: b }).onConflictDoNothing())
  }
  for (const c of d.checkpoints) {
    const taskId = k('task', c.taskId)
    const goalId = k('goal', c.goalId)
    if (!taskId && !goalId) continue
    if (c.taskId && taskSkip.has(c.taskId)) continue
    const nid = newId()
    map.set(`cp:${c.id}`, nid)
    stmts.push(
      ctx.db.insert(schema.checkpoints).values({
        id: nid,
        ownerUuid: ctx.owner,
        taskId: taskId ?? null,
        goalId: taskId ? null : goalId,
        title: c.title,
        description: c.description ?? null,
        completionCriteria: c.completionCriteria ?? null,
        startDate: c.startDate ?? null,
        targetDate: c.targetDate ?? null,
        estimatedMinutes: c.estimatedMinutes ?? null,
        weight: c.weight ?? 1,
        priority: c.priority ?? 'none',
        status: c.status,
        origin: c.origin === 'ai' ? 'ai' : 'manual',
        sortOrder: c.sortOrder ?? 0,
        completedAt: c.completedAt ?? null,
      }),
    )
    created.checkpoints++
  }
  for (const cd of d.checkpointDependencies) {
    const a = k('cp', cd.checkpointId)
    const b = k('cp', cd.dependsOnId)
    if (a && b && a !== b) stmts.push(ctx.db.insert(schema.checkpointDependencies).values({ ownerUuid: ctx.owner, checkpointId: a, dependsOnId: b }).onConflictDoNothing())
  }
  for (const p of d.progressEntries) {
    const taskId = p.taskId && !taskSkip.has(p.taskId) ? k('task', p.taskId) : null
    const goalId = k('goal', p.goalId)
    if (!taskId && !goalId) continue
    stmts.push(ctx.db.insert(schema.progressEntries).values({ id: newId(), ownerUuid: ctx.owner, taskId, goalId, checkpointId: k('cp', p.checkpointId), kind: p.kind, previousValue: p.previousValue ?? null, newValue: p.newValue ?? null, gain: p.gain ?? null, minutes: p.minutes ?? null, note: p.note ?? null, occurredAt: Math.min(p.occurredAt, now) }))
    created.progressEntries++
  }
  const ruleIds: { id: string; taskId: string | null; goalId: string | null; checkpointId: string | null }[] = []
  for (const r of d.reminderRules) {
    const taskId = r.taskId && !taskSkip.has(r.taskId) ? k('task', r.taskId) : null
    const goalId = r.goalId ? k('goal', r.goalId) : null
    const checkpointId = k('cp', r.checkpointId)
    if ([taskId, goalId, checkpointId].filter(Boolean).length !== 1) continue
    const nid = newId()
    ruleIds.push({ id: nid, taskId, goalId, checkpointId })
    stmts.push(ctx.db.insert(schema.reminderRules).values({ id: nid, ownerUuid: ctx.owner, taskId, goalId, checkpointId, kind: r.kind, offsetMinutes: r.offsetMinutes ?? null, absoluteAt: r.absoluteAt ?? null, channels: r.channels ?? '["in_app"]', enabled: r.enabled ?? true }))
    created.reminderRules++
  }

  // D1 batches are atomic; chunk to stay within request limits.
  for (const part of chunk(stmts, 80)) await ctx.db.batch(part as [any, ...any[]])
  for (const r of ruleIds) {
    await syncTargetReminders(ctx.db, ctx.owner, r.taskId ? { taskId: r.taskId } : r.goalId ? { goalId: r.goalId } : { checkpointId: r.checkpointId! }, ctx.timeZone)
  }
  await ctx.db.insert(schema.activityLogs).values({ id: newId(), ownerUuid: ctx.owner, entityType: 'account', entityId: ctx.owner, action: 'imported', changes: JSON.stringify(created), actor: 'import', createdAt: now })
  return created
}

/** Permanently delete all of the user's TickPoint data (not the AuthCenter account). */
export async function deleteAllData(ctx: ServiceCtx, bucket: R2Bucket) {
  const files = await ctx.db.select({ key: schema.attachments.r2Key }).from(schema.attachments).where(eq(schema.attachments.ownerUuid, ctx.owner))
  const backups = await ctx.db.select({ key: schema.backups.r2Key }).from(schema.backups).where(eq(schema.backups.ownerUuid, ctx.owner))
  const keys = [...files, ...backups].map((f) => f.key)
  for (const part of chunk(keys, 500)) if (part.length) await bucket.delete(part)
  const o = ctx.owner
  await ctx.db.batch([
    ctx.db.delete(schema.notificationDeliveries).where(eq(schema.notificationDeliveries.ownerUuid, o)),
    ctx.db.delete(schema.notifications).where(eq(schema.notifications.ownerUuid, o)),
    ctx.db.delete(schema.reminderJobs).where(eq(schema.reminderJobs.ownerUuid, o)),
    ctx.db.delete(schema.reminderRules).where(eq(schema.reminderRules.ownerUuid, o)),
    ctx.db.delete(schema.progressEntries).where(eq(schema.progressEntries.ownerUuid, o)),
    ctx.db.delete(schema.checkpointDependencies).where(eq(schema.checkpointDependencies.ownerUuid, o)),
    ctx.db.delete(schema.checkpoints).where(eq(schema.checkpoints.ownerUuid, o)),
    ctx.db.delete(schema.taskTags).where(eq(schema.taskTags.ownerUuid, o)),
    ctx.db.delete(schema.taskDependencies).where(eq(schema.taskDependencies.ownerUuid, o)),
    ctx.db.delete(schema.attachments).where(eq(schema.attachments.ownerUuid, o)),
    ctx.db.delete(schema.aiPlanningDrafts).where(eq(schema.aiPlanningDrafts.ownerUuid, o)),
    ctx.db.delete(schema.tasks).where(eq(schema.tasks.ownerUuid, o)),
    ctx.db.delete(schema.goals).where(eq(schema.goals.ownerUuid, o)),
    ctx.db.delete(schema.projects).where(eq(schema.projects.ownerUuid, o)),
    ctx.db.delete(schema.tags).where(eq(schema.tags.ownerUuid, o)),
    ctx.db.delete(schema.aiExtractionDrafts).where(eq(schema.aiExtractionDrafts.ownerUuid, o)),
    ctx.db.delete(schema.sourceDocuments).where(eq(schema.sourceDocuments.ownerUuid, o)),
    ctx.db.delete(schema.aiUsage).where(eq(schema.aiUsage.ownerUuid, o)),
    ctx.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.ownerUuid, o)),
    ctx.db.delete(schema.backups).where(eq(schema.backups.ownerUuid, o)),
    ctx.db.delete(schema.activityLogs).where(eq(schema.activityLogs.ownerUuid, o)),
    ctx.db.insert(schema.activityLogs).values({ id: newId(), ownerUuid: o, entityType: 'account', entityId: o, action: 'data_deleted', actor: 'user', createdAt: ctx.now }),
  ])
}
