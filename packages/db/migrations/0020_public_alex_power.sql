ALTER TABLE "rooms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "floor" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "floor_area_sqm" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "ceiling_height_m" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "photo_url" text;