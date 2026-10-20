// Domain constants shared by the client and the Worker.

export const SUPPORTED_LOCALES = ['en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

/** Current Terms of Service version (the effective date). Changing it asks Android users to accept again. */
export const TERMS_VERSION = '2026-10-20'

export const TASK_KINDS = ['task', 'deadline'] as const
export type TaskKind = (typeof TASK_KINDS)[number]

export const TASK_STATUSES = ['not_started', 'in_progress', 'paused', 'completed', 'archived'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Statuses shown as Kanban columns. */
export const BOARD_STATUSES = ['not_started', 'in_progress', 'paused', 'completed'] as const

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

/**
 * Deadline precision.
 * - exact: date + time + IANA time zone are confirmed; dueAt is canonical.
 * - date: only a calendar date is known. No time is ever invented.
 * - approximate: an approximate date (e.g. "late October"); dueDate is a best anchor.
 * - unknown: a deadline exists but the date is not known yet.
 */
export const DUE_PRECISIONS = ['exact', 'date', 'approximate', 'unknown'] as const
export type DuePrecision = (typeof DUE_PRECISIONS)[number]

export const PROGRESS_MODES = ['manual', 'checkpoints', 'subtasks'] as const
export type ProgressMode = (typeof PROGRESS_MODES)[number]

export const GOAL_PROGRESS_MODELS = ['binary', 'percentage', 'quantity', 'time', 'checkpoint', 'weighted'] as const
export type GoalProgressModel = (typeof GOAL_PROGRESS_MODELS)[number]

export const GOAL_STATUSES = ['active', 'paused', 'completed', 'archived'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const REVIEW_FREQUENCIES = ['none', 'daily', 'weekly', 'biweekly', 'monthly'] as const
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number]

export const CHECKPOINT_STATUSES = ['pending', 'done', 'skipped'] as const
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number]

export const DEPENDENCY_TYPES = ['finish_to_start', 'blocked_by'] as const
export type DependencyType = (typeof DEPENDENCY_TYPES)[number]

export const REQUIREMENT_TYPES = [
  'mandatory',
  'optional',
  'criteria',
  'restriction',
  'eligibility',
  'prerequisite',
  'material',
] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]

export const REWARD_TYPES = ['monetary', 'prize', 'certificate', 'credit', 'recognition', 'other'] as const
export type RewardType = (typeof REWARD_TYPES)[number]

export const RISK_LEVELS = ['on_track', 'attention', 'at_risk', 'overdue', 'done', 'none'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

/** Preset reminder offsets in minutes before the due instant. */
export const REMINDER_PRESETS = [
  { key: '7d', minutes: 7 * 24 * 60 },
  { key: '3d', minutes: 3 * 24 * 60 },
  { key: '1d', minutes: 24 * 60 },
  { key: '12h', minutes: 12 * 60 },
  { key: '3h', minutes: 3 * 60 },
  { key: '1h', minutes: 60 },
  { key: '30m', minutes: 30 },
  { key: '15m', minutes: 15 },
  { key: '5m', minutes: 5 },
] as const

export const REMINDER_JOB_STATUSES = [
  'pending',
  'claimed',
  'sending',
  'sent',
  'retryable_failure',
  'permanent_failure',
  'cancelled',
] as const
export type ReminderJobStatus = (typeof REMINDER_JOB_STATUSES)[number]

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_VIEWS = ['list', 'board', 'calendar', 'timeline'] as const
export type DefaultView = (typeof DEFAULT_VIEWS)[number]

export const DATE_FORMATS = ['auto', 'ymd', 'mdy', 'dmy'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export const TIME_FORMATS = ['auto', 'h12', 'h24'] as const
export type TimeFormat = (typeof TIME_FORMATS)[number]

/** Limits shared by client validation and server enforcement. */
export const LIMITS = {
  titleMax: 300,
  descriptionMax: 20_000,
  notesMax: 20_000,
  listItemMax: 2_000,
  listMaxItems: 100,
  captureMinChars: 20,
  captureMaxChars: 60_000,
  aiRequestsPerHour: 30,
  aiRequestsPerDay: 150,
  attachmentMaxBytes: 10 * 1024 * 1024,
  importMaxBytes: 5 * 1024 * 1024,
  maxNestingDepth: 6,
  pageSizeDefault: 50,
  pageSizeMax: 200,
} as const

export const EXPORT_SCHEMA_VERSION = 1
