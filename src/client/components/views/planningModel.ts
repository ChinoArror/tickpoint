// Shared mapping from /calendar payloads to dated planning items in the user's time zone.
// Exact deadlines are placed on their wall-clock day in the user's zone; date-only items use their date as-is.

import type { Checkpoint, Task } from '@/lib/types'
import { isoDateInZone, wallClockAt } from '@shared/time'

export interface CalendarPayload {
  tasks: Task[]
  checkpoints: (Checkpoint & { parentTitle?: string | null; projectId?: string | null })[]
  goals: { id: string; title: string; targetDate: string | null; status: string; projectId: string | null }[]
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** Calendar day (YYYY-MM-DD) that a task's deadline falls on, in the user's zone. */
export function taskDueDate(task: Task, tz: string): string | null {
  const d = task.due
  if (d.precision === 'unknown') return null
  if (d.precision === 'exact' && d.at != null) return isoDateInZone(d.at, tz)
  return d.date
}

/** HH:mm of an exact deadline in the user's zone. */
export function taskDueTime(task: Task, tz: string): string | null {
  if (task.due.precision !== 'exact' || task.due.at == null) return null
  const w = wallClockAt(task.due.at, tz)
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

export function isOpen(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'archived'
}

/** Overdue uses the server's sort anchor (end of the day for date-only deadlines). */
export function isOverdue(task: Task, now: number): boolean {
  return isOpen(task) && task.due.sortAt != null && task.due.sortAt < now
}

/** Whole-day difference between two ISO dates (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
