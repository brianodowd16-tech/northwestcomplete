ALTER TABLE "order_line" ALTER COLUMN "menu_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "song_request" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "song_request" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "song_request_cents" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "song_request_order" ON "song_request" USING btree ("order_id");