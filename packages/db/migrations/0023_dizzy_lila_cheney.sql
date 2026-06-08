ALTER TABLE "invoices" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_lines" ADD COLUMN "room_names" text[];--> statement-breakpoint
ALTER TABLE "proposal_lines" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "proposal_lines" ADD COLUMN "trade" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "subtotal_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "overall_markup_pct" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "discount_pct" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "discount_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "group_by" text DEFAULT 'work_type';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_by_proposal" ON "invoices" USING btree ("proposal_id");