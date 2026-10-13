import { reactive } from 'vue'

export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** When set, the user must type this word to enable the confirm button. */
  typeToConfirm?: string
}

export const confirmState = reactive<{ open: boolean; req: ConfirmRequest | null; resolve: ((v: boolean) => void) | null }>({
  open: false,
  req: null,
  resolve: null,
})

/** Promise-based accessible confirmation dialog (rendered once by <ConfirmHost/>). */
export function confirm(req: ConfirmRequest): Promise<boolean> {
  confirmState.resolve?.(false)
  return new Promise((resolve) => {
    confirmState.req = req
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

export function settleConfirm(v: boolean) {
  confirmState.resolve?.(v)
  confirmState.resolve = null
  confirmState.open = false
}
