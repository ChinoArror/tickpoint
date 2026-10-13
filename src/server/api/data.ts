// Settings, export/import, backups, attachments and account data deletion.

import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, notFound, ok, parse, readJson } from '../lib/http'
import { bodyLimit, rateLimit } from '../middleware'
import { EXPORT_SCHEMA_VERSION, LIMITS } from '../../shared/constants'
import { idSchema, importModeSchema, settingsUpdateSchema } from '../../shared/schemas'
import { svc } from './context'
import { getOwnedTask } from '../services/common'
import { serializeSettings, updateSettings } from '../services/settings'
import { buildExport, buildProgressCsv, buildTasksCsv, commitImport, deleteAllData, parseImport, previewImport } from '../services/transfer'

export const dataRoutes = new Hono<AppBindings>()
const idParam = (v: string) => parse(idSchema, v)

// Settings --------------------------------------------------------------------

dataRoutes.get('/settings', async (c) => ok(c, serializeSettings((await svc(c)).settings)))
dataRoutes.patch('/settings', async (c) => {
  const ctx = await svc(c)
  return ok(c, await updateSettings(ctx.db, ctx.owner, await readJson(c, settingsUpdateSchema)))
})

// Export ------------------------------------------------------------------------

const stamp = () => new Date().toISOString().slice(0, 10)

dataRoutes.get('/export/json', rateLimit('export', 3600_000, 30), async (c) => {
  const ctx = await svc(c)
  const data = await buildExport(ctx, { includeSources: c.req.query('sources') !== '0' })
  c.header('Content-Disposition', `attachment; filename="tickpoint-export-${stamp()}.json"`)
  return c.json(data)
})

dataRoutes.get('/export/csv', rateLimit('export', 3600_000, 30), async (c) => {
  const ctx = await svc(c)
  const type = c.req.query('type') === 'progress' ? 'progress' : 'tasks'
  const csv = type === 'progress' ? await buildProgressCsv(ctx) : await buildTasksCsv(ctx)
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="tickpoint-${type}-${stamp()}.csv"`)
  return c.body(csv)
})

// Import --------------------------------------------------------------------------

dataRoutes.post('/import', bodyLimit(LIMITS.importMaxBytes), rateLimit('import', 3600_000, 20), async (c) => {
  const ctx = await svc(c)
  const mode = parse(importModeSchema, { mode: c.req.query('mode'), skipDuplicates: c.req.query('skipDuplicates') !== '0' })
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, 'The file is not valid JSON')
  }
  const file = parseImport(raw)
  if (mode.mode === 'preview') return ok(c, await previewImport(ctx, file))
  return ok(c, await commitImport(ctx, file, mode.skipDuplicates), 201)
})

// Backups (R2) ------------------------------------------------------------------------

dataRoutes.get('/backups', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db.select({ id: schema.backups.id, size: schema.backups.size, schemaVersion: schema.backups.schemaVersion, createdAt: schema.backups.createdAt }).from(schema.backups).where(eq(schema.backups.ownerUuid, ctx.owner)).orderBy(desc(schema.backups.createdAt)).limit(30)
  return ok(c, rows)
})

dataRoutes.post('/backups', rateLimit('backup', 3600_000, 10), async (c) => {
  const ctx = await svc(c)
  const data = JSON.stringify(await buildExport(ctx, { includeSources: true }))
  const id = newId()
  const key = `backups/${ctx.owner}/${id}.json`
  await c.env.FILES.put(key, data, { httpMetadata: { contentType: 'application/json' } })
  await ctx.db.insert(schema.backups).values({ id, ownerUuid: ctx.owner, r2Key: key, size: data.length, schemaVersion: EXPORT_SCHEMA_VERSION })
  // Keep the 10 most recent backups.
  const all = await ctx.db.select({ id: schema.backups.id, key: schema.backups.r2Key }).from(schema.backups).where(eq(schema.backups.ownerUuid, ctx.owner)).orderBy(desc(schema.backups.createdAt))
  for (const old of all.slice(10)) {
    await c.env.FILES.delete(old.key)
    await ctx.db.delete(schema.backups).where(eq(schema.backups.id, old.id))
  }
  return ok(c, { id, size: data.length }, 201)
})

async function ownedBackup(c: Parameters<typeof svc>[0], id: string) {
  const ctx = await svc(c)
  const b = await ctx.db.query.backups.findFirst({ where: and(eq(schema.backups.id, id), eq(schema.backups.ownerUuid, ctx.owner)) })
  if (!b) throw notFound('Backup')
  return { ctx, b }
}

dataRoutes.get('/backups/:id/download', async (c) => {
  const { b } = await ownedBackup(c, idParam(c.req.param('id')))
  const obj = await c.env.FILES.get(b.r2Key)
  if (!obj) throw notFound('Backup file')
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="tickpoint-backup-${new Date(b.createdAt).toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'private, no-store' },
  })
})

/** Restore merges the backup into current data (duplicates skipped), never deleting anything. */
dataRoutes.post('/backups/:id/restore', rateLimit('import', 3600_000, 20), async (c) => {
  const { ctx, b } = await ownedBackup(c, idParam(c.req.param('id')))
  const obj = await c.env.FILES.get(b.r2Key)
  if (!obj) throw notFound('Backup file')
  const file = parseImport(await obj.json())
  return ok(c, await commitImport(ctx, file, true))
})

dataRoutes.delete('/backups/:id', async (c) => {
  const { ctx, b } = await ownedBackup(c, idParam(c.req.param('id')))
  await c.env.FILES.delete(b.r2Key)
  await ctx.db.delete(schema.backups).where(eq(schema.backups.id, b.id))
  return ok(c, { deleted: true })
})

// Attachments (R2) ----------------------------------------------------------------------

const SAFE_TYPES = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|application\/zip|application\/vnd\.openxmlformats-officedocument\.[a-z.]+|application\/msword)$/

dataRoutes.post('/tasks/:id/attachments', bodyLimit(LIMITS.attachmentMaxBytes + 64 * 1024), async (c) => {
  const ctx = await svc(c)
  const task = await getOwnedTask(ctx, idParam(c.req.param('id')))
  const form = await c.req.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new AppError('VALIDATION_ERROR', 400, 'File is required')
  if (file.size > LIMITS.attachmentMaxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 413, 'File too large')
  const contentType = SAFE_TYPES.test(file.type) ? file.type : 'application/octet-stream'
  const id = newId()
  const key = `attachments/${ctx.owner}/${task.id}/${id}`
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType } })
  const filename = file.name.replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 200) || 'file'
  await ctx.db.insert(schema.attachments).values({ id, ownerUuid: ctx.owner, taskId: task.id, r2Key: key, filename, contentType, size: file.size })
  return ok(c, { id, filename, size: file.size, contentType }, 201)
})

dataRoutes.get('/attachments/:id', async (c) => {
  const ctx = await svc(c)
  const a = await ctx.db.query.attachments.findFirst({ where: and(eq(schema.attachments.id, idParam(c.req.param('id'))), eq(schema.attachments.ownerUuid, ctx.owner)) })
  if (!a) throw notFound('Attachment')
  const obj = await c.env.FILES.get(a.r2Key)
  if (!obj) throw notFound('Attachment file')
  return new Response(obj.body, {
    headers: {
      'Content-Type': a.contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
})

dataRoutes.delete('/attachments/:id', async (c) => {
  const ctx = await svc(c)
  const a = await ctx.db.query.attachments.findFirst({ where: and(eq(schema.attachments.id, idParam(c.req.param('id'))), eq(schema.attachments.ownerUuid, ctx.owner)) })
  if (!a) throw notFound('Attachment')
  await c.env.FILES.delete(a.r2Key)
  await ctx.db.delete(schema.attachments).where(eq(schema.attachments.id, a.id))
  return ok(c, { deleted: true })
})

// Account data ---------------------------------------------------------------------------

dataRoutes.delete('/account/data', rateLimit('delete-all', 3600_000, 3), async (c) => {
  const ctx = await svc(c)
  const { confirm } = await readJson(c, z.object({ confirm: z.literal('DELETE') }))
  void confirm
  await deleteAllData(ctx, c.env.FILES)
  return ok(c, { deleted: true })
})
