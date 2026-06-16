CREATE TABLE IF NOT EXISTS "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"secret_enc" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connections_org_idx" ON "connections" USING btree ("org_id");