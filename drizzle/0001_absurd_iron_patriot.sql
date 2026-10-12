CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`wikidata_id` text,
	`source` text DEFAULT 'wikidata' NOT NULL,
	`community_name_key` text,
	`created_by` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`aliases` text NOT NULL,
	`website` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_wikidata_id_unique` ON `companies` (`wikidata_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_community_name_key_unique` ON `companies` (`community_name_key`);--> statement-breakpoint
CREATE TABLE `company_searches` (
	`query` text PRIMARY KEY NOT NULL,
	`result_ids` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `company_id` text REFERENCES companies(id);--> statement-breakpoint
ALTER TABLE `posts` ADD `company_status` text DEFAULT 'unlinked' NOT NULL;--> statement-breakpoint
CREATE INDEX `posts_company_idx` ON `posts` (`company_id`);