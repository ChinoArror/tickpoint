import { ref } from 'vue'

export type ThemePref = 'system' | 'light' | 'dark'
const THEME_KEY = 'tp.theme'
export const themePref = ref<ThemePref>(readTheme())
const mql = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function paint() {
  const dark = themePref.value === 'dark' || (themePref.value === 'system' && !!mql?.matches)
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16171d' : '#f8f9fb')
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

export function applyTheme(pref: ThemePref) {
  themePref.value = pref
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* ignore */
  }
  paint()
}

export function initTheme() {
  paint()
  mql?.addEventListener('change', () => themePref.value === 'system' && paint())
}
