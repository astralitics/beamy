CREATE TABLE IF NOT EXISTS "step_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"step_type" text NOT NULL,
	"summary" text,
	"config" jsonb,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "step_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"step_test_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"actual_output" jsonb,
	"verification_results" jsonb,
	"diff" jsonb,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "step_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"step_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"input_fixture" jsonb,
	"expected_output" jsonb,
	"expected_verifications" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"step_type" text NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"error" text,
	"step_order" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_version" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"inputs" jsonb,
	"outputs" jsonb,
	"paused_step_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"actor" text NOT NULL,
	"parent_run_id" uuid,
	"parent_step_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '0' NOT NULL,
	"owner_module" text DEFAULT 'workflow-studio' NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" text,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"trigger_config" jsonb,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "step_templates" ADD CONSTRAINT "step_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "step_test_runs" ADD CONSTRAINT "step_test_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "step_tests" ADD CONSTRAINT "step_tests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "step_templates_org_idx" ON "step_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "step_test_runs_test_idx" ON "step_test_runs" USING btree ("step_test_id","ran_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "step_tests_template_idx" ON "step_tests" USING btree ("step_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_run_idx" ON "workflow_run_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_org_idx" ON "workflow_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_name","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id","version_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_org_idx" ON "workflows" USING btree ("org_id","status");