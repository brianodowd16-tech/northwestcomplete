CREATE TABLE "sport_fixture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"sport" text NOT NULL,
	"league" text NOT NULL,
	"home" text NOT NULL,
	"away" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_mins" integer DEFAULT 120 NOT NULL,
	"score" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sport_fixture_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "auto_sports" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "sport_fixture_time" ON "sport_fixture" USING btree ("starts_at");