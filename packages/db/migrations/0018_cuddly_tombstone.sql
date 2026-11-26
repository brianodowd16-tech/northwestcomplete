CREATE TABLE "control_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"device_id" uuid,
	"scene_id" uuid,
	"action" text NOT NULL,
	"value" text,
	"ok" boolean NOT NULL,
	"error" text,
	"run_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"zone" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"staff_allowed" boolean DEFAULT false NOT NULL,
	"min_temp" integer DEFAULT 17 NOT NULL,
	"max_temp" integer DEFAULT 24 NOT NULL,
	"max_volume" integer DEFAULT 80 NOT NULL,
	"missing_since" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_scene" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"at" text,
	"staff_allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_log" ADD CONSTRAINT "control_log_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_device" ADD CONSTRAINT "venue_device_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_scene" ADD CONSTRAINT "venue_scene_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_log_venue" ON "control_log" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "control_log_run" ON "control_log" USING btree ("run_key");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_device_ext" ON "venue_device" USING btree ("venue_id","provider","external_id");