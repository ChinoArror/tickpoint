import { z } from 'zod'
import {
  CHECKPOINT_STATUSES,
  DATE_FORMATS,
  DEFAULT_VIEWS,
  DEPENDENCY_TYPES,
  DUE_PRECISIONS,
  GOAL_PROGRESS_MODELS,
  GOAL_STATUSES,
  LIMITS,
  NOTIFICATION_CHANNELS,
  PRIORITIES,
  PROGRESS_MODES,
  REQUIREMENT_TYPES,
  REVIEW_FREQUENCIES,
  REWARD_TYPES,
  SUPPORTED_LOCALES,
  TASK_KINDS,
  TASK_STATUSES,
  THEMES,
  TIME_FORMATS,
} from './constants'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const idSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'INVALID_ID')

/** Calendar date, YYYY-MM-DD, validated as a real date. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'INVALID_DATE')

/** Wall-clock time, HH:mm (24h). */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'INVALID_TIME')

/** IANA time zone validated against the runtime's Intl database. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, 'INVALID_TIME_ZONE')

const title = z.string().trim().min(1, 'REQUIRED').max(LIMITS.titleMax)
const longText = z.string().max(LIMITS.descriptionMax)
const listItem = z.string().trim().min(1).max(LIMITS.listItemMax)
const httpUrl = z
  .string()
  .max(2048)
  .refine((u) => {
    try {
      const p = new URL(u)
      return p.protocol === 'https:' || p.protocol === 'http:'
    } catch {
      return false
    }
  }, 'INVALID_URL')

// ---------------------------------------------------------------------------
// Structured deadline details (shared with AI extraction confirmation)
// ---------------------------------------------------------------------------

export const locationSchema = z.object({
  physical: z.string().max(500).nullish(),
  building: z.string().max(200).nullish(),
  room: z.string().max(100).nullish(),
  campus: z.string().max(200).nullish(),
  online: z.string().max(1000).nullish(),
  contact: z.string().max(500).nullish(),
})
export type TaskLocation = z.infer<typeof locationSchema>

export const submissionSchema = z.object({
  method: z.string().max(500).nullish(),
  platform: z.string().max(200).nullish(),
  url: httpUrl.nullish(),
  destination: z.string().max(500).nullish(),
  fileFormats: z.array(z.string().max(40)).max(20).default([]),
  naming: z.string().max(500).nullish(),
  sizeLimit: z.string().max(100).nullish(),
  copies: z.string().max(100).nullish(),
  conditions: z.string().max(1000).nullish(),
})
export type TaskSubmission = z.infer<typeof submissionSchema>

export const requirementSchema = z.object({
  text: listItem,
  type: z.enum(REQUIREMENT_TYPES).default('mandatory'),
})
export type TaskRequirement = z.infer<typeof requirementSchema>

export const rewardSchema = z.object({
  text: listItem,
  type: z.enum(REWARD_TYPES).default('other'),
})
export type TaskReward = z.infer<typeof rewardSchema>

// ---------------------------------------------------------------------------
// Due specification. One shape for every precision; the server derives the
// canonical UTC instant (dueAt) and the sort/overdue anchor (dueSortAt).
// ---------------------------------------------------------------------------

export const dueSpecSchema = z
  .object({
    precision: z.enum(DUE_PRECISIONS),
    date: isoDateSchema.nullish(),
    time: timeSchema.nullish(),
    timeZone: timeZoneSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.precision === 'exact') {
      if (!v.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'REQUIRED' })
      if (!v.time) ctx.addIssue({ code: 'custom', path: ['time'], message: 'REQUIRED' })
      if (!v.timeZone) ctx.addIssue({ code: 'custom', path: ['timeZone'], message: 'REQUIRED' })
    }
    if ((v.precision === 'date' || v.precision === 'approximate') && !v.date) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'REQUIRED' })
    }
    if (v.precision !== 'exact' && v.time) {
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'TIME_REQUIRES_EXACT' })
    }
  })
export type DueSpec = z.infer<typeof dueSpecSchema>

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectCreateSchema = z.object({
  name: title,
  description: longText.nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  icon: z.string().max(40).nullish(),
})
export const projectUpdateSchema = projectCreateSchema.partial().extend({
  status: z.enum(['active', 'archived']).optional(),
  sortOrder: z.number().int().optional(),
})

// ---------------------------------------------------------------------------
// Tasks and deadlines
// ---------------------------------------------------------------------------

const taskFields = {
  kind: z.enum(TASK_KINDS),
  title,
  description: longText.nullish(),
  notes: z.string().max(LIMITS.notesMax).nullish(),
  projectId: idSchema.nullish(),
  goalId: idSchema.nullish(),
  parentId: idSchema.nullish(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  startDate: isoDateSchema.nullish(),
  scheduledDate: isoDateSchema.nullish(),
  due: dueSpecSchema.nullish(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullish(),
  actualMinutes: z.number().int().min(0).max(100_000).nullish(),
  progressPercent: z.number().min(0).max(100),
  progressMode: z.enum(PROGRESS_MODES),
  location: locationSchema.nullish(),
  submission: submissionSchema.nullish(),
  deliverables: z.array(listItem).max(LIMITS.listMaxItems),
  requirements: z.array(requirementSchema).max(LIMITS.listMaxItems),
  rewards: z.array(rewardSchema).max(LIMITS.listMaxItems),
  tagIds: z.array(idSchema).max(30),
}

export const taskCreateSchema = z.object({
  ...taskFields,
  kind: taskFields.kind.default('task'),
  status: taskFields.status.default('not_started'),
  priority: taskFields.priority.default('none'),
  progressPercent: taskFields.progressPercent.default(0),
  progressMode: taskFields.progressMode.default('manual'),
  deliverables: taskFields.deliverables.default([]),
  requirements: taskFields.requirements.default([]),
  rewards: taskFields.rewards.default([]),
  tagIds: taskFields.tagIds.default([]),
  /** Reminder offsets (minutes before due) to create with the task. */
  reminderOffsets: z.array(z.number().int().min(0).max(60 * 24 * 60)).max(12).optional(),
})
export type TaskCreateInput = z.infer<typeof taskCreateSchema>

export const taskUpdateSchema = z.object(taskFields).partial()
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>

export const taskListQuerySchema = z.object({
  view: z.enum(['all', 'inbox', 'today', 'upcoming', 'deadlines', 'overdue', 'completed', 'archived']).default('all'),
  projectId: idSchema.optional(),
  goalId: idSchema.optional(),
  parentId: z.union([idSchema, z.literal('root')]).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  kind: z.enum(TASK_KINDS).optional(),
  q: z.string().max(200).optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
  cursor: z.string().max(200).optional(),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>

export const taskMoveSchema = z.object({
  parentId: idSchema.nullable().optional(),
  projectId: idSchema.nullable().optional(),
  goalId: idSchema.nullable().optional(),
  /** Ordered sibling ids after the move (for reordering). */
  orderedSiblingIds: z.array(idSchema).max(500).optional(),
})

export const dependencyCreateSchema = z.object({
  dependsOnId: idSchema,
  type: z.enum(DEPENDENCY_TYPES).default('finish_to_start'),
  note: z.string().max(500).nullish(),
})

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalFields = {
  title,
  description: longText.nullish(),
  projectId: idSchema.nullish(),
  targetDate: isoDateSchema.nullish(),
  progressModel: z.enum(GOAL_PROGRESS_MODELS),
  currentValue: z.number().min(0).max(1e9),
  targetValue: z.number().positive().max(1e9).nullish(),
  unit: z.string().max(40).nullish(),
  weeklyEffortMinutes: z.number().int().min(0).max(10_080).nullish(),
  reviewFrequency: z.enum(REVIEW_FREQUENCIES),
  successCriteria: z.string().max(2000).nullish(),
  estimatedMinutes: z.number().int().min(0).max(1_000_000).nullish(),
  status: z.enum(GOAL_STATUSES),
}
export const goalCreateSchema = z
  .object({
    ...goalFields,
    progressModel: goalFields.progressModel.default('percentage'),
    currentValue: goalFields.currentValue.default(0),
    reviewFrequency: goalFields.reviewFrequency.default('weekly'),
    status: goalFields.status.default('active'),
  })
  .superRefine((v, ctx) => {
    if ((v.progressModel === 'quantity' || v.progressModel === 'time') && !v.targetValue) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'REQUIRED' })
    }
    if (v.progressModel === 'percentage' && v.currentValue > 100) {
      ctx.addIssue({ code: 'custom', path: ['currentValue'], message: 'OUT_OF_RANGE' })
    }
  })
export const goalUpdateSchema = z.object(goalFields).partial()

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

const checkpointFields = {
  taskId: idSchema.nullish(),
  goalId: idSchema.nullish(),
  title,
  description: z.string().max(4000).nullish(),
  completionCriteria: z.string().max(2000).nullish(),
  startDate: isoDateSchema.nullish(),
  targetDate: isoDateSchema.nullish(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullish(),
  weight: z.number().positive().max(1000),
  priority: z.enum(PRIORITIES),
  status: z.enum(CHECKPOINT_STATUSES),
}
export const checkpointCreateSchema = z
  .object({
    ...checkpointFields,
    weight: checkpointFields.weight.default(1),
    priority: checkpointFields.priority.default('none'),
    status: checkpointFields.status.default('pending'),
    dependsOnIds: z.array(idSchema).max(20).default([]),
  })
  .refine((v) => Boolean(v.taskId) !== Boolean(v.goalId), { message: 'EXACTLY_ONE_PARENT', path: ['taskId'] })
  .refine((v) => !v.startDate || !v.targetDate || v.startDate <= v.targetDate, {
    message: 'INVALID_RANGE',
    path: ['targetDate'],
  })
export const checkpointUpdateSchema = z
  .object({ ...checkpointFields, dependsOnIds: z.array(idSchema).max(20) })
  .omit({ taskId: true, goalId: true })
  .partial()
export const checkpointReorderSchema = z.object({ orderedIds: z.array(idSchema).min(1).max(500) })

// ---------------------------------------------------------------------------
// Progress entries
// ---------------------------------------------------------------------------

export const progressCreateSchema = z
  .object({
    taskId: idSchema.nullish(),
    goalId: idSchema.nullish(),
    checkpointId: idSchema.nullish(),
    /** Absolute new value: percent for tasks, model value for goals. */
    value: z.number().min(0).max(1e9).nullish(),
    /** Relative change (e.g. +20 pages). Mutually exclusive with value. */
    delta: z.number().min(-1e9).max(1e9).nullish(),
    minutes: z.number().int().min(0).max(24 * 60).nullish(),
    note: z.string().max(2000).nullish(),
    occurredAt: z.number().int().nullish(),
  })
  .refine((v) => [v.taskId, v.goalId, v.checkpointId].filter(Boolean).length === 1, {
    message: 'EXACTLY_ONE_TARGET',
  })
  .refine((v) => !(v.value != null && v.delta != null), { message: 'VALUE_OR_DELTA' })

// ---------------------------------------------------------------------------
// Reminders and notifications
// ---------------------------------------------------------------------------

export const reminderCreateSchema = z
  .object({
    taskId: idSchema.nullish(),
    goalId: idSchema.nullish(),
    checkpointId: idSchema.nullish(),
    kind: z.enum(['offset', 'absolute']),
    offsetMinutes: z.number().int().min(0).max(60 * 24 * 60).nullish(),
    absoluteAt: z.number().int().nullish(),
    channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3).default(['in_app', 'push', 'email']),
  })
  .refine((v) => [v.taskId, v.goalId, v.checkpointId].filter(Boolean).length === 1, {
    message: 'EXACTLY_ONE_TARGET',
  })
  .refine((v) => (v.kind === 'offset' ? v.offsetMinutes != null : v.absoluteAt != null), {
    message: 'REQUIRED',
    path: ['offsetMinutes'],
  })
export const reminderUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  offsetMinutes: z.number().int().min(0).max(60 * 24 * 60).optional(),
  absoluteAt: z.number().int().optional(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3).optional(),
})
export const snoozeSchema = z.object({ minutes: z.number().int().min(5).max(7 * 24 * 60) })

export const pushSubscriptionSchema = z.object({
  endpoint: httpUrl,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
})

/** Android installation id, generated and kept by the app. */
export const installationIdSchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/, 'INVALID_ID')

/** Register or refresh this Android installation for FCM pushes. */
export const deviceRegisterSchema = z.object({
  installationId: installationIdSchema,
  platform: z.literal('android'),
  fcmToken: z.string().min(20).max(4096),
  appVersion: z.string().max(40).nullish(),
  locale: z.enum(SUPPORTED_LOCALES).nullish(),
})
export type DeviceRegisterInput = z.infer<typeof deviceRegisterSchema>

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsUpdateSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES),
    timeZone: timeZoneSchema,
    dateFormat: z.enum(DATE_FORMATS),
    timeFormat: z.enum(TIME_FORMATS),
    theme: z.enum(THEMES),
    weekStart: z.number().int().min(0).max(6),
    defaultPriority: z.enum(PRIORITIES),
    defaultView: z.enum(DEFAULT_VIEWS),
    defaultReminderOffsets: z.array(z.number().int().min(0).max(60 * 24 * 60)).max(12),
    defaultEstimateMinutes: z.number().int().min(0).max(10_000).nullable(),
    showCompletedCheckpoints: z.boolean(),
    notifyInApp: z.boolean(),
    notifyPush: z.boolean(),
    notifyEmail: z.boolean(),
    quietHoursEnabled: z.boolean(),
    quietStart: timeSchema,
    quietEnd: timeSchema,
    aiEnabled: z.boolean(),
    aiSaveSourceDefault: z.boolean(),
    aiAvailableHoursPerDay: z.number().min(0.5).max(16),
    aiPlanningStyle: z.enum(['balanced', 'front_loaded', 'steady']),
  })
  .partial()
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>

// ---------------------------------------------------------------------------
// Smart Capture and AI
// ---------------------------------------------------------------------------

/** Language for AI-written text; defaults to the user's interface language when omitted. */
const outputLanguage = z.enum(SUPPORTED_LOCALES).nullish()

export const extractRequestSchema = z.object({
  outputLanguage,
  text: z.string().trim().min(LIMITS.captureMinChars, 'TOO_SHORT').max(LIMITS.captureMaxChars, 'TOO_LONG'),
  sourceTitle: z.string().max(300).nullish(),
  sourceUrl: httpUrl.nullish(),
  sourceDate: isoDateSchema.nullish(),
  context: z.string().max(2000).nullish(),
  projectId: idSchema.nullish(),
  /** Reference "now" in the user's zone so relative dates can be resolved when safe. */
  timeZone: timeZoneSchema.nullish(),
})
export type ExtractRequest = z.infer<typeof extractRequestSchema>

/** A record the user approved in the review screen. */
export const confirmedDeadlineSchema = z.object({
  label: title,
  due: dueSpecSchema,
  /** create: own deadline. checkpoint: checkpoint under the primary deadline. skip: ignore. */
  createAs: z.enum(['deadline', 'checkpoint', 'skip']),
  evidence: z.string().max(2000).nullish(),
})

export const extractConfirmSchema = z.object({
  draftId: idSchema,
  saveSource: z.boolean().default(true),
  primary: z.object({
    kind: z.enum(['deadline', 'goal', 'task']),
    title,
    description: longText.nullish(),
    projectId: idSchema.nullish(),
    priority: z.enum(PRIORITIES).default('none'),
    due: dueSpecSchema.nullish(),
    location: locationSchema.nullish(),
    submission: submissionSchema.nullish(),
    deliverables: z.array(listItem).max(LIMITS.listMaxItems).default([]),
    requirements: z.array(requirementSchema).max(LIMITS.listMaxItems).default([]),
    rewards: z.array(rewardSchema).max(LIMITS.listMaxItems).default([]),
    notes: z.string().max(LIMITS.notesMax).nullish(),
    estimatedMinutes: z.number().int().min(0).max(100_000).nullish(),
  }),
  additionalDeadlines: z.array(confirmedDeadlineSchema).max(20).default([]),
  checkpoints: z
    .array(
      z.object({
        title,
        description: z.string().max(4000).nullish(),
        completionCriteria: z.string().max(2000).nullish(),
        targetDate: isoDateSchema.nullish(),
        estimatedMinutes: z.number().int().min(0).max(100_000).nullish(),
      }),
    )
    .max(40)
    .default([]),
  reminderOffsets: z.array(z.number().int().min(0).max(60 * 24 * 60)).max(12).default([]),
})
export type ExtractConfirmInput = z.infer<typeof extractConfirmSchema>

export const planRequestSchema = z.object({
  outputLanguage,
  taskId: idSchema.nullish(),
  goalId: idSchema.nullish(),
  objective: z.string().max(4000).nullish(),
  hoursPerDay: z.number().min(0.5).max(16).nullish(),
  preferences: z.string().max(1000).nullish(),
  maxCheckpoints: z.number().int().min(2).max(20).default(8),
})

export const planRegenerateSchema = z.object({
  outputLanguage,
  /** Client ids of draft checkpoints to regenerate; all others are preserved verbatim. */
  checkpointIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  instructions: z.string().max(1000).nullish(),
  /** Must be true when any targeted checkpoint was edited manually. */
  overwriteEdited: z.boolean().default(false),
})

export const draftCheckpointSchema = z.object({
  clientId: z.string().min(1).max(64),
  title,
  description: z.string().max(4000).nullish(),
  completionCriteria: z.string().max(2000).nullish(),
  startDate: isoDateSchema.nullish(),
  targetDate: isoDateSchema.nullish(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullish(),
  priority: z.enum(PRIORITIES).default('none'),
  dependsOn: z.array(z.string().min(1).max(64)).max(20).default([]),
  reminderOffsetMinutes: z.number().int().min(0).max(60 * 24 * 60).nullish(),
  reasoning: z.string().max(1000).nullish(),
  /** True when a stated source requirement demands this step; false = optional suggestion. */
  fromSourceRequirement: z.boolean().default(false),
  origin: z.enum(['ai', 'user']).default('ai'),
  edited: z.boolean().default(false),
})
export type DraftCheckpoint = z.infer<typeof draftCheckpointSchema>

export const planDraftUpdateSchema = z.object({ checkpoints: z.array(draftCheckpointSchema).max(40) })
export const planConfirmSchema = z.object({ checkpoints: z.array(draftCheckpointSchema).min(1).max(40) })

export const analyzeRequestSchema = z.object({
  outputLanguage,
  taskId: idSchema.nullish(),
  goalId: idSchema.nullish(),
  scope: z.enum(['deadline', 'progress']).default('deadline'),
})

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const importModeSchema = z.object({
  mode: z.enum(['preview', 'commit']),
  skipDuplicates: z.boolean().default(true),
})
