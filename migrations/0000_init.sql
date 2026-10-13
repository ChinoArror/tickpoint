CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`changes` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_entity_idx` ON `activity_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_owner_idx` ON `activity_logs` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_extraction_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text NOT NULL,
	`source_text` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`model` text NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`confirmed_task_id` text,
	`confirmed_goal_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `extraction_owner_idx` ON `ai_extraction_drafts` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_planning_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text,
	`goal_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`checkpoints_json` text NOT NULL,
	`feasibility_json` text,
	`input_json` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`model` text NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `planning_owner_idx` ON `ai_planning_drafts` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_owner_idx` ON `ai_usage` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_task_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE INDEX `attachments_owner_idx` ON `attachments` (`owner_uuid`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`r2_key` text NOT NULL,
	`size` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backups_owner_idx` ON `backups` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `checkpoint_dependencies` (
	`owner_uuid` text NOT NULL,
	`checkpoint_id` text NOT NULL,
	`depends_on_id` text NOT NULL,
	PRIMARY KEY(`checkpoint_id`, `depends_on_id`),
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `checkpoints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `checkpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cp_deps_dep_idx` ON `checkpoint_dependencies` (`depends_on_id`);--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text,
	`goal_id` text,
	`title` text NOT NULL,
	`description` text,
	`completion_criteria` text,
	`start_date` text,
	`target_date` text,
	`estimated_minutes` integer,
	`weight` real DEFAULT 1 NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkpoints_task_idx` ON `checkpoints` (`task_id`);--> statement-breakpoint
CREATE INDEX `checkpoints_goal_idx` ON `checkpoints` (`goal_id`);--> statement-breakpoint
CREATE INDEX `checkpoints_owner_target_idx` ON `checkpoints` (`owner_uuid`,`target_date`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`target_date` text,
	`progress_model` text DEFAULT 'percentage' NOT NULL,
	`current_value` real DEFAULT 0 NOT NULL,
	`target_value` real,
	`unit` text,
	`weekly_effort_minutes` integer,
	`review_frequency` text DEFAULT 'weekly' NOT NULL,
	`success_criteria` text,
	`estimated_minutes` integer,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `goals_owner_idx` ON `goals` (`owner_uuid`,`status`);--> statement-breakpoint
CREATE INDEX `goals_project_idx` ON `goals` (`project_id`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`job_id` text,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`attempted_at` integer NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deliveries_job_idx` ON `notification_deliveries` (`job_id`);--> statement-breakpoint
CREATE INDEX `deliveries_owner_idx` ON `notification_deliveries` (`owner_uuid`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`job_id` text,
	`target_type` text,
	`target_id` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_owner_idx` ON `notifications` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_job_uq` ON `notifications` (`job_id`);--> statement-breakpoint
CREATE TABLE `progress_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text,
	`goal_id` text,
	`checkpoint_id` text,
	`kind` text NOT NULL,
	`previous_value` real,
	`new_value` real,
	`gain` real,
	`minutes` integer,
	`note` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `checkpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `progress_owner_time_idx` ON `progress_entries` (`owner_uuid`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `progress_task_idx` ON `progress_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `progress_goal_idx` ON `progress_entries` (`goal_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`icon` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_uuid`,`status`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_success_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_endpoint_uq` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_owner_idx` ON `push_subscriptions` (`owner_uuid`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `reminder_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`rule_id` text NOT NULL,
	`fire_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`claimed_at` integer,
	`next_attempt_at` integer,
	`last_error` text,
	`sent_at` integer,
	`dedupe_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `reminder_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_jobs_dedupe_uq` ON `reminder_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_due_idx` ON `reminder_jobs` (`status`,`fire_at`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_rule_idx` ON `reminder_jobs` (`rule_id`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_owner_idx` ON `reminder_jobs` (`owner_uuid`);--> statement-breakpoint
CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text,
	`goal_id` text,
	`checkpoint_id` text,
	`kind` text NOT NULL,
	`offset_minutes` integer,
	`absolute_at` integer,
	`channels` text DEFAULT '["in_app","push"]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `checkpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminder_rules_task_idx` ON `reminder_rules` (`task_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_goal_idx` ON `reminder_rules` (`goal_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_cp_idx` ON `reminder_rules` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_owner_idx` ON `reminder_rules` (`owner_uuid`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`jwt_enc` text NOT NULL,
	`jwt_exp` integer NOT NULL,
	`auth_session_id` text,
	`role` text DEFAULT 'user' NOT NULL,
	`identity_type` text DEFAULT 'user' NOT NULL,
	`scope_permissions` text,
	`last_verified_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`revoked_at` integer,
	`user_agent` text,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_uuid`);--> statement-breakpoint
CREATE INDEX `sessions_exp_idx` ON `sessions` (`jwt_exp`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`title` text,
	`url` text,
	`source_date` text,
	`context` text,
	`content` text,
	`content_chars` integer DEFAULT 0 NOT NULL,
	`language` text,
	`content_deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_owner_idx` ON `source_documents` (`owner_uuid`,`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name_uq` ON `tags` (`owner_uuid`,`name`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_id` text NOT NULL,
	`type` text DEFAULT 'finish_to_start' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_deps_uq` ON `task_dependencies` (`task_id`,`depends_on_id`);--> statement-breakpoint
CREATE INDEX `task_deps_owner_idx` ON `task_dependencies` (`owner_uuid`);--> statement-breakpoint
CREATE INDEX `task_deps_dep_idx` ON `task_dependencies` (`depends_on_id`);--> statement-breakpoint
CREATE TABLE `task_tags` (
	`owner_uuid` text NOT NULL,
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_tags_tag_idx` ON `task_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`project_id` text,
	`goal_id` text,
	`parent_id` text,
	`kind` text DEFAULT 'task' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`notes` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`previous_status` text,
	`priority` text DEFAULT 'none' NOT NULL,
	`start_date` text,
	`scheduled_date` text,
	`due_precision` text DEFAULT 'unknown' NOT NULL,
	`due_at` integer,
	`due_date` text,
	`due_time` text,
	`time_zone` text,
	`due_sort_at` integer,
	`estimated_minutes` integer,
	`actual_minutes` integer DEFAULT 0 NOT NULL,
	`progress_percent` real DEFAULT 0 NOT NULL,
	`progress_mode` text DEFAULT 'manual' NOT NULL,
	`location` text,
	`submission` text,
	`deliverables` text DEFAULT '[]' NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`rewards` text DEFAULT '[]' NOT NULL,
	`source_id` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_status_idx` ON `tasks` (`owner_uuid`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_owner_due_idx` ON `tasks` (`owner_uuid`,`due_sort_at`);--> statement-breakpoint
CREATE INDEX `tasks_owner_sched_idx` ON `tasks` (`owner_uuid`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_goal_idx` ON `tasks` (`goal_id`);--> statement-breakpoint
CREATE INDEX `tasks_completed_idx` ON `tasks` (`owner_uuid`,`completed_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`date_format` text DEFAULT 'auto' NOT NULL,
	`time_format` text DEFAULT 'auto' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	`default_priority` text DEFAULT 'none' NOT NULL,
	`default_view` text DEFAULT 'list' NOT NULL,
	`default_reminder_offsets` text DEFAULT '[1440,60]' NOT NULL,
	`default_estimate_minutes` integer,
	`show_completed_checkpoints` integer DEFAULT true NOT NULL,
	`notify_in_app` integer DEFAULT true NOT NULL,
	`notify_push` integer DEFAULT false NOT NULL,
	`notify_email` integer DEFAULT false NOT NULL,
	`quiet_hours_enabled` integer DEFAULT false NOT NULL,
	`quiet_start` text DEFAULT '22:00' NOT NULL,
	`quiet_end` text DEFAULT '07:00' NOT NULL,
	`ai_enabled` integer DEFAULT true NOT NULL,
	`ai_save_source_default` integer DEFAULT true NOT NULL,
	`ai_available_hours_per_day` real DEFAULT 3 NOT NULL,
	`ai_planning_style` text DEFAULT 'balanced' NOT NULL,
	`locale_explicit` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text,
	`username` text,
	`email` text,
	`avatar_url` text,
	`role` text DEFAULT 'user' NOT NULL,
	`identity_type` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_uq` ON `workspaces` (`owner_uuid`);