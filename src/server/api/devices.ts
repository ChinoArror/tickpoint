// Android push registrations (FCM). Tokens are write-only: responses never include them.

import { Hono } from 'hono'
import { and, desc, eq, ne } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { newId } from '../lib/crypto'
import { AppError, ok, parse, readJson } from '../lib/http'
import { deviceRegisterSchema, installationIdSchema } from '../../shared/schemas'
import { svc } from './context'

export const devicesRoutes = new Hono<AppBindings>()

/** Most devices kept per user; the least recently registered beyond this are removed. */
const MAX_DEVICES_PER_USER = 20

devicesRoutes.put('/devices', async (c) => {
  const ctx = await svc(c)
  const identity = c.get('identity')
  const input = await readJson(c, deviceRegisterSchema)
  const now = ctx.now
  const values = {
    ownerUuid: ctx.owner,
    installationId: input.installationId,
    platform: input.platform,
    fcmToken: input.fcmToken,
    sessionHash: identity.sessionHash,
    appVersion: input.appVersion ?? null,
    locale: input.locale ?? null,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.batch([
    // A token belongs to one installation: drop other rows holding it (reinstall, or another account).
    ctx.db.delete(schema.nativeDevices).where(and(eq(schema.nativeDevices.fcmToken, input.fcmToken), ne(schema.nativeDevices.installationId, input.installationId))),
    // The installation moves to the caller if it was registered under another account.
    ctx.db
      .insert(schema.nativeDevices)
      .values({ id: newId(), ...values })
      .onConflictDoUpdate({
        target: schema.nativeDevices.installationId,
        set: {
          ownerUuid: values.ownerUuid,
          fcmToken: values.fcmToken,
          sessionHash: values.sessionHash,
          appVersion: values.appVersion,
          locale: values.locale,
          platform: values.platform,
          failureCount: 0,
          updatedAt: now,
        },
      }),
  ])

  // Keep at most MAX_DEVICES_PER_USER rows for this user (oldest by update time are dropped).
  await c.env.DB.prepare(
    `DELETE FROM native_devices WHERE owner_uuid = ?1 AND id NOT IN (
       SELECT id FROM native_devices WHERE owner_uuid = ?1 ORDER BY updated_at DESC LIMIT ?2
     )`,
  )
    .bind(ctx.owner, MAX_DEVICES_PER_USER)
    .run()

  const row = await ctx.db.query.nativeDevices.findFirst({ where: eq(schema.nativeDevices.installationId, input.installationId), columns: { id: true, ownerUuid: true } })
  if (!row || row.ownerUuid !== ctx.owner) throw new AppError('CONFLICT', 409, 'Device registration was superseded')
  return ok(c, { id: row.id, installationId: input.installationId })
})

devicesRoutes.get('/devices', async (c) => {
  const ctx = await svc(c)
  const rows = await ctx.db
    .select({
      id: schema.nativeDevices.id,
      installationId: schema.nativeDevices.installationId,
      platform: schema.nativeDevices.platform,
      appVersion: schema.nativeDevices.appVersion,
      createdAt: schema.nativeDevices.createdAt,
      updatedAt: schema.nativeDevices.updatedAt,
      lastSuccessAt: schema.nativeDevices.lastSuccessAt,
    })
    .from(schema.nativeDevices)
    .where(eq(schema.nativeDevices.ownerUuid, ctx.owner))
    .orderBy(desc(schema.nativeDevices.updatedAt))
  return ok(c, rows)
})

devicesRoutes.delete('/devices/:installationId', async (c) => {
  const ctx = await svc(c)
  const installationId = parse(installationIdSchema, c.req.param('installationId'))
  // Scoped to the caller: another user's installation id matches nothing here.
  await ctx.db.delete(schema.nativeDevices).where(and(eq(schema.nativeDevices.installationId, installationId), eq(schema.nativeDevices.ownerUuid, ctx.owner)))
  return ok(c, { deleted: true })
})
