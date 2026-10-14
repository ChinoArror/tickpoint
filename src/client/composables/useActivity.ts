import { reactive } from 'vue'

export interface ActivityItem {
  id: number
  label: string
  /** 0-100 when known, null for indeterminate work. */
  progress: number | null
  detail?: string
  shownAt: number
}

export type ActivityReporter = (progress: number | null, detail?: string) => void

export const activities = reactive<ActivityItem[]>([])
let seq = 0

const MIN_VISIBLE_MS = 500

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `fn` and, only when it takes longer than `delay`, shows a live indicator
 * (bottom-right, rendered by <ActivityHost/>) for as long as it runs. Once shown the
 * indicator stays for at least 500ms so it never flickers. Errors are rethrown.
 */
export async function runActivity<T>(
  label: string,
  fn: (report: ActivityReporter) => Promise<T>,
  opts: { delay?: number } = {},
): Promise<T> {
  const delay = opts.delay ?? 400
  const item = reactive<ActivityItem>({ id: ++seq, label, progress: null, detail: undefined, shownAt: 0 })
  const report: ActivityReporter = (progress, detail) => {
    item.progress = progress == null ? null : Math.min(100, Math.max(0, Math.round(progress)))
    item.detail = detail
  }

  let shown = false
  const timer = setTimeout(() => {
    shown = true
    item.shownAt = Date.now()
    activities.push(item)
  }, delay)

  try {
    return await fn(report)
  } finally {
    clearTimeout(timer)
    if (shown) {
      const wait = MIN_VISIBLE_MS - (Date.now() - item.shownAt)
      if (wait > 0) await sleep(wait)
      const i = activities.indexOf(item)
      if (i >= 0) activities.splice(i, 1)
    }
  }
}
