-- ─────────────────────────────────────────────────────────────────
-- vendors repair (latent bug in 0003 / 0004)
--
-- Migrations 0003 ("vendors") and the vendor_contacts half of 0004
-- shipped with empty SQL bodies (drizzle-kit dropped the CREATE
-- TABLE statements). The Drizzle snapshots have always tracked these
-- tables as present, so `db:generate` thinks nothing's missing — but
-- a fresh `db:migrate` leaves the local DB without `vendors`,
-- `vendor_contacts`, or `vendor_compliance`, even though the schema
-- package, routers, and UI all reference them.
--
-- This section repairs forward: CREATE TABLE IF NOT EXISTS for all
-- three, plus their FKs (wrapped in DO blocks so duplicate-object
-- raises are swallowed) and indexes. Idempotent — safe to run in any
-- environment regardless of whether the tables already exist.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trade" text NOT NULL,
	"primary_contact" text,
	"email" text,
	"phone" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"default_rate_amount" numeric(14, 2),
	"default_rate_currency" text,
	"billing_unit" text DEFAULT 'hour' NOT NULL,
	"payment_terms" text,
	"ein" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_compliance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"effective_from" date,
	"expires_at" date,
	"coverage_amount" numeric(14, 2),
	"coverage_currency" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_compliance" ADD CONSTRAINT "vendor_compliance_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_compliance" ADD CONSTRAINT "vendor_compliance_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_by_org_status" ON "vendors" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_by_org_trade" ON "vendors" USING btree ("org_id","trade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_by_org_name" ON "vendors" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_contacts_by_vendor" ON "vendor_contacts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_compliance_by_vendor" ON "vendor_compliance" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_compliance_by_org_expires" ON "vendor_compliance" USING btree ("org_id","expires_at");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────
-- assets + materials (M2 recall layer)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"vendor_id" uuid,
	"category" text DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"install_date" date,
	"warranty_expires_at" date,
	"purchase_price_amount" numeric(14, 2),
	"purchase_price_currency" text,
	"photo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"vendor_id" uuid,
	"category" text DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text,
	"product_code" text,
	"color_name" text,
	"lot_number" text,
	"quantity" numeric(14, 3),
	"quantity_unit" text,
	"attic_stock_quantity" numeric(14, 3),
	"attic_stock_location" text,
	"coverage_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_by_project" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_by_room" ON "assets" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_by_org_category" ON "assets" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_by_project" ON "materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_by_room" ON "materials" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_by_org_category" ON "materials" USING btree ("org_id","category");