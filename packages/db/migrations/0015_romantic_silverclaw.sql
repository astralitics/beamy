CREATE TABLE IF NOT EXISTS "work_item_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	"kind" text DEFAULT 'finish_to_start' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "work_item_dependencies_no_self_ref" CHECK ("work_item_dependencies"."work_item_id" <> "work_item_dependencies"."depends_on_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_depends_on_id_work_items_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_item_dependencies_by_work_item" ON "work_item_dependencies" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_item_dependencies_by_depends_on" ON "work_item_dependencies" USING btree ("depends_on_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_item_dependencies_unique_pair" ON "work_item_dependencies" USING btree ("work_item_id","depends_on_id");