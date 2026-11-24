ALTER TABLE "venue" ADD COLUMN "fpl_code" text;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "fpl_clicks" integer DEFAULT 0 NOT NULL;