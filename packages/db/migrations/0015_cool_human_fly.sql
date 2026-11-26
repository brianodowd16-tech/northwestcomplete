CREATE TABLE "bill_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'owed' NOT NULL,
	"settled_at" timestamp with time zone,
	"reminded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bill_split" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"session_id" uuid,
	"venue_id" uuid,
	"order_id" uuid,
	"title" text NOT NULL,
	"paid_by" uuid NOT NULL,
	"total_cents" integer NOT NULL,
	"method" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"customer_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"reported_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"booking_id" uuid,
	"created_by" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"playlist_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_group_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "session_rsvp" (
	"session_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"venue_id" uuid,
	"source_key" text NOT NULL,
	"channels" jsonb NOT NULL,
	"text" text NOT NULL,
	"link" text,
	"collaborators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_title" text DEFAULT '' NOT NULL,
	"image_subtitle" text DEFAULT '' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"session_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"link" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "leaderboard_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "leaderboard_name" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "revolut_handle" text;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "country" text DEFAULT 'IE' NOT NULL;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "share_network" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "song_requests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_event" ADD COLUMN "partner_venue_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_share" ADD CONSTRAINT "bill_share_split_id_bill_split_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_split"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_share" ADD CONSTRAINT "bill_share_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split" ADD CONSTRAINT "bill_split_group_id_guest_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."guest_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split" ADD CONSTRAINT "bill_split_paid_by_customer_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_guest_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."guest_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message" ADD CONSTRAINT "group_message_group_id_guest_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."guest_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message" ADD CONSTRAINT "group_message_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session" ADD CONSTRAINT "group_session_group_id_guest_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."guest_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session" ADD CONSTRAINT "group_session_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_session" ADD CONSTRAINT "group_session_created_by_customer_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_group" ADD CONSTRAINT "guest_group_created_by_customer_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rsvp" ADD CONSTRAINT "session_rsvp_session_id_group_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."group_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_rsvp" ADD CONSTRAINT "session_rsvp_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_request" ADD CONSTRAINT "song_request_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_share_unique" ON "bill_share" USING btree ("split_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_member_unique" ON "group_member" USING btree ("group_id","customer_id");--> statement-breakpoint
CREATE INDEX "group_message_group" ON "group_message" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "group_session_group" ON "group_session" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_rsvp_unique" ON "session_rsvp" USING btree ("session_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_source" ON "social_post" USING btree ("venue_id","source_key");--> statement-breakpoint
CREATE INDEX "social_post_due" ON "social_post" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "song_request_venue" ON "song_request" USING btree ("venue_id","created_at");