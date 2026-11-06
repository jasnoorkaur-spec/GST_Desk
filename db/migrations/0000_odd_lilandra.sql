CREATE TABLE `audit_events` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`action` varchar(60) NOT NULL,
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`purpose` enum('login_otp','password_reset') NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expires_at` timestamp NOT NULL,
	`resend_at` timestamp,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`business_name` varchar(180) NOT NULL DEFAULT '',
	`address` text,
	`gstin` varchar(15),
	`state` varchar(80),
	`state_code` varchar(2),
	`contact_number` varchar(24),
	`email` varchar(254),
	`bank_details` json,
	`logo_url` varchar(500),
	`invoice_prefix` varchar(20) NOT NULL DEFAULT 'INV',
	`next_invoice_number` int NOT NULL DEFAULT 1,
	`default_payment_terms` int NOT NULL DEFAULT 0,
	`default_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_profiles_user_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(180) NOT NULL,
	`mobile` varchar(24) NOT NULL,
	`email` varchar(254),
	`address` text,
	`state` varchar(80),
	`state_code` varchar(2),
	`gstin` varchar(15),
	`customer_type` enum('registered','unregistered') NOT NULL DEFAULT 'unregistered',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`product_id` varchar(36),
	`name` varchar(180) NOT NULL,
	`hsn` varchar(20),
	`description` text,
	`quantity` decimal(12,3) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`unit_price` decimal(14,2) NOT NULL,
	`discount` decimal(14,2) NOT NULL DEFAULT '0',
	`gst_rate` decimal(5,2) NOT NULL,
	`taxable` decimal(14,2) NOT NULL,
	`gst_amount` decimal(14,2) NOT NULL,
	`cgst` decimal(14,2) NOT NULL,
	`sgst` decimal(14,2) NOT NULL,
	`igst` decimal(14,2) NOT NULL,
	`total` decimal(14,2) NOT NULL,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`business_profile_id` varchar(36) NOT NULL,
	`customer_id` varchar(36),
	`invoice_number` varchar(40) NOT NULL,
	`status` enum('draft','finalized','cancelled') NOT NULL DEFAULT 'draft',
	`invoice_date` date NOT NULL,
	`due_date` date,
	`place_of_supply` varchar(80),
	`supply_state_code` varchar(2),
	`intra_state` boolean NOT NULL DEFAULT false,
	`doc_type` enum('tax_invoice','bill_of_supply') NOT NULL DEFAULT 'tax_invoice',
	`customer_snapshot` json NOT NULL,
	`business_snapshot` json NOT NULL,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0',
	`total_discount` decimal(14,2) NOT NULL DEFAULT '0',
	`taxable_value` decimal(14,2) NOT NULL DEFAULT '0',
	`total_gst` decimal(14,2) NOT NULL DEFAULT '0',
	`cgst` decimal(14,2) NOT NULL DEFAULT '0',
	`sgst` decimal(14,2) NOT NULL DEFAULT '0',
	`igst` decimal(14,2) NOT NULL DEFAULT '0',
	`other_charges` decimal(14,2) NOT NULL DEFAULT '0',
	`additional_discount` decimal(14,2) NOT NULL DEFAULT '0',
	`round_off` decimal(14,2) NOT NULL DEFAULT '0',
	`grand_total` decimal(14,2) NOT NULL DEFAULT '0',
	`payment_status` enum('unpaid','partially_paid','paid') NOT NULL DEFAULT 'unpaid',
	`notes` text,
	`terms` text,
	`amount_paid` decimal(14,2) NOT NULL DEFAULT '0',
	`finalized_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_business_number_uq` UNIQUE(`business_profile_id`,`invoice_number`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`method` varchar(40) NOT NULL DEFAULT 'other',
	`paid_at` timestamp NOT NULL DEFAULT (now()),
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`hsn` varchar(20),
	`price` decimal(14,2) NOT NULL,
	`gst_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`unit` varchar(32) NOT NULL DEFAULT 'pcs',
	`stock` decimal(12,3) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(254) NOT NULL,
	`mobile` varchar(24) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`mfa_enabled` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_profiles` ADD CONSTRAINT `business_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_business_profile_id_business_profiles_id_fk` FOREIGN KEY (`business_profile_id`) REFERENCES `business_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_user_entity_idx` ON `audit_events` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_purpose_idx` ON `auth_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `customers_user_idx` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoices_user_date_idx` ON `invoices` (`user_id`,`invoice_date`);--> statement-breakpoint
CREATE INDEX `invoices_customer_idx` ON `invoices` (`user_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `payments_user_invoice_idx` ON `payments` (`user_id`,`invoice_id`);--> statement-breakpoint
CREATE INDEX `products_user_idx` ON `products` (`user_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`user_id`,`name`);