import { describe, expect, it } from 'vitest'
import { countdownParts, endOfZonedDay, formatCountdownCompact, isoDateInZone, resolveDue, zonedTimeToUtc } from '../../src/shared/time'

describe('time zone conversion', () => {
  it('converts wall-clock times in fixed-offset zones', () => {
    expect(zonedTimeToUtc('2026-10-20', '23:59', 'Asia/Tokyo')).toBe(Date.UTC(2026, 9, 20, 14, 59))
    expect(zonedTimeToUtc('2026-10-20', '23:59', 'Asia/Shanghai')).toBe(Date.UTC(2026, 9, 20, 15, 59))
    expect(zonedTimeToUtc('2026-10-20', '00:00', 'UTC')).toBe(Date.UTC(2026, 9, 20))
  })

  it('handles daylight saving: spring-forward gap shifts forward', () => {
    // 2026-03-08 02:30 does not exist in New York (clocks jump 02:00 -> 03:00).
    const t = zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York')
    expect(t).toBe(Date.UTC(2026, 2, 8, 7, 30)) // 03:30 EDT
  })

  it('handles daylight saving: fall-back overlap picks the earlier instant', () => {
    // 2026-11-01 01:30 happens twice in New York; pick EDT (UTC-4).
    expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York')).toBe(Date.UTC(2026, 10, 1, 5, 30))
  })

  it('computes day boundaries across DST changes', () => {
    // 23-hour day in New York.
    expect(endOfZonedDay('2026-03-08', 'America/New_York') - zonedTimeToUtc('2026-03-08', '00:00', 'America/New_York')).toBe(23 * 3600_000)
    expect(isoDateInZone(Date.UTC(2026, 9, 20, 15, 30), 'Asia/Tokyo')).toBe('2026-10-21')
  })
})

describe('due resolution', () => {
  it('never invents a time for date-only deadlines', () => {
    const r = resolveDue({ precision: 'date', date: '2026-10-20' }, 'Asia/Tokyo')
    expect(r.dueAt).toBeNull()
    expect(r.dueTime).toBeNull()
    expect(r.dueSortAt).toBe(Date.UTC(2026, 9, 20, 15, 0)) // end of the day in Tokyo, used only for ordering/overdue
  })

  it('keeps the source time zone for exact deadlines', () => {
    const r = resolveDue({ precision: 'exact', date: '2026-10-20', time: '17:00', timeZone: 'Europe/London' }, 'Asia/Tokyo')
    expect(r).toMatchObject({ timeZone: 'Europe/London', dueTime: '17:00', dueAt: Date.UTC(2026, 9, 20, 16, 0) })
  })

  it('treats unknown deadlines as undated', () => {
    expect(resolveDue({ precision: 'unknown' }, 'UTC')).toMatchObject({ dueAt: null, dueSortAt: null })
    expect(resolveDue(null, 'UTC').precision).toBe('unknown')
  })
})

describe('countdown', () => {
  it('formats remaining and overdue durations', () => {
    const now = Date.UTC(2026, 0, 1)
    expect(formatCountdownCompact(countdownParts(now + (3 * 86400 + 12 * 3600 + 24 * 60) * 1000, now))).toBe('3d 12h 24m')
    expect(formatCountdownCompact(countdownParts(now + 45 * 60_000, now))).toBe('45m')
    const over = countdownParts(now - (2 * 3600 + 15 * 60) * 1000, now)
    expect(over.overdue).toBe(true)
    expect(formatCountdownCompact(over)).toBe('2h 15m')
  })
})
