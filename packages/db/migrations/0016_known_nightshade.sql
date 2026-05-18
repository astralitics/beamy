CREATE TABLE IF NOT EXISTS "asset_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" date NOT NULL,
	"vendor_id" uuid,
	"cost_amount" numeric(14, 2),
	"cost_currency" text,
	"summary" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" text DEFAULT 'installed' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "product_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_events_by_asset" ON "asset_events" USING btree ("asset_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_events_by_org" ON "asset_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_by_org_status" ON "assets" USING btree ("org_id","status");