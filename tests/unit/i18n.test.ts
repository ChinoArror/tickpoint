import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectLocale, matchLocale } from '../../src/client/i18n'
import { copyFor, formatWhen } from '../../src/server/notifications/templates'
import { safeReturnPath } from '../../src/server/auth/session'

describe('browser language detection', () => {
  it.each([
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['ja-JP', 'ja'],
    ['ja', 'ja'],
    ['zh-CN', null],
    ['zh-TW', null],
    ['fr-FR', null],
    ['de-DE', null],
  ])('%s -> %s', (tag, expected) => {
    expect(matchLocale(tag)).toBe(expected)
  })

  it('selects Japanese when the browser prefers it', () => {
    expect(detectLocale(null, ['ja-JP', 'en-US'])).toBe('ja')
  })
  it('falls back to English for unsupported languages', () => {
    expect(detectLocale(null, ['zh-CN', 'fr-FR'])).toBe('en')
    expect(detectLocale(null, [])).toBe('en')
  })
  it('keeps English when English is preferred before Japanese', () => {
    expect(detectLocale(null, ['en-US', 'ja'])).toBe('en')
  })
  it('lets a manual choice override browser detection', () => {
    expect(detectLocale('en', ['ja-JP'])).toBe('en')
    expect(detectLocale('ja', ['en-US'])).toBe('ja')
    expect(detectLocale('zh', ['ja-JP'])).toBe('ja')
  })
})

// Flatten base + parts for each locale exactly like the runtime loader does.
function messages(locale: 'en' | 'ja') {
  const root = join(__dirname, '../../src/locales')
  const out: Record<string, unknown> = JSON.parse(readFileSync(join(root, `${locale}.json`), 'utf8'))
  const partsDir = join(root, 'parts')
  let files: string[] = []
  try {
    files = readdirSync(partsDir).filter((f) => f.endsWith(`.${locale}.json`))
  } catch {
    /* no parts */
  }
  const merge = (t: Record<string, any>, s: Record<string, any>) => {
    for (const [k, v] of Object.entries(s)) {
      if (v && typeof v === 'object' && t[k] && typeof t[k] === 'object') merge(t[k], v)
      else t[k] = v
    }
  }
  for (const f of files) merge(out, JSON.parse(readFileSync(join(partsDir, f), 'utf8')))
  return out
}

function flatten(o: unknown, prefix = ''): Map<string, string> {
  const m = new Map<string, string>()
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) for (const [kk, vv] of flatten(v, prefix ? `${prefix}.${k}` : k)) m.set(kk, vv)
  else m.set(prefix, String(o))
  return m
}

describe('translations', () => {
  const en = flatten(messages('en'))
  const ja = flatten(messages('ja'))

  it('have no missing Japanese keys', () => {
    expect([...en.keys()].filter((k) => !ja.has(k))).toEqual([])
  })
  it('have no Japanese-only keys', () => {
    expect([...ja.keys()].filter((k) => !en.has(k))).toEqual([])
  })
  it('use the same placeholders in both languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    const mismatched = [...en.entries()].filter(([k, v]) => ja.has(k) && ph(v) !== ph(ja.get(k)!)).map(([k]) => k)
    expect(mismatched).toEqual([])
  })
  it('contain no Chinese-only locale files', () => {
    const files = readdirSync(join(__dirname, '../../src/locales')).filter((f) => f.endsWith('.json'))
    expect(files.sort()).toEqual(['en.json', 'ja.json'])
  })
})

describe('notification localization', () => {
  it('renders reminders in the recipient language', () => {
    expect(copyFor('ja').reminderTitle('レポート')).toBe('リマインダー：レポート')
    expect(copyFor('en').reminderTitle('Report')).toBe('Reminder: Report')
    expect(copyFor('fr').reminderTitle('x')).toBe('Reminder: x')
  })
  it('formats dates per locale (en: Oct 20, 2026 · ja: 2026/10/20)', () => {
    const t = Date.UTC(2026, 9, 20, 14, 59)
    expect(formatWhen(t, 'en', 'Asia/Tokyo', false)).toMatch(/Oct 20, 2026/)
    expect(formatWhen(t, 'ja', 'Asia/Tokyo', false)).toMatch(/2026\/10\/20/)
    expect(formatWhen(t, 'ja', 'Asia/Tokyo', false)).toMatch(/23:59/)
  })
})

describe('safe redirects', () => {
  it.each([
    ['/goals?x=1', '/goals?x=1'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/api/v1/tasks', '/'],
    ['/sso-callback?token=x', '/'],
    [null, '/'],
  ])('%s -> %s', (input, out) => {
    expect(safeReturnPath(input as string | null)).toBe(out)
  })
})
