// AI orchestration. The AI produces drafts only; every write to official
// records happens in confirm* functions, which run on user-approved,
// re-validated payloads through the regular domain services.

import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import type { Env } from '../env'
import { parseJson, schema } from '../db/client'
import { newId, randomToken } from '../lib/crypto'
import { AppError, notFound } from '../lib/http'
import { hitRateLimit } from '../middleware'
import { checkQuota, consumeQuota } from '../auth/authcenter'
import { LIMITS, type Locale, type Priority } from '../../shared/constants'
import type { DraftCheckpoint, ExtractConfirmInput, ExtractRequest, planRequestSchema, planRegenerateSchema } from '../../shared/schemas'
import { assessDeadlineRisk } from '../../shared/insights'
import { isoDateInZone, startOfZonedDay } from '../../shared/time'
import { generateJson } from './providers/gemini'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './prompts/extraction'
import { CHECKPOINT_SYSTEM_PROMPT, buildPlanningUserPrompt, buildRegenerationUserPrompt, type PlanningContext } from './prompts/checkpoint-generation'
import { DEADLINE_ANALYSIS_SYSTEM_PROMPT, buildDeadlineAnalysisPrompt } from './prompts/deadline-analysis'
import { PROGRESS_ANALYSIS_SYSTEM_PROMPT, buildProgressAnalysisPrompt } from './prompts/progress-analysis'
import { extractionJsonSchema, extractionResultSchema } from './schemas/extraction'
import { analysisJsonSchema, analysisResultSchema, planJsonSchema, planResultSchema, regenerateJsonSchema, regenerateResultSchema } from './schemas/planning'
import { checkPlan, postProcessExtraction, toDraftCheckpoints, type ExtractionDraft, type Feasibility } from './postprocess'
import { activity, getOwnedGoal, getOwnedTask, type ServiceCtx } from '../services/common'
import { createTask, getTaskDetail } from '../services/tasks'
import { createGoal, getGoalDetail } from '../services/goals'
import { createCheckpoint } from '../services/checkpoints'
import { syncTargetReminders } from '../reminders/schedule'

export interface AiCtx extends ServiceCtx {
  env: Env
  locale: Locale
  aiEnabled: boolean
  planningStyle: string
  waitUntil: (p: Promise<unknown>) => void
}

type Operation = 'extract' | 'plan' | 'regenerate' | 'analyze'

/** Availability, local rate limits and AuthCenter agent quota, checked before every AI call. */
async function guard(ctx: AiCtx) {
  if (!ctx.aiEnabled) throw new AppError('AI_DISABLED', 403, 'AI features are turned off in your settings')
  if (!ctx.env.GEMINI_API_KEY) throw new AppError('NOT_CONFIGURED', 503, 'AI is not configured on this server')
  const hour = await hitRateLimit(ctx.env.DB, `ai:h:${ctx.owner}`, 3600_000, LIMITS.aiRequestsPerHour)
  const day = await hitRateLimit(ctx.env.DB, `ai:d:${ctx.owner}`, 86_400_000, LIMITS.aiRequestsPerDay)
  if (!hour.allowed || !day.allowed) throw new AppError('RATE_LIMITED', 429, 'AI request limit reached. Please try again later.')
  // Local dev-bypass identities do not exist in AuthCenter, so its agent quota cannot apply to them.
  const devIdentity = ctx.env.APP_ENV === 'development' && ctx.owner.startsWith('dev-')
  if (!devIdentity) await checkQuota(ctx.env, ctx.owner)
}

async function run<S extends z.ZodType>(
  ctx: AiCtx,
  op: Operation,
  args: { system: string; user: string; jsonSchema: unknown; schema: S; maxOutputTokens?: number },
) {
  await guard(ctx)
  const started = Date.now()
  const model = ctx.env.GEMINI_MODEL
  try {
    const r = await generateJson({ apiKey: ctx.env.GEMINI_API_KEY!, model, ...args, timeoutMs: 75_000 })
    await recordUsage(ctx, op, model, r.usage, 'ok', started)
    return r
  } catch (e) {
    const status = e instanceof AppError ? (e.code === 'AI_INVALID_OUTPUT' ? 'invalid_output' : e.code === 'AI_TIMEOUT' ? 'timeout' : 'error') : 'error'
    const spent = (e instanceof AppError && (e.details as { usage?: { inputTokens: number; outputTokens: number; totalTokens: number } } | undefined)?.usage) || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    await recordUsage(ctx, op, model, spent, status, started)
    if (e instanceof AppError && e.code === 'AI_INVALID_OUTPUT') throw new AppError(e.code, e.status, e.message)
    throw e
  }
}

async function recordUsage(
  ctx: AiCtx,
  op: Operation,
  model: string,
  u: { inputTokens: number; outputTokens: number; totalTokens: number },
  status: string,
  started: number,
) {
  await ctx.db.insert(schema.aiUsage).values({
    id: newId(),
    ownerUuid: ctx.owner,
    operation: op,
    model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    totalTokens: u.totalTokens,
    status,
    latencyMs: Date.now() - started,
  })
  if (u.totalTokens > 0) ctx.waitUntil(consumeQuota(ctx.env, ctx.owner, u.totalTokens))
}

// ---------------------------------------------------------------------------
// Smart Capture extraction
// ---------------------------------------------------------------------------

export interface ExtractionMeta {
  sourceTitle: string | null
  sourceUrl: string | null
  sourceDate: string | null
  context: string | null
  projectId: string | null
  timeZone: string
}

export async function extract(ctx: AiCtx, input: ExtractRequest) {
  const tz = input.timeZone ?? ctx.timeZone
  const boundary = randomToken(12)
  const r = await run(ctx, 'extract', {
    system: EXTRACTION_SYSTEM_PROMPT,
    user: buildExtractionUserPrompt({
      text: input.text,
      boundary,
      locale: ctx.locale,
      now: ctx.now,
      timeZone: tz,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      sourceDate: input.sourceDate,
      context: input.context,
    }),
    jsonSchema: extractionJsonSchema,
    schema: extractionResultSchema,
    maxOutputTokens: 16_384,
  })
  const draft = postProcessExtraction(r.data, input.text)
  const meta: ExtractionMeta = {
    sourceTitle: input.sourceTitle ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceDate: input.sourceDate ?? null,
    context: input.context ?? null,
    projectId: input.projectId ?? null,
    timeZone: tz,
  }
  const id = newId()
  await ctx.db.insert(schema.aiExtractionDrafts).values({
    id,
    ownerUuid: ctx.owner,
    status: 'pending',
    resultJson: JSON.stringify({ meta, result: draft }),
    sourceText: input.text,
    locale: ctx.locale,
    model: r.model,
    totalTokens: r.usage.totalTokens,
  })
  return { draftId: id, result: draft, meta, model: r.model, usage: r.usage }
}

async function ownedPendingExtraction(ctx: ServiceCtx, id: string) {
  const d = await ctx.db.query.aiExtractionDrafts.findFirst({
    where: and(eq(schema.aiExtractionDrafts.id, id), eq(schema.aiExtractionDrafts.ownerUuid, ctx.owner)),
  })
  if (!d) throw notFound('Draft')
  if (d.status !== 'pending') throw new AppError('CONFLICT', 409, 'This draft was already confirmed or rejected')
  return d
}

export async function getExtractionDraft(ctx: ServiceCtx, id: string) {
  const d = await ctx.db.query.aiExtractionDrafts.findFirst({
    where: and(eq(schema.aiExtractionDrafts.id, id), eq(schema.aiExtractionDrafts.ownerUuid, ctx.owner)),
  })
  if (!d) throw notFound('Draft')
  const parsed = parseJson<{ meta: ExtractionMeta; result: ExtractionDraft }>(d.resultJson, null as never)
  return {
    draftId: d.id,
    status: d.status,
    sourceText: d.sourceText,
    model: d.model,
    createdAt: d.createdAt,
    primaryTaskId: d.confirmedTaskId,
    primaryGoalId: d.confirmedGoalId,
    ...parsed,
  }
}

export async function rejectExtraction(ctx: ServiceCtx, id: string) {
  await ownedPendingExtraction(ctx, id)
  await ctx.db.batch([
    ctx.db
      .update(schema.aiExtractionDrafts)
      .set({ status: 'rejected', sourceText: null, updatedAt: ctx.now })
      .where(eq(schema.aiExtractionDrafts.id, id)),
    activity(ctx, 'ai_draft', id, 'rejected', null),
  ])
}

/**
 * Commit a user-approved extraction. The payload is the user's edited version
 * (validated by extractConfirmSchema), not the raw AI output.
 */
export async function confirmExtraction(ctx: ServiceCtx, input: ExtractConfirmInput) {
  const draft = await ownedPendingExtraction(ctx, input.draftId)
  const { meta } = parseJson<{ meta: ExtractionMeta }>(draft.resultJson, { meta: {} as ExtractionMeta })
  const p = input.primary

  let sourceId: string | null = null
  if (input.saveSource && draft.sourceText) {
    sourceId = newId()
    await ctx.db.insert(schema.sourceDocuments).values({
      id: sourceId,
      ownerUuid: ctx.owner,
      title: meta.sourceTitle ?? p.title,
      url: meta.sourceUrl,
      sourceDate: meta.sourceDate,
      context: meta.context,
      content: draft.sourceText,
      contentChars: draft.sourceText.length,
      language: (parseJson<{ result?: { sourceLanguage?: string } }>(draft.resultJson, {}).result?.sourceLanguage ?? null),
    })
  }

  const created: { tasks: string[]; goals: string[]; checkpoints: string[] } = { tasks: [], goals: [], checkpoints: [] }
  let primaryTaskId: string | null = null
  let primaryGoalId: string | null = null

  if (p.kind === 'goal') {
    primaryGoalId = await createGoal(
      ctx,
      {
        title: p.title,
        description: [p.description, p.notes].filter(Boolean).join('\n\n') || null,
        projectId: p.projectId,
        targetDate: p.due?.date ?? null,
        progressModel: input.checkpoints.length ? 'checkpoint' : 'percentage',
        currentValue: 0,
        reviewFrequency: 'weekly',
        status: 'active',
      },
      'ai_confirmed',
    )
    created.goals.push(primaryGoalId)
  } else {
    primaryTaskId = await createTask(
      ctx,
      {
        kind: p.kind === 'deadline' ? 'deadline' : 'task',
        title: p.title,
        description: p.description,
        notes: p.notes,
        projectId: p.projectId,
        status: 'not_started',
        priority: p.priority,
        due: p.due ?? null,
        estimatedMinutes: p.estimatedMinutes,
        progressPercent: 0,
        progressMode: input.checkpoints.length ? 'checkpoints' : 'manual',
        location: p.location,
        submission: p.submission,
        deliverables: p.deliverables,
        requirements: p.requirements,
        rewards: p.rewards,
        tagIds: [],
        reminderOffsets: p.due && p.due.precision !== 'unknown' ? input.reminderOffsets : [],
        sourceId,
      },
      'ai_confirmed',
    )
    created.tasks.push(primaryTaskId)
  }

  for (const d of input.additionalDeadlines) {
    if (d.createAs === 'skip') continue
    if (d.createAs === 'deadline') {
      const id = await createTask(
        ctx,
        {
          kind: 'deadline',
          title: d.label,
          description: d.evidence ? `> ${d.evidence}` : null,
          projectId: p.projectId,
          status: 'not_started',
          priority: p.priority,
          due: d.due,
          progressPercent: 0,
          progressMode: 'manual',
          deliverables: [],
          requirements: [],
          rewards: [],
          tagIds: [],
          reminderOffsets: d.due.precision !== 'unknown' ? input.reminderOffsets : [],
          sourceId,
        },
        'ai_confirmed',
      )
      created.tasks.push(id)
    } else {
      const id = await createCheckpoint(
        ctx,
        {
          taskId: primaryTaskId,
          goalId: primaryGoalId,
          title: d.label,
          description: d.evidence ? `> ${d.evidence}` : null,
          targetDate: d.due.date ?? null,
          weight: 1,
          priority: 'none',
          status: 'pending',
          dependsOnIds: [],
        },
        'ai_confirmed',
      )
      created.checkpoints.push(id)
    }
  }

  for (const c of input.checkpoints) {
    const id = await createCheckpoint(
      ctx,
      {
        taskId: primaryTaskId,
        goalId: primaryGoalId,
        title: c.title,
        description: c.description,
        completionCriteria: c.completionCriteria,
        targetDate: c.targetDate,
        estimatedMinutes: c.estimatedMinutes,
        weight: 1,
        priority: 'none',
        status: 'pending',
        dependsOnIds: [],
      },
      'ai_confirmed',
    )
    created.checkpoints.push(id)
  }

  await ctx.db.batch([
    ctx.db
      .update(schema.aiExtractionDrafts)
      .set({
        status: 'confirmed',
        sourceId,
        sourceText: null,
        confirmedTaskId: primaryTaskId,
        confirmedGoalId: primaryGoalId,
        confirmedAt: ctx.now,
        updatedAt: ctx.now,
      })
      .where(eq(schema.aiExtractionDrafts.id, draft.id)),
    activity(ctx, 'ai_draft', draft.id, 'confirmed', { created, sourceSaved: Boolean(sourceId) }, 'ai_confirmed'),
  ])
  return { primaryTaskId, primaryGoalId, sourceId, created }
}

// ---------------------------------------------------------------------------
// Checkpoint planning
// ---------------------------------------------------------------------------

type PlanRequest = z.infer<typeof planRequestSchema>
type RegenerateRequest = z.infer<typeof planRegenerateSchema>

async function buildPlanningContext(ctx: AiCtx, req: PlanRequest): Promise<{ pc: PlanningContext; deadlineDate: string | null }> {
  const hoursPerDay = req.hoursPerDay ?? ctx.hoursPerDay
  if (req.taskId) {
    const t = await getTaskDetail(ctx, req.taskId)
    const deadline =
      t.due.precision === 'exact' ? `${t.due.date} ${t.due.time} (${t.due.timeZone})` : t.due.date ? `${t.due.date} (${t.due.precision})` : null
    return {
      deadlineDate: t.due.date,
      pc: {
        objectiveTitle: t.title,
        objectiveDescription: [req.objective, t.description].filter(Boolean).join('\n\n').slice(0, 4000) || null,
        kind: t.kind === 'deadline' ? 'deadline' : 'task',
        deadline,
        deadlinePrecision: t.due.precision,
        startDate: t.startDate,
        progressPercent: t.progressPercent,
        requirements: t.requirements.map((r) => `[${r.type}] ${r.text}`).slice(0, 40),
        deliverables: t.deliverables.slice(0, 40),
        existingCheckpoints: t.checkpoints.map((c, i) => ({ ref: `e${i + 1}`, title: c.title, targetDate: c.targetDate, status: c.status })),
        completedWork: t.subtasks.filter((s) => s.status === 'completed').map((s) => s.title).slice(0, 30),
        hoursPerDay,
        planningStyle: ctx.planningStyle,
        preferences: req.preferences ?? null,
        maxCheckpoints: req.maxCheckpoints,
      },
    }
  }
  if (req.goalId) {
    const g = await getGoalDetail(ctx, req.goalId)
    return {
      deadlineDate: g.targetDate,
      pc: {
        objectiveTitle: g.title,
        objectiveDescription: [req.objective, g.description, g.successCriteria ? `Success criteria: ${g.successCriteria}` : null].filter(Boolean).join('\n\n').slice(0, 4000) || null,
        kind: 'goal',
        deadline: g.targetDate,
        deadlinePrecision: g.targetDate ? 'date' : 'unknown',
        startDate: null,
        progressPercent: Math.round(g.health.actual * 100),
        requirements: [],
        deliverables: [],
        existingCheckpoints: g.checkpoints.map((c, i) => ({ ref: `e${i + 1}`, title: c.title, targetDate: c.targetDate, status: c.status })),
        completedWork: g.progress.filter((p) => p.note).map((p) => p.note!).slice(0, 15),
        hoursPerDay: g.weeklyEffortMinutes ? Math.max(0.5, g.weeklyEffortMinutes / 60 / 7) : hoursPerDay,
        planningStyle: ctx.planningStyle,
        preferences: req.preferences ?? null,
        maxCheckpoints: req.maxCheckpoints,
      },
    }
  }
  throw new AppError('VALIDATION_ERROR', 400, 'taskId or goalId is required')
}

export async function generatePlan(ctx: AiCtx, req: PlanRequest) {
  if (!req.taskId === !req.goalId) throw new AppError('VALIDATION_ERROR', 400, 'Provide exactly one of taskId or goalId')
  const { pc, deadlineDate } = await buildPlanningContext(ctx, req)
  const boundary = randomToken(12)
  const r = await run(ctx, 'plan', {
    system: CHECKPOINT_SYSTEM_PROMPT,
    user: buildPlanningUserPrompt(pc, { boundary, locale: ctx.locale, now: ctx.now, timeZone: ctx.timeZone }),
    jsonSchema: planJsonSchema,
    schema: planResultSchema,
  })
  const today = isoDateInZone(ctx.now, ctx.timeZone)
  const checked = checkPlan(toDraftCheckpoints(r.data.checkpoints), { today, deadlineDate, hoursPerDay: pc.hoursPerDay, ai: r.data.feasibility })
  const id = newId()
  await ctx.db.insert(schema.aiPlanningDrafts).values({
    id,
    ownerUuid: ctx.owner,
    taskId: req.taskId ?? null,
    goalId: req.goalId ?? null,
    status: 'pending',
    checkpointsJson: JSON.stringify(checked.items),
    feasibilityJson: JSON.stringify(checked.feasibility),
    inputJson: JSON.stringify({ ...req, deadlineDate, hoursPerDay: pc.hoursPerDay, objectiveTitle: pc.objectiveTitle }),
    locale: ctx.locale,
    model: r.model,
    totalTokens: r.usage.totalTokens,
  })
  return { draftId: id, checkpoints: checked.items, feasibility: checked.feasibility, model: r.model }
}

async function ownedPendingPlan(ctx: ServiceCtx, id: string) {
  const d = await ctx.db.query.aiPlanningDrafts.findFirst({
    where: and(eq(schema.aiPlanningDrafts.id, id), eq(schema.aiPlanningDrafts.ownerUuid, ctx.owner)),
  })
  if (!d) throw notFound('Plan draft')
  if (d.status !== 'pending') throw new AppError('CONFLICT', 409, 'This plan was already confirmed or discarded')
  return d
}

export async function getPlanDraft(ctx: ServiceCtx, id: string) {
  const d = await ctx.db.query.aiPlanningDrafts.findFirst({
    where: and(eq(schema.aiPlanningDrafts.id, id), eq(schema.aiPlanningDrafts.ownerUuid, ctx.owner)),
  })
  if (!d) throw notFound('Plan draft')
  return {
    draftId: d.id,
    status: d.status,
    taskId: d.taskId,
    goalId: d.goalId,
    checkpoints: parseJson<DraftCheckpoint[]>(d.checkpointsJson, []),
    feasibility: parseJson<Feasibility | null>(d.feasibilityJson, null),
    model: d.model,
    createdAt: d.createdAt,
  }
}

/** Save the user's edits so later regeneration preserves them. Re-runs deterministic checks. */
export async function savePlanDraft(ctx: ServiceCtx, id: string, items: DraftCheckpoint[]) {
  const d = await ownedPendingPlan(ctx, id)
  const input = parseJson<{ deadlineDate: string | null; hoursPerDay: number }>(d.inputJson, { deadlineDate: null, hoursPerDay: ctx.hoursPerDay })
  const prev = parseJson<Feasibility | null>(d.feasibilityJson, null)
  const checked = checkPlan(items, {
    today: isoDateInZone(ctx.now, ctx.timeZone),
    deadlineDate: input.deadlineDate,
    hoursPerDay: input.hoursPerDay,
    ai: prev ? { feasible: prev.aiFeasible ?? true, summary: prev.summary ?? '', conflicts: prev.conflicts, totalEstimatedMinutes: prev.totalEstimatedMinutes } : null,
  })
  await ctx.db
    .update(schema.aiPlanningDrafts)
    .set({ checkpointsJson: JSON.stringify(checked.items), feasibilityJson: JSON.stringify(checked.feasibility), updatedAt: ctx.now })
    .where(eq(schema.aiPlanningDrafts.id, id))
  return { draftId: id, checkpoints: checked.items, feasibility: checked.feasibility }
}

export async function regeneratePlan(ctx: AiCtx, id: string, req: RegenerateRequest) {
  const d = await ownedPendingPlan(ctx, id)
  const items = parseJson<DraftCheckpoint[]>(d.checkpointsJson, [])
  const input = parseJson<{ deadlineDate: string | null; hoursPerDay: number; objectiveTitle: string }>(d.inputJson, {
    deadlineDate: null,
    hoursPerDay: ctx.hoursPerDay,
    objectiveTitle: '',
  })
  const targets = new Set(req.checkpointIds)
  const unknown = req.checkpointIds.filter((cid) => !items.some((i) => i.clientId === cid))
  if (unknown.length) throw new AppError('VALIDATION_ERROR', 400, 'Unknown checkpoint ids', unknown)
  const edited = items.filter((i) => targets.has(i.clientId) && (i.edited || i.origin === 'user')).map((i) => i.clientId)
  if (edited.length && !req.overwriteEdited) {
    throw new AppError('EDITED_CHECKPOINTS', 409, 'Some selected checkpoints were edited manually. Confirm to overwrite them.', edited)
  }

  const boundary = randomToken(12)
  const r = await run(ctx, 'regenerate', {
    system: CHECKPOINT_SYSTEM_PROMPT,
    user: buildRegenerationUserPrompt(
      { boundary, locale: ctx.locale, now: ctx.now, timeZone: ctx.timeZone, deadline: input.deadlineDate, hoursPerDay: input.hoursPerDay, instructions: req.instructions ?? null },
      items.map((i) => ({ ref: i.clientId, title: i.title, targetDate: i.targetDate ?? null, estimatedMinutes: i.estimatedMinutes ?? null, dependsOn: i.dependsOn, regenerate: targets.has(i.clientId) })),
      input.objectiveTitle,
    ),
    jsonSchema: regenerateJsonSchema,
    schema: regenerateResultSchema,
  })

  // Merge: replace targets in place, keep everything else verbatim.
  const fresh = toDraftCheckpoints(r.data.checkpoints)
  const existingIds = new Set(items.map((i) => i.clientId))
  const byRef = new Map(fresh.map((f) => [f.clientId, f]))
  const merged: DraftCheckpoint[] = []
  let insertedNew = false
  // Items with unseen refs are additions; items reusing a non-target ref are ignored (fixed items stay verbatim).
  const newOnes = fresh.filter((f) => !existingIds.has(f.clientId))
  for (const it of items) {
    if (!targets.has(it.clientId)) {
      merged.push(it)
      continue
    }
    const rep = byRef.get(it.clientId)
    if (rep) merged.push({ ...rep, origin: 'ai', edited: false })
    if (!insertedNew) {
      merged.push(...newOnes)
      insertedNew = true
    }
  }
  const checked = checkPlan(merged, {
    today: isoDateInZone(ctx.now, ctx.timeZone),
    deadlineDate: input.deadlineDate,
    hoursPerDay: input.hoursPerDay,
  })
  await ctx.db
    .update(schema.aiPlanningDrafts)
    .set({ checkpointsJson: JSON.stringify(checked.items), feasibilityJson: JSON.stringify(checked.feasibility), updatedAt: ctx.now, totalTokens: d.totalTokens + r.usage.totalTokens })
    .where(eq(schema.aiPlanningDrafts.id, id))
  return { draftId: id, checkpoints: checked.items, feasibility: checked.feasibility, notes: r.data.notes, regenerated: [...targets] }
}

export async function discardPlan(ctx: ServiceCtx, id: string) {
  await ownedPendingPlan(ctx, id)
  await ctx.db.update(schema.aiPlanningDrafts).set({ status: 'rejected', updatedAt: ctx.now }).where(eq(schema.aiPlanningDrafts.id, id))
}

/** Commit the approved plan as official checkpoints (deps mapped from draft ids to real ids). */
export async function confirmPlan(ctx: ServiceCtx, id: string, items: DraftCheckpoint[]) {
  const d = await ownedPendingPlan(ctx, id)
  if (d.taskId) await getOwnedTask(ctx, d.taskId)
  if (d.goalId) await getOwnedGoal(ctx, d.goalId)
  const input = parseJson<{ deadlineDate: string | null; hoursPerDay: number }>(d.inputJson, { deadlineDate: null, hoursPerDay: ctx.hoursPerDay })
  const checked = checkPlan(items, { today: isoDateInZone(ctx.now, ctx.timeZone), deadlineDate: input.deadlineDate, hoursPerDay: input.hoursPerDay })

  const idMap = new Map<string, string>()
  for (const it of checked.items) {
    const deps = it.dependsOn.map((x) => idMap.get(x)).filter((x): x is string => Boolean(x))
    const cid = await createCheckpoint(
      ctx,
      {
        taskId: d.taskId,
        goalId: d.goalId,
        title: it.title,
        description: it.description ?? null,
        completionCriteria: it.completionCriteria,
        startDate: it.startDate,
        targetDate: it.targetDate,
        estimatedMinutes: it.estimatedMinutes,
        weight: 1,
        priority: it.priority as Priority,
        status: 'pending',
        dependsOnIds: deps,
      },
      'ai_confirmed',
    )
    idMap.set(it.clientId, cid)
  }
  // Second pass for forward references (a checkpoint depending on a later one).
  const forward = checked.items.flatMap((it) => it.dependsOn.filter((x) => checked.items.findIndex((o) => o.clientId === x) > checked.items.indexOf(it)).map((x) => ({ from: idMap.get(it.clientId)!, to: idMap.get(x)! })))
  if (forward.length) {
    await ctx.db.batch(forward.map((e) => ctx.db.insert(schema.checkpointDependencies).values({ ownerUuid: ctx.owner, checkpointId: e.from, dependsOnId: e.to }).onConflictDoNothing()) as [any, ...any[]])
  }
  // Reminder suggestions are only created for items where the user kept an offset in the approved payload.
  const reminderStmts = checked.items
    .filter((it) => it.reminderOffsetMinutes != null && it.targetDate)
    .map((it) => ctx.db.insert(schema.reminderRules).values({ id: newId(), ownerUuid: ctx.owner, checkpointId: idMap.get(it.clientId)!, kind: 'offset', offsetMinutes: it.reminderOffsetMinutes!, channels: '["in_app","push","email"]' }))
  if (reminderStmts.length) await ctx.db.batch(reminderStmts as [any, ...any[]])
  for (const it of checked.items) if (it.reminderOffsetMinutes != null && it.targetDate) await syncTargetReminders(ctx.db, ctx.owner, { checkpointId: idMap.get(it.clientId)! }, ctx.timeZone)

  if (d.taskId) {
    const t = await ctx.db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, d.taskId), isNull(schema.tasks.deletedAt)) })
    if (t && t.progressMode === 'manual' && t.progressPercent === 0) {
      await ctx.db.update(schema.tasks).set({ progressMode: 'checkpoints', updatedAt: ctx.now }).where(eq(schema.tasks.id, d.taskId))
    }
  }
  await ctx.db.batch([
    ctx.db.update(schema.aiPlanningDrafts).set({ status: 'confirmed', checkpointsJson: JSON.stringify(checked.items), confirmedAt: ctx.now, updatedAt: ctx.now }).where(eq(schema.aiPlanningDrafts.id, id)),
    activity(ctx, d.taskId ? 'task' : 'goal', (d.taskId ?? d.goalId)!, 'ai_plan_confirmed', { draftId: id, checkpoints: checked.items.length }, 'ai_confirmed'),
  ])
  return { created: [...idMap.values()] }
}

// ---------------------------------------------------------------------------
// Analysis (narrative over deterministic metrics; never mutates)
// ---------------------------------------------------------------------------

export async function analyze(ctx: AiCtx, req: { taskId?: string | null; goalId?: string | null }) {
  const boundary = randomToken(12)
  if (req.taskId) {
    const t = await getTaskDetail(ctx, req.taskId)
    const risk = assessDeadlineRisk({
      now: ctx.now,
      status: t.status,
      dueSortAt: t.due.sortAt,
      startAt: t.startDate ? startOfZonedDay(t.startDate, t.due.timeZone || ctx.timeZone) : t.createdAt,
      progressPercent: t.progressPercent,
      estimatedMinutes: t.estimatedMinutes,
      hoursPerDay: ctx.hoursPerDay,
      openBlockingDependencies: t.counts.openDependencies,
      delayedCheckpoints: t.checkpoints.filter((c) => c.status === 'pending' && c.targetDate && c.targetDate < isoDateInZone(ctx.now, ctx.timeZone)).length,
      pendingCheckpoints: t.checkpoints.filter((c) => c.status === 'pending').length,
    })
    const metrics = { risk, progressPercent: t.progressPercent, estimatedMinutes: t.estimatedMinutes, actualMinutes: t.actualMinutes }
    const r = await run(ctx, 'analyze', {
      system: DEADLINE_ANALYSIS_SYSTEM_PROMPT,
      user: buildDeadlineAnalysisPrompt(
        {
          title: t.title,
          due: t.due,
          status: t.status,
          metrics,
          checkpoints: t.checkpoints.map((c) => ({ title: c.title, targetDate: c.targetDate, status: c.status, estimatedMinutes: c.estimatedMinutes })),
          blockedBy: t.dependencies.filter((d) => d.status !== 'completed').map((d) => d.title),
        },
        { boundary, locale: ctx.locale, now: ctx.now, timeZone: ctx.timeZone },
      ),
      jsonSchema: analysisJsonSchema,
      schema: analysisResultSchema,
      maxOutputTokens: 4096,
    })
    return { kind: 'deadline' as const, metrics, analysis: r.data, aiGenerated: true, model: r.model }
  }
  if (req.goalId) {
    const g = await getGoalDetail(ctx, req.goalId)
    const r = await run(ctx, 'analyze', {
      system: PROGRESS_ANALYSIS_SYSTEM_PROMPT,
      user: buildProgressAnalysisPrompt(
        {
          title: g.title,
          model: g.progressModel,
          currentValue: g.currentValue,
          targetValue: g.targetValue,
          unit: g.unit,
          targetDate: g.targetDate,
          weeklyEffortMinutes: g.weeklyEffortMinutes,
          reviewFrequency: g.reviewFrequency,
          health: g.health,
          recentNotes: g.progress.filter((p) => p.note).slice(0, 10).map((p) => ({ at: new Date(p.occurredAt).toISOString().slice(0, 10), note: p.note })),
        },
        { boundary, locale: ctx.locale, now: ctx.now, timeZone: ctx.timeZone },
      ),
      jsonSchema: analysisJsonSchema,
      schema: analysisResultSchema,
      maxOutputTokens: 4096,
    })
    return { kind: 'progress' as const, metrics: g.health, analysis: r.data, aiGenerated: true, model: r.model }
  }
  throw new AppError('VALIDATION_ERROR', 400, 'taskId or goalId is required')
}
