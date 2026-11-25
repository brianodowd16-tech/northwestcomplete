CREATE TABLE "app_error" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"period" text NOT NULL,
	"number" text NOT NULL,
	"statement" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text,
	"reply_to" text,
	"attachments" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "venue_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"key" text NOT NULL,
	"severity" text DEFAULT 'warn' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"href" text DEFAULT '' NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_token" ADD CONSTRAINT "staff_token_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_alert" ADD CONSTRAINT "venue_alert_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoice_period" ON "billing_invoice" USING btree ("venue_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_dedupe" ON "email_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_outbox_due" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_alert_key" ON "venue_alert" USING btree ("venue_id","key");