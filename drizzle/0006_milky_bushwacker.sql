CREATE TYPE "public"."media_visibility" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TABLE "grace_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"paddle_subscription_id" text NOT NULL,
	"previous_tier" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "pending_cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paddle_subscription_id" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_paddle_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_profiles" ADD COLUMN "paddle_customer_id" text;--> statement-breakpoint
ALTER TABLE "credits" ADD COLUMN "visibility" "media_visibility" DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "paddle_subscription_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "paddle_customer_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "billing_cadence" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "subscription_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "subscription_end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "visibility" "media_visibility" DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "grace_periods" ADD CONSTRAINT "grace_periods_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_cancellations" ADD CONSTRAINT "pending_cancellations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grace_periods_listing_idx" ON "grace_periods" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "grace_periods_expires_active_idx" ON "grace_periods" USING btree ("expires_at") WHERE "grace_periods"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pending_cancellations_paddle_sub_idx" ON "pending_cancellations" USING btree ("paddle_subscription_id");