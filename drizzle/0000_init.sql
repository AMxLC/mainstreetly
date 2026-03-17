-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "name" text,
  "phone" text,
  "plan" text NOT NULL DEFAULT 'free',
  "created_at" timestamptz DEFAULT now()
);

-- Businesses table
CREATE TABLE IF NOT EXISTS "businesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "category" text NOT NULL,
  "subcategories" text[] NOT NULL DEFAULT '{}'::text[],
  "address" text NOT NULL,
  "city" text NOT NULL DEFAULT 'Austin',
  "state" text NOT NULL DEFAULT 'TX',
  "zip" text,
  "latitude" real NOT NULL,
  "longitude" real NOT NULL,
  "service_radius_km" real,
  "phone" text,
  "website" text,
  "email" text,
  "hours" jsonb,
  "rating_google" real,
  "rating_google_count" integer,
  "rating_yelp" real,
  "rating_yelp_count" integer,
  "rating_fb" real,
  "rating_composite" real,
  "total_review_count" integer,
  "source_osm_id" text,
  "source_google_place_id" text,
  "source_yelp_id" text,
  "source_fb_page_id" text,
  "profile_status" text NOT NULL DEFAULT 'auto',
  "claimed_by" uuid REFERENCES "users"("id"),
  "claimed_at" timestamptz,
  "data_sources" text[] NOT NULL DEFAULT '{}'::text[],
  "last_scraped_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

-- Services table
CREATE TABLE IF NOT EXISTS "services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "price_min" real,
  "price_max" real,
  "currency" text NOT NULL DEFAULT 'USD',
  "duration_minutes" integer,
  "category" text,
  "created_at" timestamptz DEFAULT now()
);

-- Availability slots table
CREATE TABLE IF NOT EXISTS "availability_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "is_available" boolean NOT NULL DEFAULT true,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamptz DEFAULT now()
);

-- Agent queries table
CREATE TABLE IF NOT EXISTS "agent_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_text" text,
  "category" text,
  "location" text,
  "results_count" integer,
  "businesses_returned" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "agent_type" text,
  "response_time_ms" integer,
  "created_at" timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_businesses_category_rating ON businesses(category, rating_composite DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(profile_status);
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm ON businesses USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_businesses_lat_lng ON businesses(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_osm_id ON businesses(source_osm_id);

CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id);
CREATE INDEX IF NOT EXISTS idx_services_price ON services(price_min, price_max);

CREATE INDEX IF NOT EXISTS idx_availability_lookup ON availability_slots(business_id, date, is_available);

CREATE INDEX IF NOT EXISTS idx_queries_time ON agent_queries(created_at DESC);
