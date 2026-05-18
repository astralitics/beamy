CREATE TABLE IF NOT EXISTS "bid_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text,
	"status" text DEFAULT 'open' NOT NULL,
	"awarded_bid_id" uuid,
	"awarded_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "package_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_packages_by_project" ON "bid_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_packages_by_org_status" ON "bid_packages" USING btree ("org_id","status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_package_id_bid_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."bid_packages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_by_package" ON "bids" USING btree ("package_id");