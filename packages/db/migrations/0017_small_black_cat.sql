ALTER TABLE "asset_events" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
