CREATE TABLE IF NOT EXISTS "change_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"work_item_id" uuid,
	"created_work_item_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"qty" numeric(14, 4),
	"unit" text,
	"unit_price_amount" numeric(14, 2),
	"unit_price_currency" text,
	"total_delta_amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'drafted' NOT NULL,
	"sent_at" date,
	"decided_at" date,
	"decided_by" text,
	"total_delta_amount" numeric(14, 2) NOT NULL,
	"total_delta_currency" text NOT NULL,
	"signed_document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "change_order_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_change_order_id_change_orders_id_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."change_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_created_work_item_id_work_items_id_fk" FOREIGN KEY ("created_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_order_lines_by_change_order" ON "change_order_lines" USING btree ("change_order_id","display_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_order_lines_by_work_item" ON "change_order_lines" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_by_project" ON "change_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_by_org_status" ON "change_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "change_orders_org_number_unique" ON "change_orders" USING btree ("org_id","number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_change_order_id_change_orders_id_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."change_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_by_change_order" ON "documents" USING btree ("change_order_id");