CREATE TABLE IF NOT EXISTS "workflow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"approvals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_jobs_claim_idx" ON "workflow_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_jobs_org_idx" ON "workflow_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_jobs_run_idx" ON "workflow_jobs" USING btree ("run_id");