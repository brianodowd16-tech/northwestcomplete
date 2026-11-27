CREATE INDEX "bill_split_group" ON "bill_split" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_member_customer" ON "group_member" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ledger_order" ON "loyalty_ledger" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "membership_customer" ON "membership" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "menu_item_venue" ON "menu_item" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "order_line_order" ON "order_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_venue_paid" ON "orders" USING btree ("venue_id","paid_at");--> statement-breakpoint
CREATE INDEX "orders_customer" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_session" ON "orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "orders_tab" ON "orders" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "otp_code_phone" ON "otp_code" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "staff_user_venue" ON "staff_user" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "webhook_event_order" ON "webhook_event" USING btree ("provider","provider_order_id");