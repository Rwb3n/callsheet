ALTER TABLE "engagements" ADD COLUMN "last_viewer_account_id" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "last_profile_view_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "last_enquiry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "claim_submitted_at" timestamp with time zone;