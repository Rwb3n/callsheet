CREATE TYPE "public"."decision_domain" AS ENUM('data-and-listings', 'operations', 'platform', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."deferred_action_failure" AS ENUM('log', 'alert_principal');--> statement-breakpoint
CREATE TYPE "public"."deferred_action_retry" AS ENUM('once', 'retry_3');--> statement-breakpoint
CREATE TYPE "public"."deferred_action_status" AS ENUM('pending', 'executing', 'completed', 'failed', 'exhausted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."flow_status" AS ENUM('initiated', 'in_progress', 'completed', 'failed', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."flow_type" AS ENUM('erasure', 'closure');--> statement-breakpoint
CREATE TABLE "decision_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" "decision_domain" NOT NULL,
	"decision_type" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"confidence" integer,
	"listing_id" uuid,
	"account_id" uuid,
	"additional_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deferred_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"params" jsonb NOT NULL,
	"execute_at" timestamp with time zone NOT NULL,
	"retry_policy" "deferred_action_retry" NOT NULL,
	"on_failure" "deferred_action_failure" NOT NULL,
	"created_by" text NOT NULL,
	"status" "deferred_action_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_consumer_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"consumer_domain" text NOT NULL,
	"consumer_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"stack" text,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrated_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_type" "flow_type" NOT NULL,
	"triggered_by" uuid NOT NULL,
	"status" "flow_status" DEFAULT 'initiated' NOT NULL,
	"steps" jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"context" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"escalation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "decision_logs_domain_type_idx" ON "decision_logs" USING btree ("domain","decision_type");--> statement-breakpoint
CREATE INDEX "decision_logs_created_idx" ON "decision_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deferred_actions_poll_idx" ON "deferred_actions" USING btree ("status","execute_at");--> statement-breakpoint
CREATE INDEX "event_consumer_errors_lookup_idx" ON "event_consumer_errors" USING btree ("event_type","consumer_domain","created_at");--> statement-breakpoint
CREATE INDEX "orchestrated_flows_status_idx" ON "orchestrated_flows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orchestrated_flows_type_status_idx" ON "orchestrated_flows" USING btree ("flow_type","status");