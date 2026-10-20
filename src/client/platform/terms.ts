// Server-side record of Terms acceptance, sent once per TERMS_VERSION after sign-in.
import { api } from '@/lib/api'
import { TERMS_VERSION } from '@shared/constants'
import { native } from './index'

const RECORDED_KEY = 'tp.termsRecorded'

export async function recordTermsAcceptance(): Promise<void> {
  if (!native) return
  try {
    if (localStorage.getItem(RECORDED_KEY) === TERMS_VERSION) return
  } catch {
    /* storage unavailable: send again, the endpoint is idempotent */
  }
  const accepted = await native.terms.accepted().catch(() => null)
  if (!accepted || accepted.version !== TERMS_VERSION) return
  try {
    await api.put('/terms/acceptance', { version: TERMS_VERSION })
    localStorage.setItem(RECORDED_KEY, TERMS_VERSION)
  } catch {
    /* endpoint missing or offline: try again on the next session change */
  }
}

/** Only same-app paths are allowed after the gate (no protocol-relative or /welcome loops). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  if (value === '/welcome' || value.startsWith('/welcome?')) return '/'
  return value
}
