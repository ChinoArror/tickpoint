import { onScopeDispose, ref, type Ref } from 'vue'

// One shared ticking clock, corrected by the measured server offset so that
// countdowns agree with server-side (authoritative) calculations.
let offsetMs = 0
const now = ref(Date.now())
let subscribers = 0
let timer: ReturnType<typeof setInterval> | null = null

export function setServerTime(serverNow: number, requestStartedAt: number, receivedAt: number) {
  const rtt = receivedAt - requestStartedAt
  const estimate = serverNow + rtt / 2 - receivedAt
  // Ignore implausible offsets caused by slow responses.
  if (Math.abs(estimate) < 24 * 3600_000 && rtt < 10_000) offsetMs = Math.round(estimate)
  now.value = Date.now() + offsetMs
}

export function serverNow(): number {
  return Date.now() + offsetMs
}

/** Reactive "now" updated every second while any component uses it. */
export function useNow(): Ref<number> {
  subscribers++
  if (!timer) {
    timer = setInterval(() => {
      now.value = Date.now() + offsetMs
    }, 1000)
  }
  onScopeDispose(() => {
    subscribers--
    if (subscribers === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return now
}
