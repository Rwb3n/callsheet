CREATE TYPE "public"."enquiry_status" AS ENUM('unread', 'responded', 'stale');--> statement-breakpoint
ALTER TABLE "enquiry_records" ADD COLUMN "status" "enquiry_status" DEFAULT 'unread' NOT NULL;--> statement-breakpoint
CREATE INDEX "enquiry_records_listing_status_idx" ON "enquiry_records" USING btree ("listing_id","status");