import { reactive } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; run: () => void | Promise<void> }
  timeout: number
}

export const toasts = reactive<Toast[]>([])
let seq = 0

export function toast(message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  const t: Toast = { id: ++seq, kind: opts.kind ?? 'info', message, action: opts.action, timeout: opts.timeout ?? (opts.action ? 6000 : 3500) }
  toasts.push(t)
  if (toasts.length > 4) toasts.shift()
  setTimeout(() => dismissToast(t.id), t.timeout)
  return t.id
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

export function useToast() {
  return {
    success: (m: string, o?: Partial<Toast>) => toast(m, { ...o, kind: 'success' }),
    error: (m: string, o?: Partial<Toast>) => toast(m, { ...o, kind: 'error' }),
    info: (m: string, o?: Partial<Toast>) => toast(m, { ...o, kind: 'info' }),
    /** Success toast with an Undo action. */
    undoable: (m: string, undoLabel: string, undo: () => void | Promise<void>) => toast(m, { kind: 'success', action: { label: undoLabel, run: undo } }),
  }
}
