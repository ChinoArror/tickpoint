import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { AppBindings } from '../env'
import { schema } from '../db/client'
import { AppError, ok, parse, readJson } from '../lib/http'
import { LIMITS } from '../../shared/constants'
import { checkQuota } from '../auth/authcenter'
import { bodyLimit } from '../middleware'
import {
  analyzeRequestSchema,
  extractConfirmSchema,
  extractRequestSchema,
  idSchema,
  planConfirmSchema,
  planDraftUpdateSchema,
  planRegenerateSchema,
  planRequestSchema,
} from '../../shared/schemas'
import { aiCtx, svc } from './context'
import * as ai from '../ai/service'

export const aiRoutes = new Hono<AppBindings>()
const idParam = (v: string) => parse(idSchema, v)

// Smart Capture -------------------------------------------------------------

aiRoutes.post('/extract', bodyLimit(256 * 1024), async (c) => {
  const input = await readJson(c, extractRequestSchema)
  return ok(c, await ai.extract(await aiCtx(c), input), 201)
})
aiRoutes.get('/extract/:id', async (c) => ok(c, await ai.getExtractionDraft(await svc(c), idParam(c.req.param('id')))))
aiRoutes.post('/extract/:id/confirm', async (c) => {
  const body = await readJson(c, extractConfirmSchema.omit({ draftId: true }))
  return ok(c, await ai.confirmExtraction(await svc(c), { ...body, draftId: idParam(c.req.param('id')) }), 201)
})
aiRoutes.post('/extract/:id/reject', async (c) => {
  await ai.rejectExtraction(await svc(c), idParam(c.req.param('id')))
  return ok(c, { rejected: true })
})

// Checkpoint planning ---------------------------------------------------------

aiRoutes.post('/checkpoints', async (c) => ok(c, await ai.generatePlan(await aiCtx(c), await readJson(c, planRequestSchema)), 201))
aiRoutes.get('/checkpoints/:id', async (c) => ok(c, await ai.getPlanDraft(await svc(c), idParam(c.req.param('id')))))
aiRoutes.put('/checkpoints/:id', async (c) =>
  ok(c, await ai.savePlanDraft(await svc(c), idParam(c.req.param('id')), (await readJson(c, planDraftUpdateSchema)).checkpoints)),
)
aiRoutes.post('/checkpoints/:id/regenerate', async (c) =>
  ok(c, await ai.regeneratePlan(await aiCtx(c), idParam(c.req.param('id')), await readJson(c, planRegenerateSchema))),
)
aiRoutes.post('/checkpoints/:id/confirm', async (c) =>
  ok(c, await ai.confirmPlan(await svc(c), idParam(c.req.param('id')), (await readJson(c, planConfirmSchema)).checkpoints), 201),
)
aiRoutes.delete('/checkpoints/:id', async (c) => {
  await ai.discardPlan(await svc(c), idParam(c.req.param('id')))
  return ok(c, { discarded: true })
})

// Analysis ----------------------------------------------------------------------

aiRoutes.post('/analyze', async (c) => ok(c, await ai.analyze(await aiCtx(c), await readJson(c, analyzeRequestSchema))))

// Usage -------------------------------------------------------------------------

/** Current AuthCenter agent limits for this user (RPM / RPD / tokens per day) plus local limits. */
aiRoutes.get('/quota', async (c) => {
  const ctx = await svc(c)
  const local = { requestsPerHour: LIMITS.aiRequestsPerHour, requestsPerDay: LIMITS.aiRequestsPerDay }
  if (c.env.APP_ENV === 'development' && ctx.owner.startsWith('dev-')) {
    return ok(c, { status: 'ok', unlimited: true, remainingTokens: null, remainingRequests: null, testSession: false, quota: null, local })
  }
  try {
    const q = await checkQuota(c.env, ctx.owner)
    return ok(c, { status: 'ok', ...q, local })
  } catch (e) {
    if (e instanceof AppError && ['QUOTA_EXCEEDED', 'AI_FORBIDDEN', 'QUOTA_CHECK_FAILED', 'NOT_CONFIGURED'].includes(e.code)) {
      return ok(c, { status: e.code, unlimited: false, remainingTokens: 0, remainingRequests: 0, testSession: false, quota: null, local, details: e.details ?? null })
    }
    throw e
  }
})

aiRoutes.get('/usage', async (c) => {
  const ctx = await svc(c)
  const since = ctx.now - 30 * 86_400_000
  const [totals, recent] = await ctx.db.batch([
    ctx.db
      .select({
        operation: schema.aiUsage.operation,
        requests: sql<number>`count(*)`,
        tokens: sql<number>`coalesce(sum(${schema.aiUsage.totalTokens}), 0)`,
        failures: sql<number>`sum(case when ${schema.aiUsage.status} != 'ok' then 1 else 0 end)`,
      })
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.ownerUuid, ctx.owner), gte(schema.aiUsage.createdAt, since)))
      .groupBy(schema.aiUsage.operation),
    ctx.db
      .select({ operation: schema.aiUsage.operation, model: schema.aiUsage.model, totalTokens: schema.aiUsage.totalTokens, status: schema.aiUsage.status, latencyMs: schema.aiUsage.latencyMs, createdAt: schema.aiUsage.createdAt })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.ownerUuid, ctx.owner))
      .orderBy(desc(schema.aiUsage.createdAt))
      .limit(20),
  ])
  return ok(c, { windowDays: 30, totals, recent, model: c.env.GEMINI_MODEL })
})
