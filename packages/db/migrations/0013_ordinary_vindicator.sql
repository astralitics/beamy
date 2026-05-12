CREATE TABLE IF NOT EXISTS "proposal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"work_item_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"section_label" text,
	"display_description" text NOT NULL,
	"display_qty" numeric(14, 4),
	"display_unit" text,
	"display_unit_price" numeric(14, 2),
	"display_total" numeric(14, 2),
	"currency" text NOT NULL,
	"markup_pct_applied" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"intro_text" text,
	"status" text DEFAULT 'drafted' NOT NULL,
	"sent_at" date,
	"decided_at" date,
	"expires_at" date,
	"total_amount" numeric(14, 2),
	"total_currency" text,
	"notes" text,
	"generated_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "client_markup_pct" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "client_unit_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "client_total" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "client_currency" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_lines" ADD CONSTRAINT "proposal_lines_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_lines" ADD CONSTRAINT "proposal_lines_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "proposal_lines_by_proposal" ON "proposal_lines" USING btree ("proposal_id","display_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_lines_by_work_item" ON "proposal_lines" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_by_project" ON "proposals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_by_org_status" ON "proposals" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proposals_org_number_unique" ON "proposals" USING btree ("org_id","number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_by_proposal" ON "documents" USING btree ("proposal_id");