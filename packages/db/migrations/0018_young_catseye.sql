CREATE TABLE IF NOT EXISTS "furniture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"room_id" uuid,
	"vendor_id" uuid,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"manufacturer" text,
	"model" text,
	"dimensions" text,
	"material" text,
	"finish" text,
	"designer" text,
	"delivery_date" date,
	"warranty_expires_at" date,
	"purchase_price_amount" numeric(14, 2),
	"purchase_price_currency" text,
	"product_url" text,
	"photo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "furniture_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"furniture_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" date NOT NULL,
	"vendor_id" uuid,
	"cost_amount" numeric(14, 2),
	"cost_currency" text,
	"bill_id" uuid,
	"summary" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture" ADD CONSTRAINT "furniture_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture" ADD CONSTRAINT "furniture_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture" ADD CONSTRAINT "furniture_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture" ADD CONSTRAINT "furniture_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture_events" ADD CONSTRAINT "furniture_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture_events" ADD CONSTRAINT "furniture_events_furniture_id_furniture_id_fk" FOREIGN KEY ("furniture_id") REFERENCES "public"."furniture"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture_events" ADD CONSTRAINT "furniture_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "furniture_events" ADD CONSTRAINT "furniture_events_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_by_project" ON "furniture" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_by_room" ON "furniture" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_by_org_category" ON "furniture" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_by_org_status" ON "furniture" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_events_by_furniture" ON "furniture_events" USING btree ("furniture_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "furniture_events_by_org" ON "furniture_events" USING btree ("org_id");