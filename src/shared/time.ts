// Time zone and countdown utilities that work identically in browsers and Workers.
// All canonical instants are UTC epoch milliseconds.

import type { DueSpec } from './schemas'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    dtfCache.set(timeZone, f)
  }
  return f
}

export interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

/** Wall-clock fields of an instant in a given IANA zone. */
export function wallClockAt(instant: number, timeZone: string): WallClock {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  }
}

/** Offset (ms) of a zone at an instant: local wall time minus UTC. */
export function zoneOffsetAt(instant: number, timeZone: string): number {
  const w = wallClockAt(instant, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * Convert a wall-clock date/time in an IANA zone to a UTC instant.
 * DST handling:
 * - Ambiguous times (fall-back overlap) resolve to the earlier instant.
 * - Non-existent times (spring-forward gap) shift forward by the gap length,
 *   matching how most calendar applications behave.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0)

  // Candidate offsets around the target; try both and keep those that round-trip.
  const o1 = zoneOffsetAt(naive - DAY / 2, timeZone)
  const o2 = zoneOffsetAt(naive + DAY / 2, timeZone)
  const candidates = [...new Set([o1, o2])]
    .map((o) => naive - o)
    .filter((t) => {
      const w = wallClockAt(t, timeZone)
      return w.year === y && w.month === m && w.day === d && w.hour === hh && w.minute === mm
    })
    .sort((a, b) => a - b)
  if (candidates.length > 0) return candidates[0]

  // Gap: the wall time does not exist. Use the pre-transition offset, which lands after the gap.
  return naive - Math.min(o1, o2)
}

/** Start (00:00) of a calendar day in a zone, as UTC instant. */
export function startOfZonedDay(date: string, timeZone: string): number {
  return zonedTimeToUtc(date, '00:00', timeZone)
}

/** The instant the given calendar day ends in a zone (start of next day). */
export function endOfZonedDay(date: string, timeZone: string): number {
  return startOfZonedDay(addDaysToIsoDate(date, 1), timeZone)
}

export function addDaysToIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** Calendar date (YYYY-MM-DD) of an instant in a zone. */
export function isoDateInZone(instant: number, timeZone: string): string {
  const w = wallClockAt(instant, timeZone)
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
}

export function diffInCalendarDays(fromDate: string, toDate: string): number {
  const a = Date.parse(fromDate + 'T00:00:00Z')
  const b = Date.parse(toDate + 'T00:00:00Z')
  return Math.round((b - a) / DAY)
}

export interface ResolvedDue {
  precision: DueSpec['precision']
  /** Canonical instant. Only set when precision === 'exact'. */
  dueAt: number | null
  dueDate: string | null
  dueTime: string | null
  timeZone: string | null
  /**
   * Instant used for ordering, overdue detection and reminder anchoring.
   * - exact: dueAt.
   * - date/approximate: the end of that calendar day in the zone (the item only
   *   becomes overdue once the whole day has passed). This is never displayed
   *   as a due time and never stored as an invented "23:59".
   * - unknown: null.
   */
  dueSortAt: number | null
}

export function resolveDue(spec: DueSpec | null | undefined, fallbackZone: string): ResolvedDue {
  if (!spec || spec.precision === 'unknown') {
    return { precision: 'unknown', dueAt: null, dueDate: null, dueTime: null, timeZone: spec?.timeZone ?? null, dueSortAt: null }
  }
  const tz = spec.timeZone || fallbackZone
  if (spec.precision === 'exact') {
    const at = zonedTimeToUtc(spec.date!, spec.time!, tz)
    return { precision: 'exact', dueAt: at, dueDate: spec.date!, dueTime: spec.time!, timeZone: tz, dueSortAt: at }
  }
  return {
    precision: spec.precision,
    dueAt: null,
    dueDate: spec.date!,
    dueTime: null,
    timeZone: spec.timeZone ?? null,
    dueSortAt: endOfZonedDay(spec.date!, tz),
  }
}

export interface CountdownParts {
  overdue: boolean
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** Break a signed remaining duration into parts. Negative means overdue. */
export function countdownParts(targetAt: number, now: number): CountdownParts {
  const diff = targetAt - now
  const abs = Math.abs(diff)
  return {
    overdue: diff < 0,
    totalMs: diff,
    days: Math.floor(abs / DAY),
    hours: Math.floor((abs % DAY) / HOUR),
    minutes: Math.floor((abs % HOUR) / MINUTE),
    seconds: Math.floor((abs % MINUTE) / 1000),
  }
}

/** Compact, locale-neutral countdown body such as "3d 12h 24m" or "45m". */
export function formatCountdownCompact(p: CountdownParts): string {
  if (p.days > 0) return `${p.days}d ${p.hours}h ${p.minutes}m`
  if (p.hours > 0) return `${p.hours}h ${p.minutes}m`
  if (p.minutes > 0) return `${p.minutes}m`
  return `${p.seconds}s`
}

export const TIME = { MINUTE, HOUR, DAY } as const
