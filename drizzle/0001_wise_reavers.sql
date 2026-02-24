CREATE TYPE "public"."availability_status" AS ENUM('available', 'available_from', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."budget_tier" AS ENUM('low', 'mid', 'high');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('unclaimed', 'pending_review', 'claimed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."credit_format" AS ENUM('feature', 'tv_series', 'tv_one_off', 'short', 'commercial', 'corporate', 'music_video', 'digital_social', 'live_event');--> statement-breakpoint
CREATE TYPE "public"."credit_sourcing" AS ENUM('self_reported', 'imdb_linked', 'client_confirmed');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('freelancer', 'company', 'education', 'industry_body', 'public_sector', 'non_profit');--> statement-breakpoint
CREATE TYPE "public"."lead_time" AS ENUM('same_day', '1_week', '2_4_weeks', '6_plus_weeks');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('active', 'inactive', 'merged', 'dissolved', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('logo', 'headshot', 'portfolio', 'gallery', 'showreel_url');--> statement-breakpoint
CREATE TYPE "public"."shortlist_item_status" AS ENUM('active', 'archived', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'standard', 'premium', 'partner');--> statement-breakpoint
CREATE TYPE "public"."travel_willingness" AS ENUM('local_only', 'regional', 'uk_wide', 'international');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('email_domain_match', 'companies_house_active', 'companies_house_deep', 'website_bidirectional', 'vat_registration', 'trade_body_membership', 'client_confirmed_credit', 'portfolio_review', 'imdb_verified', 'insurance_verified', 'award_verified', 'linkedin_verified');--> statement-breakpoint
CREATE TYPE "public"."verification_tier" AS ENUM('unclaimed', 'claimed', 'verified', 'premium_verified');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_category" AS ENUM('equipment', 'software', 'genre', 'region', 'transaction_type');--> statement-breakpoint
CREATE TABLE "account_profiles" (
	"account_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email_preferences" jsonb DEFAULT '{"enquiry_notification":true,"listing_status":true,"profile_nudge":true,"conversion_marketing":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_account_id" text,
	"sender_email" text,
	"listing_id" uuid NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"response_time_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"query" text,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"shortlist_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"status" "shortlist_item_status" DEFAULT 'active' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"name" text DEFAULT 'My Shortlist' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accreditations" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"body" text NOT NULL,
	"membership_type" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "additional_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"name" text NOT NULL,
	"postcode" text,
	"region" text,
	"lat" real,
	"lng" real
);
--> statement-breakpoint
CREATE TABLE "controlled_vocabulary" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "vocabulary_category" NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"project_name" text NOT NULL,
	"client_commissioner" text,
	"role_provided" text NOT NULL,
	"year" integer NOT NULL,
	"format" "credit_format" NOT NULL,
	"genres" text[] DEFAULT '{}'::text[],
	"awards" text[] DEFAULT '{}'::text[],
	"sourcing_method" "credit_sourcing" DEFAULT 'self_reported' NOT NULL,
	"verification_date" timestamp with time zone,
	"imdb_url" text,
	"client_company_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"search_appearances" integer DEFAULT 0 NOT NULL,
	"enquiries_received" integer DEFAULT 0 NOT NULL,
	"enquiry_response_rate" real,
	"enquiry_response_time" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_taxonomy_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"sector_id" integer NOT NULL,
	"service_area_id" integer NOT NULL,
	"specialisation_id" integer
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"entity_type" "entity_type" NOT NULL,
	"claim_status" "claim_status" DEFAULT 'unclaimed' NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"companies_house_number" text,
	"vat_number" text,
	"founded_year" integer,
	"formerly_known_as" text[] DEFAULT '{}'::text[],
	"headline" text,
	"bio" text,
	"logo_url" text,
	"headshot_url" text,
	"website_url" text,
	"contact_email" text,
	"contact_phone" text,
	"base_postcode" text,
	"base_region" text,
	"base_lat" real,
	"base_lng" real,
	"service_regions" text[] DEFAULT '{}'::text[],
	"travel_willingness" "travel_willingness",
	"availability_status" "availability_status",
	"available_from" timestamp with time zone,
	"seasonal_patterns" text,
	"lead_time" "lead_time",
	"budget_tier" "budget_tier",
	"day_rate" integer,
	"currency" text DEFAULT 'GBP',
	"subscription_tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"lifecycle_status" "lifecycle_status" DEFAULT 'active' NOT NULL,
	"last_provider_login" timestamp with time zone,
	"merged_into" uuid,
	"succeeded_by" uuid,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"type" "media_type" NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"forwarded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pre_claim_snapshots" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_score_explanations" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"explanation" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_scores" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"completeness" integer DEFAULT 0 NOT NULL,
	"freshness" integer DEFAULT 0 NOT NULL,
	"accuracy" integer DEFAULT 0 NOT NULL,
	"richness" integer DEFAULT 0 NOT NULL,
	"verification" integer DEFAULT 0 NOT NULL,
	"composite" integer DEFAULT 0 NOT NULL,
	"last_calculated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_synonyms" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"synonym" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "taxonomy_sectors_name_unique" UNIQUE("name"),
	CONSTRAINT "taxonomy_sectors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "taxonomy_service_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_specialisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_area_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"tier" "verification_tier" DEFAULT 'unclaimed' NOT NULL,
	"claimed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verification_methods" "verification_method"[] DEFAULT '{}'::verification_method[],
	"last_verification_check" timestamp with time zone,
	"verification_score" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zero_result_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_records" ADD CONSTRAINT "enquiry_records_sender_account_id_user_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_records" ADD CONSTRAINT "enquiry_records_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accreditations" ADD CONSTRAINT "accreditations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_locations" ADD CONSTRAINT "additional_locations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_taxonomy_tags" ADD CONSTRAINT "listing_taxonomy_tags_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_taxonomy_tags" ADD CONSTRAINT "listing_taxonomy_tags_sector_id_taxonomy_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."taxonomy_sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_taxonomy_tags" ADD CONSTRAINT "listing_taxonomy_tags_service_area_id_taxonomy_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."taxonomy_service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_taxonomy_tags" ADD CONSTRAINT "listing_taxonomy_tags_specialisation_id_taxonomy_specialisations_id_fk" FOREIGN KEY ("specialisation_id") REFERENCES "public"."taxonomy_specialisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_enquiries" ADD CONSTRAINT "pending_enquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_claim_snapshots" ADD CONSTRAINT "pre_claim_snapshots_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_score_explanations" ADD CONSTRAINT "quality_score_explanations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_scores" ADD CONSTRAINT "quality_scores_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_service_areas" ADD CONSTRAINT "taxonomy_service_areas_sector_id_taxonomy_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."taxonomy_sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_specialisations" ADD CONSTRAINT "taxonomy_specialisations_service_area_id_taxonomy_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."taxonomy_service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiry_records_sender_idx" ON "enquiry_records" USING btree ("sender_account_id") WHERE "enquiry_records"."sender_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "enquiry_records_listing_sent_idx" ON "enquiry_records" USING btree ("listing_id","sent_at");--> statement-breakpoint
CREATE INDEX "enquiry_records_anon_email_idx" ON "enquiry_records" USING btree ("sender_email") WHERE "enquiry_records"."sender_email" IS NOT NULL AND "enquiry_records"."sender_account_id" IS NULL;--> statement-breakpoint
CREATE INDEX "saved_searches_account_idx" ON "saved_searches" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlist_items_shortlist_listing_idx" ON "shortlist_items" USING btree ("shortlist_id","listing_id");--> statement-breakpoint
CREATE INDEX "shortlist_items_listing_idx" ON "shortlist_items" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "shortlists_account_idx" ON "shortlists" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "accreditations_listing_idx" ON "accreditations" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "additional_locations_listing_idx" ON "additional_locations" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "controlled_vocabulary_cat_val_idx" ON "controlled_vocabulary" USING btree ("category","value");--> statement-breakpoint
CREATE INDEX "controlled_vocabulary_cat_idx" ON "controlled_vocabulary" USING btree ("category");--> statement-breakpoint
CREATE INDEX "credits_listing_year_idx" ON "credits" USING btree ("listing_id","year");--> statement-breakpoint
CREATE INDEX "listing_taxonomy_tags_listing_idx" ON "listing_taxonomy_tags" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_taxonomy_tags_sector_sa_idx" ON "listing_taxonomy_tags" USING btree ("sector_id","service_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_taxonomy_tags_full_idx" ON "listing_taxonomy_tags" USING btree ("listing_id","sector_id","service_area_id","specialisation_id") WHERE "listing_taxonomy_tags"."specialisation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_taxonomy_tags_l2_idx" ON "listing_taxonomy_tags" USING btree ("listing_id","sector_id","service_area_id") WHERE "listing_taxonomy_tags"."specialisation_id" IS NULL;--> statement-breakpoint
CREATE INDEX "listings_account_id_idx" ON "listings" USING btree ("account_id") WHERE "listings"."account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "listings_ch_number_idx" ON "listings" USING btree ("companies_house_number") WHERE "listings"."companies_house_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "listings_lifecycle_active_idx" ON "listings" USING btree ("lifecycle_status") WHERE "listings"."lifecycle_status" = 'active';--> statement-breakpoint
CREATE INDEX "listings_entity_lifecycle_idx" ON "listings" USING btree ("entity_type","lifecycle_status");--> statement-breakpoint
CREATE INDEX "media_items_listing_sort_idx" ON "media_items" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "pending_enquiries_listing_idx" ON "pending_enquiries" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "search_synonyms_term_idx" ON "search_synonyms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "social_profiles_listing_idx" ON "social_profiles" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_service_areas_sector_slug_idx" ON "taxonomy_service_areas" USING btree ("sector_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_specialisations_sa_slug_idx" ON "taxonomy_specialisations" USING btree ("service_area_id","slug");--> statement-breakpoint
CREATE INDEX "zero_result_queries_created_idx" ON "zero_result_queries" USING btree ("created_at");--> statement-breakpoint
-- Custom SQL: pg_trgm extension for fuzzy name matching (S1 §3.1)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Custom SQL: search vector trigger (S1 §3.1)
CREATE OR REPLACE FUNCTION update_listing_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.headline, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.base_region, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER listing_search_vector_update
  BEFORE INSERT OR UPDATE OF name, headline, bio, base_region
  ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_search_vector();--> statement-breakpoint
-- Custom SQL: GIN index on tsvector for full-text search (S1 §3.1)
CREATE INDEX idx_listings_search_vector ON listings USING GIN (search_vector);--> statement-breakpoint
-- Custom SQL: GiST trigram index for fuzzy name matching (S1 §3.1)
CREATE INDEX idx_listings_name_trgm ON listings USING GIST (name gist_trgm_ops);