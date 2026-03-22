CREATE TYPE "public"."compliance_entry_status" AS ENUM('open', 'in_progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."compliance_entry_type" AS ENUM('dsar', 'erasure', 'article_14', 'complaint', 'investigation', 'obligation');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'assigned', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."task_spec_domain" AS ENUM('verification', 'support', 'moderation', 'compliance', 'data_maintenance', 'outreach');--> statement-breakpoint
CREATE TYPE "public"."task_spec_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_spec_status" AS ENUM('pending', 'assigned', 'in_progress', 'completed', 'timed_out', 're_routed');--> statement-breakpoint
CREATE TABLE "billing_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_reconciliation_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"active_holds" integer DEFAULT 0 NOT NULL,
	"last_anomaly_at" timestamp with time zone,
	"last_anomaly_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "churn_risk_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"risk_level" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_register" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "compliance_entry_type" NOT NULL,
	"account_id" text,
	"status" "compliance_entry_status" NOT NULL,
	"received_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"listing_id" uuid,
	"category" text NOT NULL,
	"priority" "support_ticket_priority" NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"subject" text NOT NULL,
	"details" jsonb,
	"sla_deadline" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" "task_spec_domain" NOT NULL,
	"priority" "task_spec_priority" NOT NULL,
	"status" "task_spec_status" DEFAULT 'pending' NOT NULL,
	"task" text NOT NULL,
	"context" jsonb NOT NULL,
	"checklist" jsonb NOT NULL,
	"acceptance_criteria" text NOT NULL,
	"estimated_time" text NOT NULL,
	"deadline" timestamp with time zone,
	"timeout" integer NOT NULL,
	"escalation" text NOT NULL,
	"required_skills" jsonb NOT NULL,
	"data_access_scope" jsonb NOT NULL,
	"learning_capture" jsonb NOT NULL,
	"reroute_count" integer DEFAULT 0 NOT NULL,
	"max_reroutes" integer NOT NULL,
	"external_ref" text,
	"external_platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "event_consumer_errors" ADD COLUMN "resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_consumer_errors" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orchestrated_flows" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "billing_holds" ADD CONSTRAINT "billing_holds_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_risk_registry" ADD CONSTRAINT "churn_risk_registry_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_risk_registry" ADD CONSTRAINT "churn_risk_registry_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_register" ADD CONSTRAINT "compliance_register_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_holds_listing_idx" ON "billing_holds" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "billing_holds_expires_idx" ON "billing_holds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "churn_risk_registry_account_idx" ON "churn_risk_registry" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "churn_risk_registry_expires_idx" ON "churn_risk_registry" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "compliance_register_type_status_idx" ON "compliance_register" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "compliance_register_account_idx" ON "compliance_register" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "support_tickets_account_idx" ON "support_tickets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "support_tickets_listing_idx" ON "support_tickets" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "support_tickets_category_idx" ON "support_tickets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "task_specs_domain_status_idx" ON "task_specs" USING btree ("domain","status");--> statement-breakpoint
CREATE INDEX "task_specs_status_priority_idx" ON "task_specs" USING btree ("status","priority");