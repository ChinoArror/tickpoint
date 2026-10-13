import { createI18n } from 'vue-i18n'
import en from '@locales/en.json'
import ja from '@locales/ja.json'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@shared/constants'

export const LOCALE_STORAGE_KEY = 'tp.locale'

/**
 * Map browser language tags to a supported locale. Only Japanese maps to `ja`;
 * everything else (including zh-*, fr-*, de-*) falls back to English.
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const base = tag.toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : null
}

/** First visit: honour an explicit stored choice, then the browser's preference order, else English. */
export function detectLocale(stored: string | null, languages: readonly string[]): Locale {
  const explicit = matchLocale(stored)
  if (explicit) return explicit
  for (const l of languages) {
    if (matchLocale(l) === 'ja') return 'ja'
    // The first supported preference wins (an English preference before Japanese keeps English).
    if (matchLocale(l) === 'en') return 'en'
  }
  return DEFAULT_LOCALE
}

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

export const initialLocale = detectLocale(readStored(), typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])

// Feature areas may ship message fragments in src/locales/parts/<area>.<locale>.json.
const parts = import.meta.glob<Record<string, unknown>>('../../locales/parts/*.json', { eager: true, import: 'default' })

function deepMerge(target: Record<string, unknown>, src: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>)
    else target[k] = v
  }
  return target
}

function buildMessages() {
  const out: Record<Locale, Record<string, unknown>> = { en: structuredClone(en), ja: structuredClone(ja) }
  for (const [path, msgs] of Object.entries(parts)) {
    const m = path.match(/\.(en|ja)\.json$/)
    if (m) deepMerge(out[m[1] as Locale], msgs)
  }
  return out
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: buildMessages() as { en: typeof en; ja: typeof en },
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
})

/** Apply a locale. `persist` marks it as the user's explicit choice. */
export function setLocale(locale: Locale, persist: boolean) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  if (persist) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      /* storage unavailable */
    }
  }
}
