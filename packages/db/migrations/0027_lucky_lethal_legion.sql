ALTER TABLE "invitations" ADD COLUMN "kind" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "vertical" text DEFAULT 'construction' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "workspace_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vertical" text DEFAULT 'construction' NOT NULL;