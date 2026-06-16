CREATE TABLE IF NOT EXISTS "workflow_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"webhook_token" text,
	"webhook_secret_enc" text,
	"signature_header" text,
	"next_due_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone,
	"last_fired_dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_triggers_token_idx" ON "workflow_triggers" USING btree ("webhook_token") WHERE "workflow_triggers"."webhook_token" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_triggers_workflow_type_idx" ON "workflow_triggers" USING btree ("workflow_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_triggers_scan_idx" ON "workflow_triggers" USING btree ("type","enabled","next_due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_triggers_org_idx" ON "workflow_triggers" USING btree ("org_id");