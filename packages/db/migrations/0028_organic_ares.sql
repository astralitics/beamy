DROP INDEX IF EXISTS "org_memberships_user_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_memberships_user_org_unique" ON "org_memberships" USING btree ("user_id","org_id");