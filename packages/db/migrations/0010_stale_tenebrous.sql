CREATE TABLE "cash_up" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"staff_id" uuid,
	"float_cents" integer NOT NULL,
	"expected_cents" integer NOT NULL,
	"counted_cents" integer NOT NULL,
	"variance_cents" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"table_number" integer,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"method" text
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "allergens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tab_id" uuid;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "hours" jsonb;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "paused_until" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "tips_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_up" ADD CONSTRAINT "cash_up_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab" ADD CONSTRAINT "tab_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tab_venue_open" ON "tab" USING btree ("venue_id","closed_at");