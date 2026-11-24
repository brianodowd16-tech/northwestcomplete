CREATE TABLE "agent_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb,
	"allowed" boolean NOT NULL,
	"reasons" jsonb NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"max_order_cents" integer NOT NULL,
	"max_credit_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_grant_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "redemption_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_grant_id_agent_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."agent_grant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_grant" ADD CONSTRAINT "agent_grant_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_grant" ADD CONSTRAINT "agent_grant_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_venue" ON "agent_action" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_grant" ON "agent_action" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "agent_grant_customer" ON "agent_grant" USING btree ("customer_id");