// D1 schema. Every user-owned table carries owner_uuid (the verified AuthCenter
// sub/uuid) and every query filters by it. Timestamps are UTC epoch milliseconds.

import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch('subsec') * 1000)`
const createdAt = () => integer('created_at').notNull().default(now)
const updatedAt = () => integer('updated_at').notNull().default(now)

// ---------------------------------------------------------------------------
// Identity and sessions
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  uuid: text('uuid').primaryKey(),
  name: text('name'),
  username: text('username'),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  identityType: text('identity_type').notNull().default('user'), // user | test
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSeenAt: integer('last_seen_at'),
})

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the opaque cookie value; the raw value never touches storage. */
    idHash: text('id_hash').primaryKey(),
    userUuid: text('user_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    /** AuthCenter JWT encrypted with AES-GCM (key derived from the app secret). */
    jwtEnc: text('jwt_enc').notNull(),
    jwtExp: integer('jwt_exp').notNull(),
    authSessionId: text('auth_session_id'),
    role: text('role').notNull().default('user'),
    identityType: text('identity_type').notNull().default('user'),
    /** JSON array of data_scope_permissions for test identities. */
    scopePermissions: text('scope_permissions'),
    lastVerifiedAt: integer('last_verified_at').notNull(),
    createdAt: createdAt(),
    revokedAt: integer('revoked_at'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userUuid), index('sessions_exp_idx').on(t.jwtExp)],
)

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('workspaces_owner_uq').on(t.ownerUuid)],
)

export const userSettings = sqliteTable('user_settings', {
  userUuid: text('user_uuid').primaryKey().references(() => users.uuid, { onDelete: 'cascade' }),
  locale: text('locale').notNull().default('en'),
  timeZone: text('time_zone').notNull().default('UTC'),
  dateFormat: text('date_format').notNull().default('auto'),
  timeFormat: text('time_format').notNull().default('auto'),
  theme: text('theme').notNull().default('system'),
  weekStart: integer('week_start').notNull().default(1),
  defaultPriority: text('default_priority').notNull().default('none'),
  defaultView: text('default_view').notNull().default('list'),
  defaultReminderOffsets: text('default_reminder_offsets').notNull().default('[1440,60]'),
  defaultEstimateMinutes: integer('default_estimate_minutes'),
  showCompletedCheckpoints: integer('show_completed_checkpoints', { mode: 'boolean' }).notNull().default(true),
  notifyInApp: integer('notify_in_app', { mode: 'boolean' }).notNull().default(true),
  notifyPush: integer('notify_push', { mode: 'boolean' }).notNull().default(false),
  notifyEmail: integer('notify_email', { mode: 'boolean' }).notNull().default(false),
  quietHoursEnabled: integer('quiet_hours_enabled', { mode: 'boolean' }).notNull().default(false),
  quietStart: text('quiet_start').notNull().default('22:00'),
  quietEnd: text('quiet_end').notNull().default('07:00'),
  aiEnabled: integer('ai_enabled', { mode: 'boolean' }).notNull().default(true),
  aiSaveSourceDefault: integer('ai_save_source_default', { mode: 'boolean' }).notNull().default(true),
  aiAvailableHoursPerDay: real('ai_available_hours_per_day').notNull().default(3),
  aiPlanningStyle: text('ai_planning_style').notNull().default('balanced'),
  /** Set once the user explicitly picks a locale; then it wins over browser detection. */
  localeExplicit: integer('locale_explicit', { mode: 'boolean' }).notNull().default(false),
  updatedAt: updatedAt(),
})

// ---------------------------------------------------------------------------
// Planning entities
// ---------------------------------------------------------------------------

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('projects_owner_idx').on(t.ownerUuid, t.status)],
)

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: text('target_date'),
    progressModel: text('progress_model').notNull().default('percentage'),
    currentValue: real('current_value').notNull().default(0),
    targetValue: real('target_value'),
    unit: text('unit'),
    weeklyEffortMinutes: integer('weekly_effort_minutes'),
    reviewFrequency: text('review_frequency').notNull().default('weekly'),
    successCriteria: text('success_criteria'),
    estimatedMinutes: integer('estimated_minutes'),
    actualMinutes: integer('actual_minutes').notNull().default(0),
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    completedAt: integer('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('goals_owner_idx').on(t.ownerUuid, t.status), index('goals_project_idx').on(t.projectId)],
)

export const sourceDocuments = sqliteTable(
  'source_documents',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    title: text('title'),
    url: text('url'),
    sourceDate: text('source_date'),
    context: text('context'),
    /** Original text. Nullable so it can be deleted independently of extracted records. */
    content: text('content'),
    contentChars: integer('content_chars').notNull().default(0),
    language: text('language'),
    contentDeletedAt: integer('content_deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('sources_owner_idx').on(t.ownerUuid, t.createdAt)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    parentId: text('parent_id'),
    kind: text('kind').notNull().default('task'),
    title: text('title').notNull(),
    description: text('description'),
    notes: text('notes'),
    status: text('status').notNull().default('not_started'),
    /** Status before archiving/pausing, so resume/unarchive restores it. */
    previousStatus: text('previous_status'),
    priority: text('priority').notNull().default('none'),
    startDate: text('start_date'),
    /** Day the user plans to work on it (Today view / calendar scheduling). */
    scheduledDate: text('scheduled_date'),
    duePrecision: text('due_precision').notNull().default('unknown'),
    dueAt: integer('due_at'),
    dueDate: text('due_date'),
    dueTime: text('due_time'),
    timeZone: text('time_zone'),
    dueSortAt: integer('due_sort_at'),
    estimatedMinutes: integer('estimated_minutes'),
    actualMinutes: integer('actual_minutes').notNull().default(0),
    progressPercent: real('progress_percent').notNull().default(0),
    progressMode: text('progress_mode').notNull().default('manual'),
    location: text('location'), // JSON
    submission: text('submission'), // JSON
    deliverables: text('deliverables').notNull().default('[]'), // JSON string[]
    requirements: text('requirements').notNull().default('[]'), // JSON {text,type}[]
    rewards: text('rewards').notNull().default('[]'), // JSON {text,type}[]
    sourceId: text('source_id').references(() => sourceDocuments.id, { onDelete: 'set null' }),
    sortOrder: real('sort_order').notNull().default(0),
    completedAt: integer('completed_at'),
    archivedAt: integer('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('tasks_owner_status_idx').on(t.ownerUuid, t.status),
    index('tasks_owner_due_idx').on(t.ownerUuid, t.dueSortAt),
    index('tasks_owner_sched_idx').on(t.ownerUuid, t.scheduledDate),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_goal_idx').on(t.goalId),
    index('tasks_completed_idx').on(t.ownerUuid, t.completedAt),
  ],
)

export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnId: text('depends_on_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('finish_to_start'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_deps_uq').on(t.taskId, t.dependsOnId),
    index('task_deps_owner_idx').on(t.ownerUuid),
    index('task_deps_dep_idx').on(t.dependsOnId),
  ],
)

export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    completionCriteria: text('completion_criteria'),
    startDate: text('start_date'),
    targetDate: text('target_date'),
    estimatedMinutes: integer('estimated_minutes'),
    weight: real('weight').notNull().default(1),
    priority: text('priority').notNull().default('none'),
    status: text('status').notNull().default('pending'),
    origin: text('origin').notNull().default('manual'), // manual | ai
    sortOrder: real('sort_order').notNull().default(0),
    completedAt: integer('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('checkpoints_task_idx').on(t.taskId),
    index('checkpoints_goal_idx').on(t.goalId),
    index('checkpoints_owner_target_idx').on(t.ownerUuid, t.targetDate),
  ],
)

export const checkpointDependencies = sqliteTable(
  'checkpoint_dependencies',
  {
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    checkpointId: text('checkpoint_id').notNull().references(() => checkpoints.id, { onDelete: 'cascade' }),
    dependsOnId: text('depends_on_id').notNull().references(() => checkpoints.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.checkpointId, t.dependsOnId] }), index('cp_deps_dep_idx').on(t.dependsOnId)],
)

export const progressEntries = sqliteTable(
  'progress_entries',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    checkpointId: text('checkpoint_id').references(() => checkpoints.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // value | delta | time | note | checkpoint
    previousValue: real('previous_value'),
    newValue: real('new_value'),
    /** Normalised progress gain (0-1 of the target) for forecasting. */
    gain: real('gain'),
    minutes: integer('minutes'),
    note: text('note'),
    occurredAt: integer('occurred_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('progress_owner_time_idx').on(t.ownerUuid, t.occurredAt),
    index('progress_task_idx').on(t.taskId),
    index('progress_goal_idx').on(t.goalId),
  ],
)

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tags_owner_name_uq').on(t.ownerUuid, t.name)],
)

export const taskTags = sqliteTable(
  'task_tags',
  {
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index('task_tags_tag_idx').on(t.tagId)],
)

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_task_idx').on(t.taskId), index('attachments_owner_idx').on(t.ownerUuid)],
)

// ---------------------------------------------------------------------------
// AI drafts and usage
// ---------------------------------------------------------------------------

export const aiExtractionDrafts = sqliteTable(
  'ai_extraction_drafts',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    sourceId: text('source_id').references(() => sourceDocuments.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'), // pending | confirmed | rejected
    /** Validated extraction JSON. Unconfirmed AI output; never treated as an official record. */
    resultJson: text('result_json').notNull(),
    /** Temporary copy of the source text while the draft is pending (for evidence display). */
    sourceText: text('source_text'),
    locale: text('locale').notNull().default('en'),
    model: text('model').notNull(),
    totalTokens: integer('total_tokens').notNull().default(0),
    confirmedTaskId: text('confirmed_task_id'),
    confirmedGoalId: text('confirmed_goal_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    confirmedAt: integer('confirmed_at'),
  },
  (t) => [index('extraction_owner_idx').on(t.ownerUuid, t.createdAt)],
)

export const aiPlanningDrafts = sqliteTable(
  'ai_planning_drafts',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    /** Draft checkpoints (DraftCheckpoint[]) including user edits. */
    checkpointsJson: text('checkpoints_json').notNull(),
    /** Feasibility / conflict report from the planner plus deterministic checks. */
    feasibilityJson: text('feasibility_json'),
    inputJson: text('input_json').notNull(),
    locale: text('locale').notNull().default('en'),
    model: text('model').notNull(),
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    confirmedAt: integer('confirmed_at'),
  },
  (t) => [index('planning_owner_idx').on(t.ownerUuid, t.createdAt)],
)

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    operation: text('operation').notNull(), // extract | plan | regenerate | analyze
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    status: text('status').notNull(), // ok | invalid_output | error | timeout | quota
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_owner_idx').on(t.ownerUuid, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Reminders and notifications
// ---------------------------------------------------------------------------

export const reminderRules = sqliteTable(
  'reminder_rules',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }),
    checkpointId: text('checkpoint_id').references(() => checkpoints.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // offset | absolute
    offsetMinutes: integer('offset_minutes'),
    absoluteAt: integer('absolute_at'),
    channels: text('channels').notNull().default('["in_app","push"]'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reminder_rules_task_idx').on(t.taskId),
    index('reminder_rules_goal_idx').on(t.goalId),
    index('reminder_rules_cp_idx').on(t.checkpointId),
    index('reminder_rules_owner_idx').on(t.ownerUuid),
  ],
)

export const reminderJobs = sqliteTable(
  'reminder_jobs',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    ruleId: text('rule_id').notNull().references(() => reminderRules.id, { onDelete: 'cascade' }),
    fireAt: integer('fire_at').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    claimToken: text('claim_token'),
    claimedAt: integer('claimed_at'),
    nextAttemptAt: integer('next_attempt_at'),
    lastError: text('last_error'),
    sentAt: integer('sent_at'),
    /** rule id + fire instant: prevents duplicate jobs for the same occurrence. */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('reminder_jobs_dedupe_uq').on(t.dedupeKey),
    index('reminder_jobs_due_idx').on(t.status, t.fireAt),
    index('reminder_jobs_rule_idx').on(t.ruleId),
    index('reminder_jobs_owner_idx').on(t.ownerUuid),
  ],
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    type: text('type').notNull(), // reminder | test | system
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    jobId: text('job_id'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    readAt: integer('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_owner_idx').on(t.ownerUuid, t.createdAt),
    uniqueIndex('notifications_job_uq').on(t.jobId),
  ],
)

export const notificationDeliveries = sqliteTable(
  'notification_deliveries',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    jobId: text('job_id'),
    channel: text('channel').notNull(),
    status: text('status').notNull(), // sent | failed | skipped
    detail: text('detail'),
    attemptedAt: integer('attempted_at').notNull(),
  },
  (t) => [
    index('deliveries_job_idx').on(t.jobId),
    index('deliveries_owner_idx').on(t.ownerUuid, t.attemptedAt),
  ],
)

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    failureCount: integer('failure_count').notNull().default(0),
    lastSuccessAt: integer('last_success_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_endpoint_uq').on(t.endpoint), index('push_owner_idx').on(t.ownerUuid)],
)

// ---------------------------------------------------------------------------
// Audit, backups, rate limiting
// ---------------------------------------------------------------------------

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    /** Field-level before/after JSON. Never contains credentials. */
    changes: text('changes'),
    actor: text('actor').notNull().default('user'), // user | ai_confirmed | system | import
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('activity_owner_idx').on(t.ownerUuid, t.createdAt),
  ],
)

export const backups = sqliteTable(
  'backups',
  {
    id: text('id').primaryKey(),
    ownerUuid: text('owner_uuid').notNull().references(() => users.uuid, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    size: integer('size').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('backups_owner_idx').on(t.ownerUuid, t.createdAt)],
)

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
)
