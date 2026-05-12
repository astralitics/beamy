CREATE TABLE IF NOT EXISTS "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid,
	"trade" text,
	"quote_number" text,
	"quote_date" date,
	"valid_until" date,
	"subtotal_amount" numeric(14, 2),
	"iva_amount" numeric(14, 2),
	"total_amount" numeric(14, 2),
	"currency" text,
	"status" text DEFAULT 'received' NOT NULL,
	"decided_at" date,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_rooms" (
	"work_item_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "work_item_rooms_work_item_id_room_id_pk" PRIMARY KEY("work_item_id","room_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid,
	"vendor_id" uuid,
	"trade" text,
	"ref" text,
	"description" text NOT NULL,
	"qty" numeric(14, 4),
	"unit" text,
	"unit_price_amount" numeric(14, 2),
	"unit_price_currency" text,
	"total_amount" numeric(14, 2),
	"total_currency" text,
	"status" text DEFAULT 'specified' NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_rooms" ADD CONSTRAINT "work_item_rooms_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_rooms" ADD CONSTRAINT "work_item_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_by_project" ON "proposals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_by_vendor" ON "proposals" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_by_org_status" ON "proposals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_item_rooms_by_room" ON "work_item_rooms" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_project" ON "work_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_proposal" ON "work_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_vendor" ON "work_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_org_status" ON "work_items" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_by_org_planned_end" ON "work_items" USING btree ("org_id","planned_end");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_by_proposal" ON "documents" USING btree ("proposal_id");