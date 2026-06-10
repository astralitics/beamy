DROP INDEX IF EXISTS "org_memberships_user_unique";--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "kind" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "vertical" text DEFAULT 'construction' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "workspace_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vertical" text DEFAULT 'construction' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_memberships_user_org_unique" ON "org_memberships" USING btree ("user_id","org_id");