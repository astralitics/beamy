ALTER TABLE "proposals" RENAME TO "bids";--> statement-breakpoint
ALTER TABLE "bids" RENAME COLUMN "quote_number" TO "bid_number";--> statement-breakpoint
ALTER TABLE "bids" RENAME COLUMN "quote_date" TO "bid_date";--> statement-breakpoint
ALTER TABLE "work_items" RENAME COLUMN "proposal_id" TO "bid_id";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "proposal_id" TO "bid_id";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_proposal_id_proposals_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "proposals_org_id_orgs_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "proposals_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "proposals_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_proposal_id_proposals_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_by_proposal";--> statement-breakpoint
DROP INDEX IF EXISTS "proposals_by_project";--> statement-breakpoint
DROP INDEX IF EXISTS "proposals_by_vendor";--> statement-breakpoint
DROP INDEX IF EXISTS "proposals_by_org_status";--> statement-breakpoint
DROP INDEX IF EXISTS "work_items_by_proposal";--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "iva_included" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_by_bid" ON "documents" USING btree ("bid_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_by_project" ON "bids" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_by_vendor" ON "bids" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_by_org_status" ON "bids" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_bid" ON "work_items" USING btree ("bid_id");
