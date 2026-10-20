// Terms of Service acceptance (recorded per user; the Android app also gates on it locally).

import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { AppError, ok, readJson } from '../lib/http'
import { TERMS_VERSION } from '../../shared/constants'
import { svc } from './context'

export const termsRoutes = new Hono<AppBindings>()

termsRoutes.put('/terms/acceptance', async (c) => {
  const ctx = await svc(c)
  const { version } = await readJson(c, z.object({ version: z.string().max(32) }))
  if (version !== TERMS_VERSION) throw new AppError('VALIDATION_ERROR', 400, 'Terms version is not the current one', [{ path: 'version', message: 'TERMS_VERSION_MISMATCH' }])
  await ctx.db.update(schema.userSettings).set({ termsVersion: version, termsAcceptedAt: ctx.now, updatedAt: ctx.now }).where(eq(schema.userSettings.userUuid, ctx.owner))
  return ok(c, { termsVersion: version, termsAcceptedAt: ctx.now })
})
