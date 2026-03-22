CREATE TYPE "public"."ceremony_type" AS ENUM('taxonomy_review', 'data_health_review', 'verification_calibration', 'provider_outreach', 'conversion_funnel_analysis', 'revenue_review', 'multi_listing_pricing', 'sponsored_placement_learning', 'operational_health_review', 'contractor_performance_review', 'principal_briefing', 'learning_hypothesis_analysis');--> statement-breakpoint
CREATE TYPE "public"."decay_signal_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."decay_signal_type" AS ENUM('website_dead', 'email_bounced', 'ch_not_active', 'stale_listing', 'social_dead', 'postcode_invalid', 'domain_expired');--> statement-breakpoint
CREATE TYPE "public"."enrichment_check_type" AS ENUM('website', 'email', 'ch', 'social', 'postcode', 'imdb');--> statement-breakpoint
CREATE TABLE "ceremony_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ceremony_type" "ceremony_type" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"outputs" jsonb,
	"decisions_logged" integer DEFAULT 0 NOT NULL,
	"next_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decay_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"signal_type" "decay_signal_type" NOT NULL,
	"severity" "decay_signal_severity" NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"check_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"check_type" "enrichment_check_type" NOT NULL,
	"next_check_at" timestamp with time zone NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_full_cycle_at" timestamp with time zone,
	"cadence_tier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_hypotheses" (
	"id" text PRIMARY KEY NOT NULL,
	"hypothesis" text NOT NULL,
	"measurement_query" text NOT NULL,
	"current_value" numeric,
	"previous_value" numeric,
	"trend" text,
	"last_measured_at" timestamp with time zone,
	"confound_warning" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perception_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sample_size" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principal_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"content" jsonb NOT NULL,
	"ceremony_run_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quality_scores" ADD COLUMN "calculated_by" text DEFAULT 'zero_init' NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_scores" ADD COLUMN "algorithm_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "decay_signals" ADD CONSTRAINT "decay_signals_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_schedules" ADD CONSTRAINT "enrichment_schedules_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_aggregates" ADD CONSTRAINT "perception_aggregates_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "principal_briefings" ADD CONSTRAINT "principal_briefings_ceremony_run_id_ceremony_runs_id_fk" FOREIGN KEY ("ceremony_run_id") REFERENCES "public"."ceremony_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ceremony_runs_type_started_idx" ON "ceremony_runs" USING btree ("ceremony_type","started_at");--> statement-breakpoint
CREATE INDEX "ceremony_runs_running_idx" ON "ceremony_runs" USING btree ("status") WHERE "ceremony_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "ceremony_runs_next_scheduled_idx" ON "ceremony_runs" USING btree ("next_scheduled_at");--> statement-breakpoint
CREATE INDEX "decay_signals_listing_active_idx" ON "decay_signals" USING btree ("listing_id","resolved_at");--> statement-breakpoint
CREATE INDEX "decay_signals_detected_idx" ON "decay_signals" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "decay_signals_severity_active_idx" ON "decay_signals" USING btree ("severity","resolved_at") WHERE "decay_signals"."resolved_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "enrichment_schedules_listing_check_unique" ON "enrichment_schedules" USING btree ("listing_id","check_type");--> statement-breakpoint
CREATE INDEX "enrichment_schedules_next_check_idx" ON "enrichment_schedules" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "enrichment_schedules_listing_idx" ON "enrichment_schedules" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perception_aggregates_listing_type_period_unique" ON "perception_aggregates" USING btree ("listing_id","aggregate_type","period_start");--> statement-breakpoint
CREATE INDEX "perception_aggregates_listing_type_idx" ON "perception_aggregates" USING btree ("listing_id","aggregate_type","period_start");--> statement-breakpoint
CREATE INDEX "perception_aggregates_computed_idx" ON "perception_aggregates" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "principal_briefings_generated_idx" ON "principal_briefings" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "principal_briefings_ceremony_idx" ON "principal_briefings" USING btree ("ceremony_run_id");--> statement-breakpoint
CREATE INDEX "principal_briefings_unsent_idx" ON "principal_briefings" USING btree ("sent_at") WHERE "principal_briefings"."sent_at" IS NULL;