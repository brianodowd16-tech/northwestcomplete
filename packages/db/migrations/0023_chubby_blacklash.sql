CREATE TABLE "party_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"customer_id" uuid,
	"staff_id" uuid,
	"contact_name" text NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"occasion" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"guests" integer NOT NULL,
	"price_per_person_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"deposit_order_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_per_person_cents" integer NOT NULL,
	"min_guests" integer DEFAULT 1 NOT NULL,
	"max_guests" integer DEFAULT 200 NOT NULL,
	"deposit_per_person_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" smallint DEFAULT 9 NOT NULL,
	"min_notice_days" integer DEFAULT 2 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party_booking" ADD CONSTRAINT "party_booking_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_booking" ADD CONSTRAINT "party_booking_package_id_party_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."party_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_package" ADD CONSTRAINT "party_package_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_booking_venue_time" ON "party_booking" USING btree ("venue_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "party_booking_deposit" ON "party_booking" USING btree ("deposit_order_id");--> statement-breakpoint
CREATE INDEX "party_package_venue" ON "party_package" USING btree ("venue_id");