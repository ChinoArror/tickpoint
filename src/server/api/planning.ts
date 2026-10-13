// Projects, tasks, checkpoints, goals, progress, tags, sources.

import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, isNull, like, or } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound, ok, parse, readJson, readQuery } from '../lib/http'
import {
  checkpointCreateSchema,
  checkpointReorderSchema,
  checkpointUpdateSchema,
  dependencyCreateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  idSchema,
  isoDateSchema,
  progressCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  tagCreateSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskMoveSchema,
  taskUpdateSchema,
} from '../../shared/schemas'
import { svc } from './context'
import { activity, getOwnedProject, serializeTask } from '../services/common'
import * as tasks from '../services/tasks'
import * as cps from '../services/checkpoints'
import * as goals from '../services/goals'

export const planningRoutes = new Hono<AppBindings>()
const idParam = (v: string) => parse(idSchema, v)

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

planningRoutes.get('/projects', async (c) => {
  const ctx = await svc(c)
  const status = c.req.query('status') === 'archived' ? 'archived' : 'active'
  const rows = await ctx.db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerUuid, ctx.owner), eq(schema.projects.status, status), isNull(schema.projects.deletedAt)))
    .orderBy(asc(schema.projects.sortOrder), asc(schema.projects.createdAt))
  return ok(c, rows.map(({ ownerUuid: _o, ...p }) => p))
})

planningRoutes.post('/projects', async (c) => {
  const ctx = await svc(c)
  const input = await readJson(c, projectCreateSchema)
  const id = newId()
  await ctx.db.batch([
    ctx.db.insert(schema.projects).values({ id, ownerUuid: ctx.owner, name: input.name, description: input.description ?? null, color: input.color ?? null, icon: input.icon ?? null }),
    activity(ctx, 'project', id, 'created', { name: input.name }),
  ])
  return ok(c, { id }, 201)
})

planningRoutes.patch('/projects/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const before = await getOwnedProject(ctx, id)
  const input = await readJson(c, projectUpdateSchema)
  await ctx.db.batch([
    ctx.db.update(schema.projects).set({ ...input, updatedAt: ctx.now }).where(and(eq(schema.projects.id, id), eq(schema.projects.ownerUuid, ctx.owner))),
    activity(ctx, 'project', id, input.status && input.status !== before.status ? input.status : 'updated', input),
  ])
  return ok(c, { id })
})

planningRoutes.delete('/projects/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const p = await getOwnedProject(ctx, id)
  // Items are kept (moved out of the project), never silently deleted.
  await ctx.db.batch([
    ctx.db.update(schema.projects).set({ deletedAt: ctx.now }).where(and(eq(schema.projects.id, id), eq(schema.projects.ownerUuid, ctx.owner))),
    ctx.db.update(schema.tasks).set({ projectId: null, updatedAt: ctx.now }).where(and(eq(schema.tasks.projectId, id), eq(schema.tasks.ownerUuid, ctx.owner))),
    ctx.db.update(schema.goals).set({ projectId: null, updatedAt: ctx.now }).where(and(eq(schema.goals.projectId, id), eq(schema.goals.ownerUuid, ctx.owner))),
    activity(ctx, 'project', id, 'deleted', { name: p.name }),
  ])
  return ok(c, { id })
})

// ---------------------------------------------------------------------------
// Tasks / deadlines
// ---------------------------------------------------------------------------

planningRoutes.get('/tasks', async (c) => ok(c, await tasks.listTasks(await svc(c), readQuery(c, taskListQuerySchema))))

planningRoutes.post('/tasks', async (c) => {
  const ctx = await svc(c)
  const input = await readJson(c, taskCreateSchema)
  const id = await tasks.createTask(ctx, input)
  return ok(c, await tasks.getTaskDetail(ctx, id), 201)
})

planningRoutes.get('/tasks/:id', async (c) => ok(c, await tasks.getTaskDetail(await svc(c), idParam(c.req.param('id')))))

planningRoutes.patch('/tasks/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const r = await tasks.updateTask(ctx, id, await readJson(c, taskUpdateSchema))
  return ok(c, { task: await tasks.getTaskDetail(ctx, id), previous: r.previous })
})

planningRoutes.post('/tasks/:id/:action{complete|reopen|pause|resume|archive|unarchive}', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  await tasks.transitionTask(ctx, id, c.req.param('action') as 'complete')
  const [t] = await tasks.enrichTasks(ctx, [(await ctx.db.query.tasks.findFirst({ where: eq(schema.tasks.id, id) }))!])
  return ok(c, t)
})

planningRoutes.post('/tasks/:id/duplicate', async (c) => {
  const ctx = await svc(c)
  const nid = await tasks.duplicateTask(ctx, idParam(c.req.param('id')))
  return ok(c, { id: nid }, 201)
})

planningRoutes.post('/tasks/:id/move', async (c) => {
  const ctx = await svc(c)
  await tasks.moveTask(ctx, idParam(c.req.param('id')), await readJson(c, taskMoveSchema))
  return ok(c, { moved: true })
})

planningRoutes.delete('/tasks/:id', async (c) => ok(c, await tasks.deleteTask(await svc(c), idParam(c.req.param('id')))))
planningRoutes.post('/tasks/:id/restore', async (c) => {
  await tasks.restoreTask(await svc(c), idParam(c.req.param('id')))
  return ok(c, { restored: true })
})

planningRoutes.post('/tasks/:id/dependencies', async (c) => {
  const ctx = await svc(c)
  const input = await readJson(c, dependencyCreateSchema)
  const id = await tasks.addDependency(ctx, idParam(c.req.param('id')), input.dependsOnId, input.type, input.note)
  return ok(c, { id }, 201)
})
planningRoutes.delete('/tasks/:id/dependencies/:depId', async (c) => {
  await tasks.removeDependency(await svc(c), idParam(c.req.param('id')), idParam(c.req.param('depId')))
  return ok(c, { removed: true })
})

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

planningRoutes.get('/checkpoints', async (c) => {
  const ctx = await svc(c)
  const q = parse(z.object({ taskId: idSchema.optional(), goalId: idSchema.optional(), from: isoDateSchema.optional(), to: isoDateSchema.optional() }), c.req.query())
  if (q.from && q.to) return ok(c, await cps.checkpointsInRange(ctx, q.from, q.to))
  if (!q.taskId && !q.goalId) throw new AppError('VALIDATION_ERROR', 400, 'taskId, goalId or from/to required')
  return ok(c, await cps.listCheckpointsFor(ctx, { taskId: q.taskId, goalId: q.goalId }))
})
planningRoutes.post('/checkpoints', async (c) => {
  const ctx = await svc(c)
  const id = await cps.createCheckpoint(ctx, await readJson(c, checkpointCreateSchema))
  return ok(c, { id }, 201)
})
planningRoutes.patch('/checkpoints/:id', async (c) => ok(c, await cps.updateCheckpoint(await svc(c), idParam(c.req.param('id')), await readJson(c, checkpointUpdateSchema))))
planningRoutes.delete('/checkpoints/:id', async (c) => {
  await cps.deleteCheckpoint(await svc(c), idParam(c.req.param('id')))
  return ok(c, { deleted: true })
})
planningRoutes.post('/checkpoints/:id/restore', async (c) => {
  await cps.restoreCheckpoint(await svc(c), idParam(c.req.param('id')))
  return ok(c, { restored: true })
})
planningRoutes.post('/checkpoints/reorder', async (c) => {
  await cps.reorderCheckpoints(await svc(c), (await readJson(c, checkpointReorderSchema)).orderedIds)
  return ok(c, { reordered: true })
})
planningRoutes.get('/checkpoints/:id/impact', async (c) => {
  const target = parse(isoDateSchema, c.req.query('targetDate'))
  return ok(c, await cps.delayImpact(await svc(c), idParam(c.req.param('id')), target))
})

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

planningRoutes.get('/goals', async (c) => {
  const q = parse(z.object({ status: z.enum(['active', 'paused', 'completed', 'archived']).optional(), projectId: idSchema.optional() }), c.req.query())
  return ok(c, await goals.listGoals(await svc(c), q))
})
planningRoutes.post('/goals', async (c) => {
  const ctx = await svc(c)
  const id = await goals.createGoal(ctx, await readJson(c, goalCreateSchema))
  return ok(c, await goals.getGoalDetail(ctx, id), 201)
})
planningRoutes.get('/goals/:id', async (c) => ok(c, await goals.getGoalDetail(await svc(c), idParam(c.req.param('id')))))
planningRoutes.patch('/goals/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  await goals.updateGoal(ctx, id, await readJson(c, goalUpdateSchema))
  return ok(c, await goals.getGoalDetail(ctx, id))
})
planningRoutes.delete('/goals/:id', async (c) => {
  await goals.deleteGoal(await svc(c), idParam(c.req.param('id')))
  return ok(c, { deleted: true })
})
planningRoutes.post('/goals/:id/restore', async (c) => {
  await goals.restoreGoal(await svc(c), idParam(c.req.param('id')))
  return ok(c, { restored: true })
})

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

planningRoutes.get('/progress', async (c) => {
  const q = parse(z.object({ taskId: idSchema.optional(), goalId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), c.req.query())
  return ok(c, await goals.listProgress(await svc(c), q))
})
planningRoutes.post('/progress', async (c) => {
  const ctx = await svc(c)
  const id = await goals.addProgress(ctx, await readJson(c, progressCreateSchema))
  return ok(c, { id }, 201)
})
planningRoutes.delete('/progress/:id', async (c) => {
  await goals.deleteProgress(await svc(c), idParam(c.req.param('id')))
  return ok(c, { deleted: true })
})

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

planningRoutes.get('/tags', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db.select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color }).from(schema.tags).where(eq(schema.tags.ownerUuid, ctx.owner)).orderBy(asc(schema.tags.name))
  return ok(c, rows)
})
planningRoutes.post('/tags', async (c) => {
  const ctx = await svc(c)
  const input = await readJson(c, tagCreateSchema)
  const id = newId()
  const r = await ctx.db.insert(schema.tags).values({ id, ownerUuid: ctx.owner, name: input.name, color: input.color ?? null }).onConflictDoNothing().returning({ id: schema.tags.id })
  if (!r.length) throw new AppError('CONFLICT', 409, 'A tag with this name already exists')
  return ok(c, { id }, 201)
})
planningRoutes.delete('/tags/:id', async (c) => {
  const ctx = await svc(c)
  const r = await ctx.db.delete(schema.tags).where(and(eq(schema.tags.id, idParam(c.req.param('id'))), eq(schema.tags.ownerUuid, ctx.owner))).returning({ id: schema.tags.id })
  if (!r.length) throw notFound('Tag')
  return ok(c, { deleted: true })
})

// ---------------------------------------------------------------------------
// Source documents
// ---------------------------------------------------------------------------

planningRoutes.get('/sources', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db
    .select({ id: schema.sourceDocuments.id, title: schema.sourceDocuments.title, url: schema.sourceDocuments.url, sourceDate: schema.sourceDocuments.sourceDate, contentChars: schema.sourceDocuments.contentChars, contentDeletedAt: schema.sourceDocuments.contentDeletedAt, createdAt: schema.sourceDocuments.createdAt })
    .from(schema.sourceDocuments)
    .where(eq(schema.sourceDocuments.ownerUuid, ctx.owner))
    .orderBy(desc(schema.sourceDocuments.createdAt))
    .limit(200)
  return ok(c, rows)
})
planningRoutes.get('/sources/:id', async (c) => {
  const ctx = await svc(c)
  const s = await ctx.db.query.sourceDocuments.findFirst({ where: and(eq(schema.sourceDocuments.id, idParam(c.req.param('id'))), eq(schema.sourceDocuments.ownerUuid, ctx.owner)) })
  if (!s) throw notFound('Source')
  const linked = await ctx.db.select({ id: schema.tasks.id, title: schema.tasks.title, kind: schema.tasks.kind }).from(schema.tasks).where(and(eq(schema.tasks.sourceId, s.id), eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt)))
  const { ownerUuid: _o, ...rest } = s
  return ok(c, { ...rest, linked })
})
/** Delete only the stored original text; extracted records keep their link and metadata. */
planningRoutes.delete('/sources/:id/content', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const r = await ctx.db.update(schema.sourceDocuments).set({ content: null, contentDeletedAt: ctx.now }).where(and(eq(schema.sourceDocuments.id, id), eq(schema.sourceDocuments.ownerUuid, ctx.owner))).returning({ id: schema.sourceDocuments.id })
  if (!r.length) throw notFound('Source')
  await activity(ctx, 'source', id, 'content_deleted', null)
  return ok(c, { deleted: true })
})
planningRoutes.delete('/sources/:id', async (c) => {
  const ctx = await svc(c)
  const id = idParam(c.req.param('id'))
  const r = await ctx.db.delete(schema.sourceDocuments).where(and(eq(schema.sourceDocuments.id, id), eq(schema.sourceDocuments.ownerUuid, ctx.owner))).returning({ id: schema.sourceDocuments.id })
  if (!r.length) throw notFound('Source')
  await activity(ctx, 'source', id, 'deleted', null)
  return ok(c, { deleted: true })
})

// ---------------------------------------------------------------------------
// Global search (titles only)
// ---------------------------------------------------------------------------

planningRoutes.get('/search', async (c) => {
  const ctx = await svc(c)
  const q = parse(z.string().trim().min(1).max(100), c.req.query('q') ?? '').replace(/[%_]/g, '')
  const pat = `%${q}%`
  const [t, g, p] = await ctx.db.batch([
    ctx.db.select().from(schema.tasks).where(and(eq(schema.tasks.ownerUuid, ctx.owner), isNull(schema.tasks.deletedAt), or(like(schema.tasks.title, pat), like(schema.tasks.description, pat)))).orderBy(desc(schema.tasks.updatedAt)).limit(15),
    ctx.db.select({ id: schema.goals.id, title: schema.goals.title, status: schema.goals.status }).from(schema.goals).where(and(eq(schema.goals.ownerUuid, ctx.owner), isNull(schema.goals.deletedAt), like(schema.goals.title, pat))).limit(8),
    ctx.db.select({ id: schema.projects.id, name: schema.projects.name, color: schema.projects.color }).from(schema.projects).where(and(eq(schema.projects.ownerUuid, ctx.owner), isNull(schema.projects.deletedAt), like(schema.projects.name, pat))).limit(8),
  ])
  return ok(c, { tasks: t.map(serializeTask), goals: g, projects: p })
})
