ALTER TABLE "workflow_run_steps" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "finished_at" timestamp with time zone;