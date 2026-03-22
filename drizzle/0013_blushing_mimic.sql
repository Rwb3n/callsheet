CREATE TABLE "churn_analysis_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"account_id" uuid,
	"account_hash" text,
	"event_type" text NOT NULL,
	"reason" text,
	"subscription_tier" text,
	"annual_revenue" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_state" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"last_view_milestone_fired" integer,
	"first_enquiry_trigger_fired" boolean DEFAULT false NOT NULL,
	"competitor_upgraded_fired" integer DEFAULT 0 NOT NULL,
	"last_competitor_upgraded_at" timestamp with time zone,
	"analytics_tease_fired" integer DEFAULT 0 NOT NULL,
	"last_analytics_tease_at" timestamp with time zone,
	"social_proof_fired" integer DEFAULT 0 NOT NULL,
	"last_social_proof_at" timestamp with time zone,
	"engagement_summary_fired" integer DEFAULT 0 NOT NULL,
	"last_engagement_summary_at" timestamp with time zone,
	"endowment_cta_shown" boolean DEFAULT false NOT NULL,
	"last_churn_event_at" timestamp with time zone,
	"last_churn_reason" text,
	"effective_price_at_subscription" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsored_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"service_area_id" integer NOT NULL,
	"impression_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "churn_analysis_log" ADD CONSTRAINT "churn_analysis_log_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_state" ADD CONSTRAINT "commercial_state_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_impressions" ADD CONSTRAINT "sponsored_impressions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_impressions" ADD CONSTRAINT "sponsored_impressions_service_area_id_taxonomy_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."taxonomy_service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "churn_log_listing_created_idx" ON "churn_analysis_log" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "churn_log_event_type_created_idx" ON "churn_analysis_log" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "churn_log_account_id_idx" ON "churn_analysis_log" USING btree ("account_id") WHERE "churn_analysis_log"."account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sponsored_impressions_listing_date_idx" ON "sponsored_impressions" USING btree ("listing_id","impression_date");--> statement-breakpoint
CREATE INDEX "sponsored_impressions_area_date_idx" ON "sponsored_impressions" USING btree ("service_area_id","impression_date");--> statement-breakpoint
CREATE UNIQUE INDEX "churn_risk_registry_listing_idx" ON "churn_risk_registry" USING btree ("listing_id");