import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users (business owners who claim profiles) ─────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  phone: text("phone"),
  plan: text("plan").notNull().default("free"), // free | premium
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Businesses (core table) ────────────────────────────────────────────────

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),

    // Category
    category: text("category").notNull(), // barber, plumber, dentist, etc.
    subcategories: text("subcategories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // Location — coordinates stored as text "lng,lat" for Drizzle compat
    // Actual PostGIS column created via migration SQL
    address: text("address").notNull(),
    city: text("city").notNull().default("Austin"),
    state: text("state").notNull().default("TX"),
    zip: text("zip"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    serviceRadiusKm: real("service_radius_km"),

    // Contact
    phone: text("phone"),
    website: text("website"),
    email: text("email"),

    // Hours (JSONB)
    hours: jsonb("hours"),

    // Ratings from multiple sources
    ratingGoogle: real("rating_google"),
    ratingGoogleCount: integer("rating_google_count"),
    ratingYelp: real("rating_yelp"),
    ratingYelpCount: integer("rating_yelp_count"),
    ratingFb: real("rating_fb"),
    ratingComposite: real("rating_composite"),
    totalReviewCount: integer("total_review_count"),

    // Source IDs (for dedup and refresh)
    sourceOsmId: text("source_osm_id"),
    sourceGooglePlaceId: text("source_google_place_id"),
    sourceYelpId: text("source_yelp_id"),
    sourceFbPageId: text("source_fb_page_id"),

    // Profile status
    profileStatus: text("profile_status").notNull().default("auto"), // auto | claimed | premium
    claimedBy: uuid("claimed_by").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),

    // Metadata
    dataSources: text("data_sources")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_businesses_category_rating").on(
      table.category,
      table.ratingComposite,
    ),
    index("idx_businesses_status").on(table.profileStatus),
    index("idx_businesses_lat_lng").on(table.latitude, table.longitude),
  ],
);

// ─── Services (populated when business claims profile) ──────────────────────

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceMin: real("price_min"),
    priceMax: real("price_max"),
    currency: text("currency").notNull().default("USD"),
    durationMinutes: integer("duration_minutes"),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_services_business").on(table.businessId),
    index("idx_services_price").on(table.priceMin, table.priceMax),
  ],
);

// ─── Availability Slots (premium feature) ───────────────────────────────────

export const availabilitySlots = pgTable(
  "availability_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    source: text("source").notNull().default("manual"), // manual | calendar_sync | sms_bot
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_availability_lookup").on(
      table.businessId,
      table.date,
      table.isAvailable,
    ),
  ],
);

// ─── Agent Queries (analytics) ──────────────────────────────────────────────

export const agentQueries = pgTable(
  "agent_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryText: text("query_text"),
    category: text("category"),
    location: text("location"),
    resultsCount: integer("results_count"),
    businessesReturned: uuid("businesses_returned")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    agentType: text("agent_type"), // claude | chatgpt | custom
    responseTimeMs: integer("response_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_queries_time").on(table.createdAt)],
);
