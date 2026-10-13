// Deterministic validation applied to AI output before the user sees it.
// AI output is advisory: anything we cannot verify is flagged, never promoted.

import { isoDateSchema, timeSchema, timeZoneSchema, type DraftCheckpoint } from '../../shared/schemas'
import { diffInCalendarDays } from '../../shared/time'
import type { ExtractionResult } from './schemas/extraction'
import type { PlanResult } from './schemas/planning'
import { hasCycle } from '../services/checkpoints'

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

/** True when the quoted evidence actually occurs in the source (whitespace/width-insensitive). */
export function evidenceInSource(evidence: string | null | undefined, sourceNorm: string): boolean {
  if (!evidence) return false
  const e = norm(evidence).replace(/^["'“”「『]+|["'“”」』.…]+$/g, '')
  if (e.length < 2) return false
  if (sourceNorm.includes(e)) return true
  // Allow elided quotes ("A ... B"): every fragment must appear in order.
  const parts = e.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length >= 3)
  if (parts.length < 2) return false
  let from = 0
  for (const p of parts) {
    const i = sourceNorm.indexOf(p, from)
    if (i < 0) return false
    from = i + p.length
  }
  return true
}

const valid = <T>(schema: { safeParse(v: unknown): { success: boolean } }, v: T | null): v is T => v != null && schema.safeParse(v).success

export interface ExtractionDraft extends Omit<ExtractionResult, 'deadlines' | 'locations' | 'deliverables' | 'requirements' | 'rewards' | 'ambiguities'> {
  deadlines: (ExtractionResult['deadlines'][number] & { id: string; evidenceVerified: boolean; issues: string[] })[]
  locations: (ExtractionResult['locations'][number] & { id: string; evidenceVerified: boolean })[]
  deliverables: (ExtractionResult['deliverables'][number] & { id: string; evidenceVerified: boolean })[]
  requirements: (ExtractionResult['requirements'][number] & { id: string; evidenceVerified: boolean })[]
  rewards: (ExtractionResult['rewards'][number] & { id: string; evidenceVerified: boolean })[]
  ambiguities: (ExtractionResult['ambiguities'][number] & { id: string })[]
  submissionEvidenceVerified: boolean
}

export function postProcessExtraction(r: ExtractionResult, source: string): ExtractionDraft {
  const src = norm(source)
  const ambiguities = r.ambiguities.map((a, i) => ({ ...a, id: `a${i + 1}` }))
  let n = ambiguities.length

  const deadlines = r.deadlines.map((d, i) => {
    const issues: string[] = []
    let { date, time, timezone, precision } = d
    if (date && !valid(isoDateSchema, date)) {
      issues.push('invalid_date')
      date = null
    }
    if (time && !valid(timeSchema, time)) {
      issues.push('invalid_time')
      time = null
    }
    if (timezone && !valid(timeZoneSchema, timezone)) {
      issues.push('invalid_timezone')
      timezone = null
    }
    // Precision must match what is actually present; never upgrade, only downgrade.
    if (precision === 'exact' && (!date || !time)) precision = date ? 'date' : 'unknown'
    if ((precision === 'date' || precision === 'approximate') && !date) precision = 'unknown'
    if (precision !== 'exact') time = null
    if (precision === 'exact' && !timezone) {
      issues.push('timezone_missing')
      if (!ambiguities.some((a) => a.kind === 'timezone_missing' && a.field.includes(String(i)))) {
        ambiguities.push({ id: `a${++n}`, kind: 'timezone_missing', field: `deadlines.${i}`, description: d.label, options: [], evidence: d.evidence })
      }
    }
    const evidenceVerified = evidenceInSource(d.evidence, src)
    if (!evidenceVerified) issues.push('evidence_unverified')
    return { ...d, date, time, timezone, precision, id: `d${i + 1}`, evidenceVerified, issues }
  })

  // Multiple primaries -> keep the first, others become secondary.
  let seenPrimary = false
  for (const d of deadlines) {
    if (d.isPrimary && seenPrimary) d.isPrimary = false
    if (d.isPrimary) seenPrimary = true
  }

  const tag = <T extends { evidence: string | null }>(arr: T[], prefix: string) =>
    arr.map((x, i) => ({ ...x, id: `${prefix}${i + 1}`, evidenceVerified: evidenceInSource(x.evidence, src) }))

  return {
    ...r,
    deadlines,
    locations: tag(r.locations, 'l'),
    deliverables: tag(r.deliverables, 'v'),
    requirements: tag(r.requirements, 'q'),
    rewards: tag(r.rewards, 'w'),
    ambiguities,
    submissionEvidenceVerified: evidenceInSource(r.submission.evidence, src),
    suggestedCheckpoints: r.suggestedCheckpoints.map((c) => ({ ...c, targetDate: c.targetDate && valid(isoDateSchema, c.targetDate) ? c.targetDate : null })),
  }
}

// ---------------------------------------------------------------------------
// Planning checks
// ---------------------------------------------------------------------------

export interface PlanCheck {
  code: 'moved_from_past' | 'after_deadline' | 'invalid_date' | 'dependency_dropped' | 'dependency_cycle' | 'dependency_order' | 'insufficient_time' | 'start_after_target'
  refs: string[]
  params?: Record<string, number | string>
}

export interface Feasibility {
  feasible: boolean
  aiFeasible: boolean | null
  summary: string | null
  conflicts: { description: string; refs: string[] }[]
  checks: PlanCheck[]
  totalEstimatedMinutes: number
  availableMinutes: number | null
}

export function toDraftCheckpoints(plan: PlanResult['checkpoints']): DraftCheckpoint[] {
  return plan.map((c) => ({
    clientId: c.ref,
    title: c.title,
    description: c.description,
    completionCriteria: c.completionCriteria,
    startDate: c.startDate,
    targetDate: c.targetDate,
    estimatedMinutes: c.estimatedMinutes,
    priority: c.priority,
    dependsOn: c.dependsOn,
    reminderOffsetMinutes: c.reminderOffsetMinutes,
    reasoning: c.reasoning,
    fromSourceRequirement: c.fromSourceRequirement,
    origin: 'ai',
    edited: false,
  }))
}

/**
 * Validate and repair a checkpoint draft in place. Repairs that change meaning
 * (moved dates, dropped dependencies) are reported so the UI can show them.
 */
export function checkPlan(
  items: DraftCheckpoint[],
  opts: { today: string; deadlineDate: string | null; hoursPerDay: number; ai?: PlanResult['feasibility'] | null },
): { items: DraftCheckpoint[]; feasibility: Feasibility } {
  const checks: PlanCheck[] = []
  const ids = new Set(items.map((i) => i.clientId))
  const out = items.map((i) => ({ ...i, dependsOn: [...i.dependsOn] }))

  for (const it of out) {
    for (const k of ['startDate', 'targetDate'] as const) {
      const v = it[k]
      if (v && !isoDateSchema.safeParse(v).success) {
        it[k] = null
        checks.push({ code: 'invalid_date', refs: [it.clientId] })
      } else if (v && v < opts.today && it.origin === 'ai') {
        it[k] = opts.today
        checks.push({ code: 'moved_from_past', refs: [it.clientId], params: { from: v } })
      }
    }
    if (it.startDate && it.targetDate && it.startDate > it.targetDate) {
      checks.push({ code: 'start_after_target', refs: [it.clientId] })
    }
    if (opts.deadlineDate && it.targetDate && it.targetDate > opts.deadlineDate) {
      checks.push({ code: 'after_deadline', refs: [it.clientId], params: { deadline: opts.deadlineDate } })
    }
    const before = it.dependsOn.length
    it.dependsOn = [...new Set(it.dependsOn)].filter((d) => d !== it.clientId && ids.has(d))
    if (it.dependsOn.length !== before) checks.push({ code: 'dependency_dropped', refs: [it.clientId] })
  }

  // Break cycles by removing the latest-added edge until acyclic.
  const edges = () => out.flatMap((i) => i.dependsOn.map((to) => ({ from: i.clientId, to })))
  let guard = 0
  while (hasCycle(edges()) && guard++ < 50) {
    const last = [...out].reverse().find((i) => i.dependsOn.length)
    if (!last) break
    const dropped = last.dependsOn.pop()!
    checks.push({ code: 'dependency_cycle', refs: [last.clientId, dropped] })
  }

  const byId = new Map(out.map((i) => [i.clientId, i]))
  for (const it of out) {
    for (const d of it.dependsOn) {
      const dep = byId.get(d)
      if (dep?.targetDate && it.targetDate && it.targetDate < dep.targetDate) checks.push({ code: 'dependency_order', refs: [it.clientId, d] })
    }
  }

  const total = out.reduce((s, i) => s + (i.estimatedMinutes ?? 0), 0)
  let available: number | null = null
  if (opts.deadlineDate) {
    const days = Math.max(diffInCalendarDays(opts.today, opts.deadlineDate) + 1, 0)
    available = Math.round(days * opts.hoursPerDay * 60)
    if (total > available) checks.push({ code: 'insufficient_time', refs: [], params: { needed: total, available } })
  }

  const blocking = checks.some((c) => c.code === 'insufficient_time' || c.code === 'after_deadline')
  return {
    items: out,
    feasibility: {
      feasible: !blocking && (opts.ai?.feasible ?? true),
      aiFeasible: opts.ai?.feasible ?? null,
      summary: opts.ai?.summary ?? null,
      conflicts: opts.ai?.conflicts ?? [],
      checks,
      totalEstimatedMinutes: total,
      availableMinutes: available,
    },
  }
}
