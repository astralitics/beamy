ALTER TABLE "bids" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "supersedes_bid_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_supersedes_bid_id_bids_id_fk" FOREIGN KEY ("supersedes_bid_id") REFERENCES "public"."bids"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_by_supersedes" ON "bids" USING btree ("supersedes_bid_id");