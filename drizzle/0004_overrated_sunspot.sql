CREATE TYPE "public"."correspondence_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."correspondence_status" AS ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'received', 'suppressed');--> statement-breakpoint
CREATE TABLE "correspondence_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"in_reply_to" uuid,
	"direction" "correspondence_direction" NOT NULL,
	"status" "correspondence_status" NOT NULL,
	"account_id" text,
	"listing_id" uuid,
	"external_email" text NOT NULL,
	"template_id" text,
	"category" text,
	"subject" text,
	"provider_message_id" text,
	"merge_fields_hash" text,
	"body_text" text,
	"attachment_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressed_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correspondence_log_id" uuid
);
--> statement-breakpoint
ALTER TABLE "account_profiles" ADD COLUMN "suppressed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_profiles" ADD COLUMN "suppression_reason" text;--> statement-breakpoint
ALTER TABLE "correspondence_log" ADD CONSTRAINT "correspondence_log_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence_log" ADD CONSTRAINT "correspondence_log_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressed_emails" ADD CONSTRAINT "suppressed_emails_correspondence_log_id_correspondence_log_id_fk" FOREIGN KEY ("correspondence_log_id") REFERENCES "public"."correspondence_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correspondence_log_account_idx" ON "correspondence_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "correspondence_log_thread_idx" ON "correspondence_log" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "correspondence_log_listing_idx" ON "correspondence_log" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "correspondence_log_template_idx" ON "correspondence_log" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "correspondence_log_created_idx" ON "correspondence_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "correspondence_log_external_email_idx" ON "correspondence_log" USING btree ("external_email");--> statement-breakpoint
CREATE INDEX "suppressed_emails_email_idx" ON "suppressed_emails" USING btree ("email");--> statement-breakpoint
ALTER TABLE "correspondence_log" ADD CONSTRAINT "correspondence_log_in_reply_to_fk" FOREIGN KEY ("in_reply_to") REFERENCES "public"."correspondence_log"("id") ON DELETE set null ON UPDATE no action;