CREATE TABLE `native_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`installation_id` text NOT NULL,
	`platform` text DEFAULT 'android' NOT NULL,
	`fcm_token` text NOT NULL,
	`session_hash` text,
	`app_version` text,
	`locale` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_success_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_devices_installation_uq` ON `native_devices` (`installation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `native_devices_token_uq` ON `native_devices` (`fcm_token`);--> statement-breakpoint
CREATE INDEX `native_devices_owner_idx` ON `native_devices` (`owner_uuid`);--> statement-breakpoint
CREATE INDEX `native_devices_session_idx` ON `native_devices` (`session_hash`);--> statement-breakpoint
CREATE TABLE `native_logins` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`code_challenge` text NOT NULL,
	`return_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`code_hash` text,
	`jwt_enc` text,
	`user_uuid` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_logins_code_hash_unique` ON `native_logins` (`code_hash`);--> statement-breakpoint
CREATE INDEX `native_logins_created_idx` ON `native_logins` (`created_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `kind` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `terms_accepted_at` integer;