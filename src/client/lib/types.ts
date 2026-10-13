// Client-side DTO types mirroring the API responses.

import type { RiskReason } from '@shared/insights'
import type { DraftCheckpoint, TaskLocation, TaskRequirement, TaskReward, TaskSubmission } from '@shared/schemas'

export type { DraftCheckpoint, RiskReason, TaskLocation, TaskRequirement, TaskReward, TaskSubmission }

export interface Due {
  precision: 'exact' | 'date' | 'approximate' | 'unknown'
  at: number | null
  date: string | null
  time: string | null
  timeZone: string | null
  sortAt: number | null
}

export interface Risk {
  level: 'on_track' | 'attention' | 'at_risk' | 'overdue' | 'done' | 'none'
  reasons: RiskReason[]
  remainingEffortMinutes: number | null
  availableMinutes: number | null
  expectedProgress: number | null
}

export interface Task {
  id: string
  kind: 'task' | 'deadline'
  title: string
  description: string | null
  notes: string | null
  projectId: string | null
  goalId: string | null
  parentId: string | null
  status: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'archived'
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent'
  startDate: string | null
  scheduledDate: string | null
  due: Due
  estimatedMinutes: number | null
  actualMinutes: number
  progressPercent: number
  progressMode: 'manual' | 'checkpoints' | 'subtasks'
  location: TaskLocation | null
  submission: TaskSubmission | null
  deliverables: string[]
  requirements: TaskRequirement[]
  rewards: TaskReward[]
  sourceId: string | null
  sortOrder: number
  completedAt: number | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
  tagIds: string[]
  counts: { checkpoints: number; checkpointsDone: number; subtasks: number; subtasksDone: number; openDependencies: number }
  risk: Risk
}

export interface Checkpoint {
  id: string
  taskId: string | null
  goalId: string | null
  title: string
  description: string | null
  completionCriteria: string | null
  startDate: string | null
  targetDate: string | null
  estimatedMinutes: number | null
  weight: number
  priority: Task['priority']
  status: 'pending' | 'done' | 'skipped'
  origin: 'manual' | 'ai'
  sortOrder: number
  completedAt: number | null
  dependsOnIds: string[]
  createdAt: number
  updatedAt: number
  parentTitle?: string | null
  projectId?: string | null
}

export interface ReminderJob {
  id: string
  fireAt: number
  status: string
  sentAt: number | null
  attempts: number
}

export interface ReminderRule {
  id: string
  kind: 'offset' | 'absolute'
  offsetMinutes: number | null
  absoluteAt: number | null
  channels: ('in_app' | 'push' | 'email')[]
  enabled: boolean
  jobs?: ReminderJob[]
}

export interface HistoryEntry {
  id: string
  action: string
  actor: 'user' | 'ai_confirmed' | 'system' | 'import'
  changes: Record<string, unknown> | null
  createdAt: number
}

export interface TaskDetail extends Task {
  subtasks: Task[]
  checkpoints: Checkpoint[]
  dependencies: { id: string; dependsOnId: string; type: string; note: string | null; title: string; status: string }[]
  dependents: { taskId: string; title: string; status: string }[]
  reminders: ReminderRule[]
  attachments: { id: string; filename: string; contentType: string; size: number; createdAt: number }[]
  history: HistoryEntry[]
  source: { id: string; title: string | null; url: string | null; sourceDate: string | null; contentChars: number; contentDeletedAt: number | null; createdAt: number } | null
}

export interface GoalHealth {
  actual: number
  expected: number | null
  deviation: number | null
  remaining: number | null
  activeDays28: number
  consistency: number
  outlook: 'completed' | 'ahead' | 'on_pace' | 'behind' | 'insufficient_data' | 'consistent' | 'irregular' | 'inactive'
  projectedCompletionAt: number | null
}

export interface Goal {
  id: string
  title: string
  description: string | null
  projectId: string | null
  targetDate: string | null
  progressModel: 'binary' | 'percentage' | 'quantity' | 'time' | 'checkpoint' | 'weighted'
  currentValue: number
  targetValue: number | null
  unit: string | null
  weeklyEffortMinutes: number | null
  reviewFrequency: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  successCriteria: string | null
  estimatedMinutes: number | null
  actualMinutes: number
  status: 'active' | 'paused' | 'completed' | 'archived'
  sortOrder: number
  completedAt: number | null
  createdAt: number
  updatedAt: number
  health: GoalHealth
}

export interface ProgressEntry {
  id: string
  taskId: string | null
  goalId: string | null
  checkpointId: string | null
  kind: string
  previousValue: number | null
  newValue: number | null
  minutes: number | null
  note: string | null
  occurredAt: number
  title?: string | null
}

export interface GoalDetail extends Goal {
  checkpoints: Checkpoint[]
  tasks: Task[]
  progress: ProgressEntry[]
  history: HistoryEntry[]
  reminders: ReminderRule[]
}

export interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  status: 'active' | 'archived'
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Tag {
  id: string
  name: string
  color: string | null
}

export interface Settings {
  locale: 'en' | 'ja'
  localeExplicit: boolean
  timeZone: string
  dateFormat: 'auto' | 'ymd' | 'mdy' | 'dmy'
  timeFormat: 'auto' | 'h12' | 'h24'
  theme: 'system' | 'light' | 'dark'
  weekStart: number
  defaultPriority: Task['priority']
  defaultView: 'list' | 'board' | 'calendar' | 'timeline'
  defaultReminderOffsets: number[]
  defaultEstimateMinutes: number | null
  showCompletedCheckpoints: boolean
  notifyInApp: boolean
  notifyPush: boolean
  notifyEmail: boolean
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  aiEnabled: boolean
  aiSaveSourceDefault: boolean
  aiAvailableHoursPerDay: number
  aiPlanningStyle: 'balanced' | 'front_loaded' | 'steady'
}

export interface Me {
  user: { uuid: string; name: string | null; username: string | null; email: string | null; avatarUrl: string | null; role: 'admin' | 'user'; identityType: 'user' | 'test' }
  settings: Settings
  profileUrl: string
  serverTime: number
}

export interface PublicConfig {
  appId: string
  authBaseUrl: string
  devBypass: boolean
  vapidPublicKey: string | null
  emailConfigured: boolean
  aiConfigured: boolean
}

export interface AppNotification {
  id: string
  type: 'reminder' | 'test' | 'system'
  title: string
  body: string | null
  link: string | null
  jobId: string | null
  targetType: string | null
  targetId: string | null
  readAt: number | null
  createdAt: number
}

export interface Dashboard {
  today: string
  timeZone: string
  todayTasks: Task[]
  todayCheckpoints: Checkpoint[]
  upcoming: Task[]
  attention: Task[]
  goals: Goal[]
  recentProgress: ProgressEntry[]
  recentCheckpoints: { id: string; title: string; completedAt: number | null; taskId: string | null; goalId: string | null }[]
  week: { completed: number; dueSoon: number; created: number }
}

// ---- Smart Capture -------------------------------------------------------

export type Certainty = 'explicit' | 'inferred'

export interface ExtractedDeadline {
  id: string
  label: string
  kind: string
  date: string | null
  time: string | null
  endTime: string | null
  timezone: string | null
  precision: Due['precision']
  isPrimary: boolean
  certainty: Certainty
  confidence: number
  evidence: string | null
  evidenceVerified: boolean
  issues: string[]
}

export interface ExtractionResult {
  title: string | null
  summary: string | null
  category: string
  organization: string | null
  people: { name: string; role: string | null; contact: string | null }[]
  sourceLanguage: string
  deadlines: ExtractedDeadline[]
  locations: { id: string; kind: string; value: string; building: string | null; room: string | null; campus: string | null; url: string | null; certainty: Certainty; evidence: string | null; evidenceVerified: boolean }[]
  deliverables: { id: string; text: string; format: string | null; quantity: string | null; certainty: Certainty; evidence: string | null; evidenceVerified: boolean }[]
  submission: { method: string | null; platform: string | null; url: string | null; destination: string | null; fileFormats: string[]; naming: string | null; sizeLimit: string | null; copies: string | null; conditions: string | null; evidence: string | null }
  submissionEvidenceVerified: boolean
  requirements: { id: string; text: string; type: TaskRequirement['type']; certainty: Certainty; evidence: string | null; evidenceVerified: boolean }[]
  rewards: { id: string; text: string; type: TaskReward['type']; evidence: string | null; evidenceVerified: boolean }[]
  ambiguities: { id: string; kind: string; field: string; description: string; options: string[]; evidence: string | null }[]
  suggestedTasks: { title: string; description: string | null; estimatedMinutes: number | null }[]
  suggestedCheckpoints: { title: string; completionCriteria: string | null; targetDate: string | null; estimatedMinutes: number | null }[]
  warnings: string[]
}

export interface ExtractionResponse {
  draftId: string
  result: ExtractionResult
  meta: { sourceTitle: string | null; sourceUrl: string | null; sourceDate: string | null; context: string | null; projectId: string | null; timeZone: string }
  model: string
  sourceText?: string | null
  status?: string
}

export interface PlanCheck {
  code: string
  refs: string[]
  params?: Record<string, number | string>
}

export interface Feasibility {
  feasible: boolean
  aiFeasible: boolean | null
  summary: string | null
  conflicts: { description: string; refs: string[] }[]
  checks: PlanCheck[]
  totalEstimatedMinutes: number
  availableMinutes: number | null
}

export interface PlanDraft {
  draftId: string
  status?: string
  taskId?: string | null
  goalId?: string | null
  checkpoints: DraftCheckpoint[]
  feasibility: Feasibility | null
  model?: string
  notes?: string
}

/** A notification email recipient. The account email (source 'account') is always present by default. */
export interface Recipient {
  id: string
  address: string
  source: 'account' | 'user'
  verified: boolean
  verifiedAt: number | null
  enabled: boolean
  pendingVerification: boolean
  lastSentAt: number | null
  createdAt: number
}

export interface AiQuota {
  status: 'ok' | 'QUOTA_EXCEEDED' | 'AI_FORBIDDEN' | 'QUOTA_CHECK_FAILED' | 'NOT_CONFIGURED'
  unlimited: boolean
  remainingTokens: number | null
  remainingRequests: number | null
  testSession: boolean
  quota: Record<string, unknown> | null
  local: { requestsPerHour: number; requestsPerDay: number }
  details?: { retryAfterSeconds?: number } | null
}

export interface Paged<T> {
  items: T[]
  nextCursor: string | null
}
