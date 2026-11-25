DROP INDEX "xero_sync_day";--> statement-breakpoint
ALTER TABLE "xero_sync" ADD COLUMN "target" text DEFAULT 'xero' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "xero_sync_day" ON "xero_sync" USING btree ("venue_id","target","business_date");