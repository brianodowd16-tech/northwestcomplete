CREATE TABLE "rota_shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"role" text DEFAULT 'bar' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_unavailable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_user" ADD COLUMN "payroll_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "sunday_premium_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rota_shift" ADD CONSTRAINT "rota_shift_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rota_shift" ADD CONSTRAINT "rota_shift_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_unavailable" ADD CONSTRAINT "staff_unavailable_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_unavailable" ADD CONSTRAINT "staff_unavailable_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rota_shift_venue_time" ON "rota_shift" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_unavailable_day" ON "staff_unavailable" USING btree ("staff_id","date");