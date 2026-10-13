CREATE TABLE `notification_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uuid` text NOT NULL,
	`address` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`verified_at` integer,
	`code_hash` text,
	`code_expires_at` integer,
	`code_attempts` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_emails_owner_addr_uq` ON `notification_emails` (`owner_uuid`,`address`);--> statement-breakpoint
CREATE INDEX `notification_emails_owner_idx` ON `notification_emails` (`owner_uuid`);--> statement-breakpoint
-- Email joins the default reminder channels (the per-user email setting remains the master switch).
UPDATE `reminder_rules` SET `channels` = '["in_app","push","email"]' WHERE `channels` = '["in_app","push"]';
