import { describe, expect, it } from 'vitest'
import { assessDeadlineRisk, assessGoalHealth, goalActualProgress } from '../../src/shared/insights'

const H = 3600_000
const D = 24 * H
const now = Date.UTC(2026, 9, 13, 12)
const base = { now, status: 'in_progress', startAt: now - 10 * D, progressPercent: 50, estimatedMinutes: null, hoursPerDay: 3, openBlockingDependencies: 0, delayedCheckpoints: 0, pendingCheckpoints: 0 }

describe('deadline risk', () => {
  it('is on track with plenty of time', () => {
    const r = assessDeadlineRisk({ ...base, dueSortAt: now + 10 * D })
    expect(r.level).toBe('on_track')
    expect(r.reasons[0].code).toBe('comfortable')
  })

  it('is overdue after the deadline', () => {
    expect(assessDeadlineRisk({ ...base, dueSortAt: now - H }).level).toBe('overdue')
  })

  it('flags effort that exceeds available time even with an early-looking percentage', () => {
    const r = assessDeadlineRisk({ ...base, progressPercent: 80, dueSortAt: now + 2 * D, estimatedMinutes: 100 * 60 })
    expect(r.level).toBe('at_risk')
    expect(r.reasons.map((x) => x.code)).toContain('effort_exceeds_time')
  })

  it('considers dependencies and delayed checkpoints', () => {
    const r = assessDeadlineRisk({ ...base, dueSortAt: now + 2 * D, openBlockingDependencies: 2, delayedCheckpoints: 1 })
    expect(r.level).toBe('at_risk')
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['blocked_by_dependencies', 'delayed_checkpoints']))
  })

  it('does not assess schedule risk without a deadline', () => {
    expect(assessDeadlineRisk({ ...base, dueSortAt: null }).level).toBe('none')
  })

  it('reports completion', () => {
    expect(assessDeadlineRisk({ ...base, status: 'completed', dueSortAt: now - D }).level).toBe('done')
  })
})

describe('goal health', () => {
  it('computes progress per model without double counting', () => {
    expect(goalActualProgress({ model: 'quantity', status: 'active', currentValue: 120, targetValue: 300, checkpoints: [] })).toBeCloseTo(0.4)
    expect(goalActualProgress({ model: 'weighted', status: 'active', currentValue: 0, targetValue: null, checkpoints: [{ done: true, weight: 3 }, { done: false, weight: 1 }] })).toBeCloseTo(0.75)
    expect(goalActualProgress({ model: 'binary', status: 'active', currentValue: 0, targetValue: null, checkpoints: [] })).toBe(0)
  })

  it('never fabricates a schedule outlook for goals without a target date', () => {
    const h = assessGoalHealth({ now, model: 'time', status: 'active', currentValue: 14, targetValue: 40, createdAt: now - 30 * D, targetAt: null, checkpoints: [], recentActivityAt: [now - D, now - 2 * D, now - 3 * D, now - 9 * D, now - 10 * D, now - 11 * D, now - 12 * D], recentGain: 0.2 })
    expect(h.expected).toBeNull()
    expect(h.projectedCompletionAt).toBeNull()
    expect(h.outlook).toBe('consistent')
  })

  it('compares actual and expected progress with a target date', () => {
    const h = assessGoalHealth({ now, model: 'percentage', status: 'active', currentValue: 20, targetValue: null, createdAt: now - 10 * D, targetAt: now + 10 * D, checkpoints: [], recentActivityAt: [now], recentGain: 0.2 })
    expect(h.expected).toBeCloseTo(0.5)
    expect(h.outlook).toBe('behind')
  })
})
