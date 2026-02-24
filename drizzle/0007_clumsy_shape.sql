CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"dismissed" boolean DEFAULT false NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_account_dismissed_idx" ON "notifications" USING btree ("account_id","dismissed");--> statement-breakpoint
CREATE INDEX "notifications_account_unread_idx" ON "notifications" USING btree ("account_id","read_at","dismissed");