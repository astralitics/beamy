CREATE TABLE IF NOT EXISTS "spec_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"vendor_id" uuid,
	"spec_type" text DEFAULT 'asset' NOT NULL,
	"category" text,
	"name" text NOT NULL,
	"description" text,
	"state" text DEFAULT 'specified' NOT NULL,
	"catalog_price_amount" numeric(14, 2),
	"catalog_price_currency" text,
	"client_price_amount" numeric(14, 2),
	"client_price_currency" text,
	"approved_at" date,
	"ordered_at" date,
	"received_at" date,
	"installed_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spec_items" ADD CONSTRAINT "spec_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spec_items" ADD CONSTRAINT "spec_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spec_items" ADD CONSTRAINT "spec_items_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spec_items" ADD CONSTRAINT "spec_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec_items_by_project" ON "spec_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec_items_by_room" ON "spec_items" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec_items_by_org_state" ON "spec_items" USING btree ("org_id","state");