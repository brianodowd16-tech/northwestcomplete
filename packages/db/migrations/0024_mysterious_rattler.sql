CREATE TABLE "complete_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"meta" jsonb NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"provider_token" text,
	"idempotency_key" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complete_payment_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "complete_payment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "guest_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"period" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"sponsorship_id" uuid NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"event_date" date,
	"guests" integer,
	"message" text DEFAULT '' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsorship_id" uuid NOT NULL,
	"date" date NOT NULL,
	"placement" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsorship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"sponsor_venue_id" uuid NOT NULL,
	"title" text NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text DEFAULT 'Enquire' NOT NULL,
	"platinum_perk" text DEFAULT '' NOT NULL,
	"placements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsorship_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"venue_id" uuid,
	"order_id" uuid,
	"payment_id" uuid,
	"ref_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_ref_key_unique" UNIQUE("ref_key")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wallet_paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wallet_bonus_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "complete_payment" ADD CONSTRAINT "complete_payment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_membership" ADD CONSTRAINT "guest_membership_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_lead" ADD CONSTRAINT "sponsor_lead_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_lead" ADD CONSTRAINT "sponsor_lead_sponsorship_id_sponsorship_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorship"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_stat" ADD CONSTRAINT "sponsor_stat_sponsorship_id_sponsorship_id_fk" FOREIGN KEY ("sponsorship_id") REFERENCES "public"."sponsorship"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship" ADD CONSTRAINT "sponsorship_sponsor_venue_id_venue_id_fk" FOREIGN KEY ("sponsor_venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_membership_customer" ON "guest_membership" USING btree ("customer_id","ends_at");--> statement-breakpoint
CREATE INDEX "sponsor_lead_venue" ON "sponsor_lead" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_stat_day" ON "sponsor_stat" USING btree ("sponsorship_id","date","placement");--> statement-breakpoint
CREATE INDEX "wallet_ledger_customer" ON "wallet_ledger" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_venue" ON "wallet_ledger" USING btree ("venue_id","created_at");