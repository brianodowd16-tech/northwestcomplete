CREATE TABLE "partner_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"ref" text,
	"status" text NOT NULL,
	"guest_name" text NOT NULL,
	"email" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_booking" ADD CONSTRAINT "partner_booking_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_booking_ext" ON "partner_booking" USING btree ("venue_id","source","external_id");--> statement-breakpoint
CREATE INDEX "partner_booking_when" ON "partner_booking" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE INDEX "partner_booking_email" ON "partner_booking" USING btree ("email");