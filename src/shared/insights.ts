// Deterministic deadline-risk and goal-health calculations.
// AI may narrate these results but never replaces them.

import type { GoalProgressModel, RiskLevel } from './constants'
import { TIME } from './time'

export interface RiskReason {
  code:
    | 'completed'
    | 'no_deadline'
    | 'overdue'
    | 'effort_exceeds_time'
    | 'tight_schedule'
    | 'behind_expected_progress'
    | 'little_time_low_progress'
    | 'blocked_by_dependencies'
    | 'delayed_checkpoints'
    | 'comfortable'
  severity: 0 | 1 | 2 | 3 // 0 info, 1 attention, 2 at risk, 3 overdue
  params?: Record<string, number | string>
}

export interface RiskInput {
  now: number
  status: string
  dueSortAt: number | null
  /** When work could start: start date or creation time. */
  startAt: number
  progressPercent: number
  estimatedMinutes: number | null
  hoursPerDay: number
  openBlockingDependencies: number
  delayedCheckpoints: number
  pendingCheckpoints: number
}

export interface RiskResult {
  level: RiskLevel
  reasons: RiskReason[]
  remainingMs: number | null
  remainingEffortMinutes: number | null
  availableMinutes: number | null
  expectedProgress: number | null
}

const LEVEL_BY_SEVERITY: RiskLevel[] = ['on_track', 'attention', 'at_risk', 'overdue']

export function assessDeadlineRisk(i: RiskInput): RiskResult {
  const base = {
    remainingMs: null,
    remainingEffortMinutes: null,
    availableMinutes: null,
    expectedProgress: null,
  }
  if (i.status === 'completed') return { level: 'done', reasons: [{ code: 'completed', severity: 0 }], ...base }

  const reasons: RiskReason[] = []
  if (i.delayedCheckpoints > 0) {
    reasons.push({
      code: 'delayed_checkpoints',
      severity: i.delayedCheckpoints >= 3 ? 2 : 1,
      params: { count: i.delayedCheckpoints },
    })
  }

  if (i.dueSortAt == null) {
    const sev = reasons.reduce((m, r) => Math.max(m, r.severity), 0)
    return {
      level: sev === 0 ? 'none' : LEVEL_BY_SEVERITY[sev],
      reasons: [{ code: 'no_deadline', severity: 0 }, ...reasons],
      ...base,
    }
  }

  const remainingMs = i.dueSortAt - i.now
  if (remainingMs < 0) {
    return {
      level: 'overdue',
      reasons: [{ code: 'overdue', severity: 3, params: { minutes: Math.round(-remainingMs / TIME.MINUTE) } }, ...reasons],
      ...base,
      remainingMs,
    }
  }

  const progress = clamp(i.progressPercent, 0, 100)
  const remainingDays = remainingMs / TIME.DAY
  const availableMinutes = Math.round(remainingDays * i.hoursPerDay * 60)
  const remainingEffortMinutes = i.estimatedMinutes != null ? Math.round(i.estimatedMinutes * (1 - progress / 100)) : null

  if (remainingEffortMinutes != null && remainingEffortMinutes > 0) {
    const load = remainingEffortMinutes / Math.max(availableMinutes, 1)
    if (load > 1) {
      reasons.push({ code: 'effort_exceeds_time', severity: 2, params: { effort: remainingEffortMinutes, available: availableMinutes } })
    } else if (load > 0.6) {
      reasons.push({ code: 'tight_schedule', severity: 1, params: { ratio: Math.round(load * 100) } })
    }
  }

  // Expected progress assumes linear work between start and due.
  const span = i.dueSortAt - i.startAt
  let expectedProgress: number | null = null
  if (span > TIME.HOUR) {
    expectedProgress = clamp(((i.now - i.startAt) / span) * 100, 0, 100)
    const gap = expectedProgress - progress
    const tracksProgress = progress > 0 || i.pendingCheckpoints > 0 || i.estimatedMinutes != null
    if (tracksProgress && gap > 40) {
      reasons.push({ code: 'behind_expected_progress', severity: 2, params: { expected: Math.round(expectedProgress), actual: Math.round(progress) } })
    } else if (tracksProgress && gap > 20) {
      reasons.push({ code: 'behind_expected_progress', severity: 1, params: { expected: Math.round(expectedProgress), actual: Math.round(progress) } })
    }
  }

  if (remainingMs < TIME.DAY && progress < 50) {
    reasons.push({ code: 'little_time_low_progress', severity: 2, params: { hours: Math.round(remainingMs / TIME.HOUR) } })
  } else if (remainingMs < 3 * TIME.DAY && progress < 25) {
    reasons.push({ code: 'little_time_low_progress', severity: 1, params: { hours: Math.round(remainingMs / TIME.HOUR) } })
  }

  if (i.openBlockingDependencies > 0) {
    reasons.push({
      code: 'blocked_by_dependencies',
      severity: remainingMs < 3 * TIME.DAY ? 2 : 1,
      params: { count: i.openBlockingDependencies },
    })
  }

  const sev = reasons.reduce((m, r) => Math.max(m, r.severity), 0)
  if (sev === 0) reasons.push({ code: 'comfortable', severity: 0 })
  return {
    level: LEVEL_BY_SEVERITY[sev],
    reasons: reasons.sort((a, b) => b.severity - a.severity),
    remainingMs,
    remainingEffortMinutes,
    availableMinutes,
    expectedProgress,
  }
}

// ---------------------------------------------------------------------------
// Goal health
// ---------------------------------------------------------------------------

export interface GoalHealthInput {
  now: number
  model: GoalProgressModel
  status: string
  currentValue: number
  targetValue: number | null
  createdAt: number
  /** Target date end-of-day instant, if any. */
  targetAt: number | null
  checkpoints: { done: boolean; weight: number }[]
  /** Timestamps of progress entries in the last 28 days. */
  recentActivityAt: number[]
  /** Fraction progressed during the last 28 days (0-1), from progress history. */
  recentGain: number | null
}

export interface GoalHealth {
  actual: number // 0-1
  expected: number | null // 0-1, only with target date
  deviation: number | null // actual - expected
  remaining: number | null // in model units when meaningful
  activeDays28: number
  consistency: number // 0-1, active days / 28
  outlook: 'completed' | 'ahead' | 'on_pace' | 'behind' | 'insufficient_data' | 'consistent' | 'irregular' | 'inactive'
  projectedCompletionAt: number | null
}

export function goalActualProgress(i: Pick<GoalHealthInput, 'model' | 'status' | 'currentValue' | 'targetValue' | 'checkpoints'>): number {
  switch (i.model) {
    case 'binary':
      return i.status === 'completed' || i.currentValue >= 1 ? 1 : 0
    case 'percentage':
      return clamp(i.currentValue / 100, 0, 1)
    case 'quantity':
    case 'time':
      return i.targetValue ? clamp(i.currentValue / i.targetValue, 0, 1) : 0
    case 'checkpoint': {
      if (i.checkpoints.length === 0) return 0
      return i.checkpoints.filter((c) => c.done).length / i.checkpoints.length
    }
    case 'weighted': {
      const total = i.checkpoints.reduce((s, c) => s + c.weight, 0)
      if (total <= 0) return 0
      return i.checkpoints.filter((c) => c.done).reduce((s, c) => s + c.weight, 0) / total
    }
  }
}

export function assessGoalHealth(i: GoalHealthInput): GoalHealth {
  const actual = goalActualProgress(i)
  const days = new Set(i.recentActivityAt.map((t) => Math.floor(t / TIME.DAY)))
  const activeDays28 = days.size
  const consistency = activeDays28 / 28
  const remaining =
    (i.model === 'quantity' || i.model === 'time') && i.targetValue ? Math.max(i.targetValue - i.currentValue, 0) : null

  if (i.status === 'completed' || actual >= 1) {
    return { actual, expected: null, deviation: null, remaining, activeDays28, consistency, outlook: 'completed', projectedCompletionAt: null }
  }

  if (i.targetAt == null) {
    // No schedule: never fabricate a completion probability; report consistency only.
    const outlook = activeDays28 === 0 ? 'inactive' : consistency >= 0.25 ? 'consistent' : 'irregular'
    return { actual, expected: null, deviation: null, remaining, activeDays28, consistency, outlook, projectedCompletionAt: null }
  }

  const span = i.targetAt - i.createdAt
  const expected = span > 0 ? clamp((i.now - i.createdAt) / span, 0, 1) : 1
  const deviation = actual - expected

  let projectedCompletionAt: number | null = null
  if (i.recentGain != null && i.recentGain > 0) {
    const ratePerMs = i.recentGain / (28 * TIME.DAY)
    projectedCompletionAt = i.now + (1 - actual) / ratePerMs
  }

  let outlook: GoalHealth['outlook']
  if (i.recentGain == null && actual === 0) outlook = 'insufficient_data'
  else if (deviation >= 0.1) outlook = 'ahead'
  else if (deviation >= -0.1) outlook = 'on_pace'
  else outlook = 'behind'

  return { actual, expected, deviation, remaining, activeDays28, consistency, outlook, projectedCompletionAt }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
