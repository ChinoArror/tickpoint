import { reactive } from 'vue'
import { i18n } from '@/i18n'
import { runActivity } from '@/composables/useActivity'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface ToastOptions {
  kind?: ToastKind
  action?: ToastAction
  /** Milliseconds the notice stays before it is dismissed. */
  timeout?: number
}

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
  /** Full duration in ms (the countdown bar spans this). */
  timeout: number
  /** Milliseconds left on the timer; updated when paused. */
  remaining: number
  /** Wall-clock time the current timer run started. */
  startedAt: number
  paused: boolean
}

const MAX_VISIBLE = 4

export const toasts = reactive<Toast[]>([])
let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/** Runs once when a notice leaves the stack for any reason (timer, close, action, eviction). */
const dismissHooks = new Map<number, () => void>()

function tr(key: string): string {
  return i18n.global.t(key)
}

function clearTimer(id: number) {
  const h = timers.get(id)
  if (h !== undefined) {
    clearTimeout(h)
    timers.delete(id)
  }
}

function arm(t: Toast) {
  clearTimer(t.id)
  t.startedAt = Date.now()
  const id = t.id
  timers.set(id, setTimeout(() => dismissToast(id), t.remaining))
}

export function toast(message: string, opts: ToastOptions = {}): number {
  const kind = opts.kind ?? 'info'
  const timeout = opts.timeout ?? (kind === 'error' || opts.action ? 7000 : 5000)
  toasts.push({ id: ++seq, kind, message, action: opts.action, timeout, remaining: timeout, startedAt: 0, paused: false })
  const t = toasts[toasts.length - 1]
  arm(t)
  while (toasts.length > MAX_VISIBLE) dismissToast(toasts[0].id)
  return t.id
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i < 0) return
  toasts.splice(i, 1)
  clearTimer(id)
  const hook = dismissHooks.get(id)
  dismissHooks.delete(id)
  hook?.()
}

/** Stops the countdown, remembering how much time was left. */
export function pauseToast(id: number) {
  const t = toasts.find((x) => x.id === id)
  if (!t || t.paused) return
  clearTimer(id)
  t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt))
  t.paused = true
}

/** Restarts the countdown with the time that was left when it was paused. */
export function resumeToast(id: number) {
  const t = toasts.find((x) => x.id === id)
  if (!t || !t.paused) return
  t.paused = false
  arm(t)
}

export type DeferredResult = 'committed' | 'undone' | 'failed'

export interface DeferredOptions {
  /** Label of the Undo action (default: common.undo). */
  undoLabel?: string
  /** Success notice shown after the commit succeeds. */
  successMessage?: string
  /** Grace period in ms before the commit runs (default 6000). */
  delay?: number
  onUndo?: () => void
  onError?: (e: unknown) => void
  /** Label for the live activity indicator while the commit runs (default: feedback.saving). */
  activityLabel?: string
}

/**
 * Shows a notice with Undo. The commit runs exactly once when the countdown ends, the
 * notice is closed, or the page is hidden; Undo cancels it. Resolves with the outcome.
 */
export function deferred(message: string, commit: () => Promise<unknown>, opts: DeferredOptions = {}): Promise<DeferredResult> {
  return new Promise<DeferredResult>((resolve) => {
    let state: 'pending' | 'undone' | 'committing' = 'pending'
    let id = 0

    const onHide = () => {
      if (document.visibilityState === 'hidden') dismissToast(id)
    }
    const detach = () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }

    const undo = () => {
      if (state !== 'pending') return
      state = 'undone'
      opts.onUndo?.()
      resolve('undone')
      toast(tr('feedback.undone'), { kind: 'info' })
    }

    id = toast(message, {
      kind: 'info',
      timeout: opts.delay ?? 6000,
      action: { label: opts.undoLabel ?? tr('common.undo'), run: undo },
    })
    dismissHooks.set(id, () => {
      detach()
      if (state !== 'pending') return
      state = 'committing'
      runActivity(opts.activityLabel ?? tr('feedback.saving'), () => commit()).then(
        () => {
          resolve('committed')
          if (opts.successMessage) toast(opts.successMessage, { kind: 'success' })
        },
        (e: unknown) => {
          resolve('failed')
          toast(tr('feedback.commitFailed'), { kind: 'error' })
          opts.onError?.(e)
        },
      )
    })
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
  })
}

export function useToast() {
  return {
    success: (m: string, o?: ToastOptions) => toast(m, { ...o, kind: 'success' }),
    error: (m: string, o?: ToastOptions) => toast(m, { ...o, kind: 'error' }),
    info: (m: string, o?: ToastOptions) => toast(m, { ...o, kind: 'info' }),
    /** Success toast with an Undo action. */
    undoable: (m: string, undoLabel: string, undo: () => void | Promise<void>) => toast(m, { kind: 'success', action: { label: undoLabel, run: undo } }),
    /** Delayed, cancellable commit with Undo (see `deferred`). */
    deferred,
  }
}
