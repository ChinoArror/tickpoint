import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { countdownParts, isoDateInZone, type CountdownParts } from '@shared/time'
import type { Due } from '@/lib/types'

/**
 * Locale- and time-zone-aware formatting. The underlying timestamps are never
 * altered; only their presentation changes.
 *   en: Oct 20, 2026, 11:59 PM     ja: 2026/10/20 23:59
 */
export function useFormat() {
  const { t, locale } = useI18n()
  const session = useSessionStore()
  const tz = computed(() => session.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const intlLocale = computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US'))
  const hour12 = computed(() => {
    const f = session.settings?.timeFormat ?? 'auto'
    return f === 'h12' ? true : f === 'h24' ? false : locale.value !== 'ja'
  })

  function dateParts(): Intl.DateTimeFormatOptions {
    const f = session.settings?.dateFormat ?? 'auto'
    if (locale.value === 'ja' || f === 'ymd') return { year: 'numeric', month: '2-digit', day: '2-digit' }
    return { year: 'numeric', month: 'short', day: 'numeric' }
  }

  function dateTime(instant: number | null | undefined, zone?: string | null): string {
    if (instant == null) return ''
    return new Intl.DateTimeFormat(intlLocale.value, { timeZone: zone ?? tz.value, ...dateParts(), hour: '2-digit', minute: '2-digit', hour12: hour12.value }).format(new Date(instant))
  }

  /** Format a calendar date (YYYY-MM-DD) without shifting it through any time zone. */
  function date(iso: string | null | undefined, opts: { weekday?: boolean; short?: boolean } = {}): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    const base: Intl.DateTimeFormatOptions = opts.short
      ? { month: locale.value === 'ja' ? 'numeric' : 'short', day: 'numeric' }
      : dateParts()
    return new Intl.DateTimeFormat(intlLocale.value, { timeZone: 'UTC', ...base, ...(opts.weekday ? { weekday: 'short' } : {}) }).format(new Date(Date.UTC(y, m - 1, d)))
  }

  function time(instant: number, zone?: string | null): string {
    return new Intl.DateTimeFormat(intlLocale.value, { timeZone: zone ?? tz.value, hour: '2-digit', minute: '2-digit', hour12: hour12.value }).format(new Date(instant))
  }

  function zoneAbbr(instant: number, zone: string): string {
    const p = new Intl.DateTimeFormat(intlLocale.value, { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(instant))
    return p.find((x) => x.type === 'timeZoneName')?.value ?? zone
  }

  /** Human label for a due spec. Exact deadlines show local time and, if different, the source zone. */
  function due(d: Due): string {
    if (d.precision === 'unknown') return t('due.unknown')
    if (d.precision === 'exact' && d.at != null) {
      const local = dateTime(d.at)
      if (d.timeZone && d.timeZone !== tz.value) return `${local} · ${t('due.sourceTime', { time: dateTime(d.at, d.timeZone), zone: zoneAbbr(d.at, d.timeZone) })}`
      return local
    }
    const label = date(d.date)
    return d.precision === 'approximate' ? t('due.approx', { date: label }) : label
  }

  function relativeDay(iso: string): string {
    const today = isoDateInZone(Date.now(), tz.value)
    const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000)
    if (diff === 0) return t('time.today')
    if (diff === 1) return t('time.tomorrow')
    if (diff === -1) return t('time.yesterday')
    return date(iso, { short: true, weekday: Math.abs(diff) < 7 })
  }

  function countdown(target: number, nowMs: number): { parts: CountdownParts; text: string } {
    const p = countdownParts(target, nowMs)
    let body: string
    if (p.days > 0) body = t('countdown.dhm', { d: p.days, h: p.hours, m: p.minutes })
    else if (p.hours > 0) body = t('countdown.hm', { h: p.hours, m: p.minutes })
    else if (p.minutes > 0) body = t('countdown.m', { m: p.minutes })
    else body = t('countdown.s', { s: p.seconds })
    return { parts: p, text: p.overdue ? t('countdown.overdue', { time: body }) : t('countdown.remaining', { time: body }) }
  }

  function minutes(m: number | null | undefined): string {
    if (m == null) return '—'
    const h = Math.floor(m / 60)
    const mm = m % 60
    if (h && mm) return t('duration.hm', { h, m: mm })
    if (h) return t('duration.h', { h })
    return t('duration.m', { m: mm })
  }

  function relativeTime(instant: number, nowMs = Date.now()): string {
    const rtf = new Intl.RelativeTimeFormat(intlLocale.value, { numeric: 'auto' })
    const diff = (instant - nowMs) / 1000
    const abs = Math.abs(diff)
    if (abs < 60) return rtf.format(Math.round(diff), 'second')
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
    return date(isoDateInZone(instant, tz.value))
  }

  function percent(v: number | null | undefined, digits = 0): string {
    if (v == null) return '—'
    return new Intl.NumberFormat(intlLocale.value, { style: 'percent', maximumFractionDigits: digits }).format(v)
  }

  function number(v: number, digits = 1): string {
    return new Intl.NumberFormat(intlLocale.value, { maximumFractionDigits: digits }).format(v)
  }

  const today = computed(() => isoDateInZone(Date.now(), tz.value))

  return { tz, today, dateTime, date, time, due, relativeDay, countdown, minutes, relativeTime, percent, number, zoneAbbr }
}
