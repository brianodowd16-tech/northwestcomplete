CREATE TABLE "venue_integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"secret_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" text NOT NULL,
	"invoice_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_txn_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "payment_provider" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "venue_integration" ADD CONSTRAINT "venue_integration_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xero_sync" ADD CONSTRAINT "xero_sync_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_integration_kind" ON "venue_integration" USING btree ("venue_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "xero_sync_day" ON "xero_sync" USING btree ("venue_id","business_date");