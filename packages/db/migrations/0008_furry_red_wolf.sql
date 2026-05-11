CREATE TABLE IF NOT EXISTS "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid,
	"bill_number" text,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"issued_at" date,
	"due_at" date,
	"paid_at" date,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid,
	"invoice_number" text,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"issued_at" date,
	"sent_at" date,
	"due_at" date,
	"paid_at" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_by_project" ON "bills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_by_vendor" ON "bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_by_org_status" ON "bills" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_by_org_due" ON "bills" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_by_project" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_by_client" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_by_org_status" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_by_org_due" ON "invoices" USING btree ("org_id","due_at");