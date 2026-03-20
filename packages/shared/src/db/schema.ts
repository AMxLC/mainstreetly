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
    city: text("city").notNull(),
    state: text("state").notNull(),
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

// ─── Query Appearances (junction table for query analytics) ──────────────────

export const queryAppearances = pgTable(
  "query_appearances",
  {
    queryId: uuid("query_id")
      .notNull()
      .references(() => agentQueries.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_query_appearances_business_time").on(
      table.businessId,
      table.createdAt,
    ),
  ],
);

// ─── Waitlist Signups (for early access) ───────────────────────────────────

export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    businessName: text("business_name"),
    businessCategory: text("business_category"),
    city: text("city"),
    state: text("state"),
    phone: text("phone"),
    position: integer("position"),
    status: text("status").notNull().default("waiting"), // waiting | contacted | onboarded
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_waitlist_location_category_position").on(
      table.city,
      table.businessCategory,
      table.position,
    ),
  ],
);

// ─── Developer Keys (for API access) ──────────────────────────────────────

export const developerKeys = pgTable(
  "developer_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix"), // e.g., "sk-...abc" for display
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
);

// ─── Geocoding Lookups (for global location support) ──────────────────────

export const geocodingLookups = pgTable(
  "geocoding_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zip: text("zip"),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("US"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_geocoding_zip").on(table.zip),
    index("idx_geocoding_city_state").on(table.city, table.state),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 TABLES — Booking, Subscriptions, Calendar, WhatsApp
// These are defined in the schema now so migrations can be generated,
// but the application code that uses them is built in Phase 2.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Bookings (core transactional record) ────────────────────────────────

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id),

    // Customer info (from the AI agent's MCP call)
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    agentType: text("agent_type"), // claude | chatgpt | custom

    // Scheduling
    requestedDatetime: timestamp("requested_datetime", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),

    // Status machine: pending → confirmed → completed | cancelled | no_show
    status: text("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),

    // Calendar integration
    googleEventId: text("google_event_id"),

    // WhatsApp interaction tracking
    waNotificationSentAt: timestamp("wa_notification_sent_at", { withTimezone: true }),
    waConfirmedAt: timestamp("wa_confirmed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_bookings_business_status").on(table.businessId, table.status),
    index("idx_bookings_datetime").on(table.requestedDatetime),
  ],
);

// ─── Subscriptions (Stripe-backed) ───────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),

    plan: text("plan").notNull().default("premium"), // premium | enterprise
    status: text("status").notNull().default("active"), // active | past_due | cancelled

    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_subscriptions_business").on(table.businessId),
    index("idx_subscriptions_stripe").on(table.stripeSubscriptionId),
  ],
);

// ─── Calendar Connections ────────────────────────────────────────────────

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    provider: text("provider").notNull().default("google"), // google | outlook
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),

    calendarId: text("calendar_id").notNull(),
    syncDirection: text("sync_direction").notNull().default("both"), // read | write | both
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("active"), // active | paused | error

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_calendar_connections_business_provider").on(
      table.businessId,
      table.provider,
    ),
  ],
);

// ─── WhatsApp Connections ────────────────────────────────────────────────

export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    phoneNumber: text("phone_number").notNull(), // E.164 format
    waId: text("wa_id"), // WhatsApp user ID from webhook

    conversationContext: jsonb("conversation_context").default("{}"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),

    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_wa_connections_phone").on(table.phoneNumber),
    index("idx_wa_connections_business").on(table.businessId),
  ],
);
