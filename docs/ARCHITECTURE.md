# Mainstreetly — Comprehensive Architecture Document

**Version:** 1.0
**Last Updated:** March 2026
**Status:** Production-Ready Blueprint

This is the single source of truth for the Mainstreetly platform. It replaces both MAINSTREETLY-PROJECT-BRIEF.md and MAINSTREETLY-BUSINESS-SIDE-ARCHITECTURE.md with consolidated technical and business architecture.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Two-Audience Strategy](#3-two-audience-strategy)
4. [Three-Layer Data Strategy](#4-three-layer-data-strategy)
5. [Data Pipeline & Scraping](#5-data-pipeline--scraping)
6. [Database Schema](#6-database-schema)
7. [MCP Server Architecture](#7-mcp-server-architecture)
8. [Public SEO Profile Pages](#8-public-seo-profile-pages)
9. [WhatsApp AI Agent](#9-whatsapp-ai-agent)
10. [Google Calendar Integration](#10-google-calendar-integration)
11. [Dashboard](#11-dashboard)
12. [Stripe Integration](#12-stripe-integration)
13. [Booking Flow — End to End](#13-booking-flow--end-to-end)
14. [Waitlist & Founding Member System](#14-waitlist--founding-member-system)
15. [Geocoding Strategy](#15-geocoding-strategy)
16. [Monorepo Structure](#16-monorepo-structure)
17. [Tech Stack](#17-tech-stack)
18. [Cost Summary](#18-cost-summary)
19. [Testing Strategy](#19-testing-strategy)
20. [Licensing](#20-licensing)
21. [Security & IP Protection](#21-security--ip-protection)
22. [Git Workflow](#22-git-workflow)
23. [Agent Discovery & Distribution](#23-agent-discovery--distribution)
24. [Go-To-Market](#24-go-to-market)
25. [Competitive Landscape & Moat](#25-competitive-landscape--moat)
26. [Risk Mitigation](#26-risk-mitigation)
27. [Environment Variables](#27-environment-variables)
28. [Domain Architecture](#28-domain-architecture)
29. [Phased Build Plan](#29-phased-build-plan)

---

## 1. Executive Summary

### What Mainstreetly Is

Mainstreetly is the **"Google Maps for AI Agents"** — the standardized bridge that lets any AI agent (Claude, ChatGPT, Gemini, custom agents) discover, evaluate, and book local service businesses at scale.

**The Core Problem:**
- Google's UCP and OpenAI's ACP protocols handle product commerce (Walmart, Shopify, Target) but completely miss services — the messy, local, fragmented sector
- Small service businesses have no Shopify equivalent, no agent protocol, no digital commerce stack
- When someone prompts "book me a haircut tomorrow at 2pm under $25," today's agents fail spectacularly

**The Solution:**
- Mainstreetly pre-populates a structured, agent-optimized database of local service businesses using publicly available data (OpenStreetMap, Google Places, Yelp, Facebook)
- AI agents query the Mainstreetly MCP server to search, filter, and get results immediately — no business onboarding required
- Business owners can then claim and enhance their profiles to unlock premium features

**Why It Matters (Token Economics):**
- Browser-based agent path: 50,000–200,000+ tokens per query ($0.30–$1.50), 15–30 seconds, <5% task completion
- Mainstreetly MCP path: 3,000–5,000 tokens per query ($0.01–0.03), 1–3 seconds, 90%+ task completion
- **30–50x cheaper, 10–20x faster, dramatically better results**

### Two Audiences, Two Value Props

```
┌──────────────────────────┐              ┌──────────────────────────┐
│  AGENT DEVELOPERS        │              │  BUSINESS OWNERS         │
│  (your AI customers)     │              │  (your supply side)      │
├──────────────────────────┤              ├──────────────────────────┤
│ Value: Structured        │              │ Value: AI visibility +   │
│ business data, 90% task  │              │ bookings + analytics     │
│ completion               │              │                          │
│                          │              │                          │
│ Acquisition: Dev blogs,  │              │ Acquisition: WhatsApp    │
│ npm, Smithery, GitHub    │              │ proactive outreach,      │
│ communities              │              │ "Your business was       │
│                          │              │ found 47 times"          │
│                          │              │                          │
│ Monetization: Free for   │              │ Monetization: Free       │
│ consumption; premium     │              │ profile + premium sub    │
│ features for builders    │              │ ($49/mo)                 │
└──────────────────────────┘              └──────────────────────────┘
```

---

## 2. System Architecture Overview

### Full Platform Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       AGENT DEVELOPERS (MCP Consumers)                     │
│  Claude / ChatGPT / Gemini / Custom Agent                                  │
│         │                                                                  │
│         ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  Mainstreetly MCP Server (Streamable HTTP)                  │           │
│  │  - search_businesses(query, location)                       │           │
│  │  - get_business_info(business_id)                           │           │
│  │  - list_service_categories()                                │           │
│  │  - check_availability(business_id, date)                    │           │
│  │  - book_appointment(business_id, slot, ...)                 │           │
│  │  - cancel_booking(booking_id)                               │           │
│  │                                                             │           │
│  │  Auth: API Keys (Bearer sk-xxx), Rate Limiting per key     │           │
│  │  Health Check: /health endpoint                             │           │
│  └────────────┬────────────────────────────────────────────────┘           │
└───────────────┼────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL + PostGIS (Railway)                                 │
│                                                                 │
│  Core Tables:                                                   │
│  ├── businesses                   (100K+ service businesses)    │
│  ├── services                     (offerings per business)      │
│  ├── availability_slots           (calendar integration)        │
│  ├── bookings                     (transactional)               │
│  ├── users                        (business owners)             │
│  ├── subscriptions                (Stripe-backed)               │
│  ├── calendar_connections         (Google OAuth)                │
│  ├── whatsapp_connections         (Meta Cloud API)              │
│  ├── agent_queries                (analytics)                   │
│  ├── query_appearances            (junction for analytics)      │
│  ├── waitlist_signups             (scarcity mechanics)          │
│  ├── developer_keys               (API key mgmt)                │
│  └── geocoding_lookups            (Census zip data)             │
│                                                                 │
│  Indexes: Spatial (PostGIS), category, ratings, full-text      │
└────────────────────┬──────────────────────────────────────────┘
                     │
        ┌────────────┼────────────────────┐
        │            │                     │
        ▼            ▼                     ▼
    ┌────────┐  ┌──────────┐  ┌──────────────────────────┐
    │WhatsApp│  │ Calendar │  │  Dashboard + SEO Pages   │
    │Agent   │  │ Sync     │  │  (Next.js + Vercel)      │
    │(Claude │  │(Google)  │  │                          │
    │Sonnet) │  │          │  │  • Business profiles      │
    │        │  │          │  │  • Analytics             │
    │        │  │          │  │  • Subscription mgmt     │
    └────────┘  └──────────┘  │  • Public SEO pages      │
        │            │         └──────────────────────────┘
        ▼            ▼              │
    ┌─────────────────────────────┬─┘
    │   External Services         │
    ├─────────────────────────────┤
    │ • WhatsApp Cloud API (Meta) │
    │ • Google Calendar API       │
    │ • Stripe Checkout + Portal  │
    │ • Claude API (Sonnet)       │
    │ • Nominatim / Census lookup │
    └─────────────────────────────┘
```

---

## 3. Two-Audience Strategy

### Audience 1: Agent Developers

**Target:** AI engineers, Claude users, ChatGPT plugin developers, OpenAI partners, custom agent builders.

**Value Proposition:**
- Structured business data optimized for agent consumption (lean JSON, token-efficient)
- 90%+ task completion rate for "book me X near Y" type queries
- Out-of-the-box booking capability (no web scraping, no browser fallback)
- Multi-source ratings (Google, Yelp, Facebook composite scores)
- Instant availability — no business signup required

**Channels & Acquisition:**
- **Smithery.ai** — MCP marketplace (primary)
- **npm & PyPI** — Publish SDK packages
- **GitHub** — Topic tags: `mcp`, `mcp-server`, `booking`, `ai-agents`
- **Dev communities** — OpenClaw Discord, r/LocalLLaMA, AI dev Twitter
- **Blog posts** — "Building Agent-Native Local Commerce"
- **Honest positioning:** "Here's what our MCP does. Here's what it doesn't (e.g., we don't integrate with ChatGPT directly, that's a them problem)"

**Monetization:**
- Free for consumption (agents querying MCP)
- Premium API access for higher rate limits (future)
- Enterprise licensing for bot platforms

### Audience 2: Business Owners

**Target:** Salon owners, dentists, plumbers, mechanics, handymen, restaurants — non-technical SMBs in local services.

**Value Proposition:**
- **"Make your business visible to AI"** — no technical setup
- Free AI-visible profile (starts auto-populated from public data)
- AI agent search analytics — "Your business was discovered 47 times this month"
- Premium features unlock via WhatsApp: calendar sync, AI bookings, agent assistant
- $49/mo for calendar integration + bookings + analytics + WhatsApp AI agent
- No website required, no app required — everything through WhatsApp

**Channels & Acquisition:**
- **Proactive WhatsApp outreach** — "Hi John, your barber shop was searched by AI agents 47 times last month. Claim your profile to start booking."
- **SEO-optimized public profiles** — ChatGPT/Perplexity discover Mainstreetly pages via web search
- **Local outreach** — Walk-ins, local FB groups, Austin business communities
- **Founding member scarcity** — "First 5 per category per city get founding member pricing ($9/mo for 1 year)"

**Monetization:**
- Free tier: AI-visible profile + basic analytics (search count)
- Premium: $49/mo (calendar sync, AI bookings, WhatsApp agent, full analytics, featured placement)
- Future: Enterprise/multi-location ($99/mo)

---

## 4. Three-Layer Data Strategy

The MCP must be useful from day one — before any business signs up. This is achieved through three data layers:

### Layer 1: Auto-Populated (Scraped/Public Data — FREE)

Every service business in the target city gets a profile automatically, built from public sources:
- **OpenStreetMap** (Overpass API): Names, addresses, categories, coordinates, phones, websites, hours. Free, open license, fully storable.
- **Outscraper**: Google Maps ratings, review counts, photos, additional categories. Free tier = 500 businesses; then $3/1,000. ~$30 for 10,000.
- **Yelp Fusion API**: Yelp ratings, review counts, price level. 5,000 free API calls during trial.
- **Facebook Graph API**: Public page ratings for businesses with FB pages.

**Result:** Agents get immediate, useful results. "Find me a barber near South Congress with good reviews" → returns real Austin businesses with composite ratings.

### Layer 2: Claimed (Business Owner Verifies — FREE)

Business owner "claims" their profile (like claiming a Google Business listing). They can:
- Correct/update any auto-populated info
- Add detailed services with pricing and duration
- Add languages spoken, accessibility info, payment methods
- Add special notes and descriptions
- Upload photos

Still free. Gets the business owner invested and provides data no scraper can get.

### Layer 3: Premium (Subscription — PAID)

- Real-time availability (calendar sync, SMS bot, or booking tool integration)
- Agent-bookable appointments through MCP
- Featured placement in search results
- Full analytics dashboard ("Your business was discovered 47 times by AI agents this month")
- Priority listing and enhanced profile
- WhatsApp AI agent for managing bookings

### The Flywheel

```
Free scraped data
        ↓
    Useful MCP
        ↓
   Agent traffic
        ↓
 Usage analytics
        ↓
"Your business was searched 47 times"
        ↓
Business claims profile
        ↓
Adds services/pricing
        ↓
MCP becomes MORE useful
        ↓
More agent traffic
        ↓
Premium upsell (booking, analytics, featured placement)
```

---

## 5. Data Pipeline & Scraping

### 5.1 OpenStreetMap Seed (Foundation — 100% Legal, Free)

**Tool:** Overpass API (free, no API key needed)
**What you get:** Business name, address, coordinates, phone, website, hours, category
**Coverage:** ~10,000–15,000 service businesses per metro area
**Storage:** Unlimited, open license (ODbL — requires attribution)

**Target OSM Tags:**
```
Service Categories to Query:
- shop=hairdresser, shop=beauty, shop=barber
- amenity=dentist, amenity=doctors, amenity=clinic, amenity=veterinary
- craft=plumber, craft=electrician, craft=hvac, craft=painter, craft=carpenter
- shop=car_repair, shop=car_parts
- amenity=restaurant, amenity=cafe, amenity=fast_food
- shop=laundry, shop=dry_cleaning
- office=estate_agent, office=lawyer, office=accountant
- amenity=childcare, amenity=school (private tutoring)
- leisure=fitness_centre, leisure=spa
```

**Overpass Query (Austin example):**
```
[out:json][timeout:120];
// Austin bounding box: 30.1,-97.95,30.55,-97.55
(
  node["shop"~"hairdresser|beauty|barber|car_repair|laundry|dry_cleaning"](30.1,-97.95,30.55,-97.55);
  node["amenity"~"dentist|doctors|clinic|veterinary|restaurant|cafe"](30.1,-97.95,30.55,-97.55);
  node["craft"~"plumber|electrician|hvac|painter|carpenter"](30.1,-97.95,30.55,-97.55);
  way["shop"~"hairdresser|beauty|barber|car_repair|laundry|dry_cleaning"](30.1,-97.95,30.55,-97.55);
  way["amenity"~"dentist|doctors|clinic|veterinary|restaurant|cafe"](30.1,-97.95,30.55,-97.55);
  way["craft"~"plumber|electrician|hvac|painter|carpenter"](30.1,-97.95,30.55,-97.55);
);
out body;
>;
out skel qt;
```

### 5.2 Outscraper Enrichment (One-time Seed — $0–30)

**Tool:** Outscraper.com
**What you get:** Google Maps ratings, review counts, price level, photos, categories
**Cost:** Free tier = 500 businesses; then $3/1,000 records. ~$30 for 10,000 businesses.
**Legal:** ToS gray area (Google ToS violation but not illegal per US courts). Standard for lead gen industry.

**Search Queries to Run:**
```
Barber Austin TX
Hair Salon Austin TX
Dentist Austin TX
Plumber Austin TX
Electrician Austin TX
Auto Repair Austin TX
House Cleaning Austin TX
[...etc...]
```

**Fields to Export:** name, full_address, phone, website, rating, reviews_count, price_level, working_hours, latitude, longitude, google_id, category, subtypes

### 5.3 Yelp Enrichment (30-day Trial — FREE)

**Tool:** Yelp Fusion API
**What you get:** Yelp rating, review count, price level, Yelp categories
**Cost:** 5,000 free API calls during 30-day trial
**Legal:** Fully legitimate API usage

### 5.4 Facebook Page Enrichment (FREE)

**Tool:** Facebook Graph API
**What you get:** FB page rating, page likes, for businesses with Facebook pages
**Legal:** Fully legitimate

### 5.5 Deduplication & Merge Logic

Multiple sources will return the same business. **Merge strategy (fixed algorithm):**

```
1. Required conditions for merging:
   - Address normalization match (exact zip + street number + name)
   - Source-ID overlap (at least two sources claim same business)
   - Proximity check: < 50m for high-confidence matches

2. For names that appear 3+ times (chains):
   - Drop proximity threshold to 50m (tighter match)
   - Require address_hash + source_id_overlap

3. Conflict resolution priority (for field conflicts):
   - Name: Google > OSM > Yelp (owner-submitted names)
   - Address: Google > OSM (better normalization)
   - Hours: Google > OSM (more up-to-date)
   - Phone: Google > OSM > Yelp
   - Ratings: Keep ALL sources separately (composite = weighted average)

4. Store source IDs for all:
   - osm_id, google_place_id, yelp_id, fb_page_id
```

### 5.6 Hours Parsing

**Tool:** `opening_hours` npm library
**Input:** OSM format (e.g., "Mo-Fr 09:00-17:00; Sa 10:00-14:00")
**Processing:**
1. Parse OSM format using `opening_hours` library
2. Generate structured hours object: `{ monday: { open: "09:00", close: "17:00" }, ... }`
3. Overlay Google hours when enriched (Google more up-to-date)
4. `getTodayHours()` must return real data for agents (not estimates)

**Example:**
```javascript
import { OpeningHours } from 'opening_hours';

const osm_hours = "Mo-Fr 09:00-19:00; Sa 08:00-18:00; Su closed";
const oh = new OpeningHours(osm_hours);

// Get today's hours
const today = oh.intervals(new Date())[0];
// Result: { start: Date, end: Date }

// Structured format
const structured = {
  monday: { open: "09:00", close: "19:00" },
  saturday: { open: "08:00", close: "18:00" },
  sunday: "closed"
};
```

### 5.7 Data Refresh Strategy

- **Weekly:** Re-run Overpass API query for new/changed OSM data (free)
- **On-demand:** When agent queries a business, optionally proxy Google Places API for fresh hours/rating ($0.02–0.04 per lookup)
- **Claimed profiles:** Business owner's data is always source of truth, overrides scraped data

---

## 6. Database Schema

### PostgreSQL + PostGIS + Drizzle ORM

The database must support fast agent queries: "find barbers near [lat,lng] under $30 with 4+ stars."

#### Core Tables

```sql
-- Businesses (the foundational table)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly: "tonys-barbershop-south-congress"

  -- Category (indexed for fast filtering)
  category TEXT NOT NULL,      -- primary: "barber", "plumber", "dentist"
  subcategories TEXT[],        -- ["men's haircuts", "beard trim"]

  -- Location (PostGIS for spatial queries)
  address TEXT NOT NULL,
  city TEXT NOT NULL,          -- No hardcoding; allow any city
  state TEXT NOT NULL,         -- No hardcoding; allow any state
  zip TEXT,
  coordinates GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS spatial type, SRID 4326
  service_radius_km FLOAT,    -- for mobile businesses (plumber, cleaner)

  -- Contact
  phone TEXT,
  website TEXT,
  email TEXT,

  -- Hours (JSONB for flexible structure)
  hours JSONB,
  -- Example: {"monday":{"open":"09:00","close":"19:00"},"sunday":"closed"}

  -- Ratings (aggregated from multiple sources)
  rating_google FLOAT,
  rating_google_count INT,
  rating_yelp FLOAT,
  rating_yelp_count INT,
  rating_fb FLOAT,
  rating_composite FLOAT,      -- weighted average, indexed
  total_review_count INT,

  -- Source IDs (for dedup and refresh)
  source_osm_id TEXT,
  source_google_place_id TEXT,
  source_yelp_id TEXT,
  source_fb_page_id TEXT,

  -- Profile status
  profile_status TEXT NOT NULL DEFAULT 'auto',  -- auto | claimed | premium
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ,

  -- Metadata
  data_sources TEXT[] DEFAULT '{}',  -- ['osm', 'google', 'yelp']
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for location queries
CREATE INDEX idx_businesses_coordinates ON businesses USING GIST(coordinates);
-- Category + rating index for filtered searches
CREATE INDEX idx_businesses_category_rating ON businesses(category, rating_composite DESC);
-- Profile status index
CREATE INDEX idx_businesses_status ON businesses(profile_status);
-- Full-text search index
CREATE INDEX idx_businesses_name_trgm ON businesses USING GIN(name gin_trgm_ops);

-- Services table (populated when business claims profile)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_min FLOAT,
  price_max FLOAT,
  currency TEXT DEFAULT 'USD',
  duration_minutes INT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_business ON services(business_id);
CREATE INDEX idx_services_price ON services(price_min, price_max);

-- Availability table (premium feature)
CREATE TABLE availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'manual',  -- manual | calendar_sync | sms_bot
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_availability_lookup ON availability_slots(business_id, date, is_available);

-- Users table (business owners who claim profiles)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  stripe_customer_id TEXT,
  whatsapp_opted_in BOOLEAN DEFAULT false,
  onboarding_step TEXT DEFAULT 'registered',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings (transactional records)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id),

  -- Customer info
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  agent_type TEXT,                -- claude | chatgpt | custom

  -- Scheduling
  requested_datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INT,

  -- Status machine
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | completed | cancelled | no_show
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Calendar integration
  google_event_id TEXT,

  -- WhatsApp tracking
  wa_notification_sent_at TIMESTAMPTZ,
  wa_confirmed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_business_status ON bookings(business_id, status);
CREATE INDEX idx_bookings_datetime ON bookings(requested_datetime);
CREATE INDEX idx_bookings_pending ON bookings(status) WHERE status = 'pending';

-- Subscriptions (Stripe-backed)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,

  plan TEXT NOT NULL DEFAULT 'premium',  -- premium | enterprise
  status TEXT NOT NULL DEFAULT 'active', -- active | past_due | cancelled

  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_business ON subscriptions(business_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- Calendar Connections (Google OAuth)
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'google',

  -- OAuth tokens (encrypted at rest)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Sync config
  calendar_id TEXT NOT NULL,
  sync_direction TEXT DEFAULT 'both',     -- read | write | both
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'active',      -- active | paused | error

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_calendar_connections_business ON calendar_connections(business_id, provider);

-- WhatsApp Connections (Meta Cloud API)
CREATE TABLE whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  phone_number TEXT NOT NULL,             -- E.164 format
  wa_id TEXT,                             -- WhatsApp user ID from webhook

  -- Conversation state
  conversation_context JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ,

  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_wa_connections_phone ON whatsapp_connections(phone_number);
CREATE INDEX idx_wa_connections_business ON whatsapp_connections(business_id);

-- Agent Queries (for analytics)
CREATE TABLE agent_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT,
  category TEXT,
  location TEXT,
  results_count INT,
  agent_type TEXT,             -- claude | chatgpt | custom
  response_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queries_time ON agent_queries(created_at DESC);

-- Query Appearances (junction table for analytics)
CREATE TABLE query_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_query_id UUID NOT NULL REFERENCES agent_queries(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  position INT,  -- 1st, 2nd, 3rd result, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_appearances_business ON query_appearances(business_id, created_at DESC);
CREATE INDEX idx_query_appearances_query ON query_appearances(agent_query_id);

-- Materialized View for Dashboard (refreshed hourly)
CREATE MATERIALIZED VIEW business_stats AS
SELECT
  b.id,
  b.name,
  COUNT(DISTINCT qa.id) as searches_this_month,
  COUNT(DISTINCT qa.id) FILTER (WHERE qa.created_at > NOW() - INTERVAL '7 days') as searches_this_week,
  COUNT(DISTINCT bk.id) FILTER (WHERE bk.status = 'confirmed') as confirmed_bookings_this_month,
  SUM(CASE WHEN bk.status = 'confirmed' THEN 1 ELSE 0 END) * 50 as estimated_revenue_this_month
FROM
  businesses b
LEFT JOIN query_appearances qa ON b.id = qa.business_id
LEFT JOIN bookings bk ON b.id = bk.business_id
GROUP BY b.id, b.name;

CREATE INDEX idx_business_stats_id ON business_stats(id);

-- Waitlist Signups (scarcity mechanics)
CREATE TABLE waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  name TEXT,
  position INT,  -- Position in queue for city+category
  invited_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',  -- pending | invited | claimed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_waitlist_city_category_email ON waitlist_signups(city, category, email);
CREATE INDEX idx_waitlist_invited ON waitlist_signups(status) WHERE status = 'invited';

-- Developer Keys (API key management)
CREATE TABLE developer_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of the actual key
  name TEXT,
  created_by_user_id UUID,
  rate_limit_per_minute INT DEFAULT 60,
  rate_limit_per_month INT DEFAULT 10000,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_developer_keys_active ON developer_keys(is_active);

-- Geocoding Lookups (Census zip/city data for free local geocoding)
CREATE TABLE geocoding_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geocoding_lookups_city_state ON geocoding_lookups(city, state);
```

---

## 7. MCP Server Architecture

### Transport & Hosting

**Resolved Decision:**
- **Stateless HTTP transport** (Streamable HTTP, not stdio)
- **Remote hosting on Railway**
- **Health check endpoint `/health`**
- **No session persistence needed** — booking state lives in the database

### Authentication

**Resolved Decision:**
- **API Keys for MVP**
- **Header format:** `Authorization: Bearer sk-xxx`
- **Storage:** Hashed keys in `developer_keys` table
- **Rate limiting:** Per-key limits (default 60/min, 10,000/month)
- **OAuth 2.1 later** (Phase 3)

### API Key Generation & Management

```typescript
// Generate a new API key
const crypto = require('crypto');
const rawKey = `sk-${crypto.randomBytes(32).toString('hex')}`;
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

// Store keyHash in database, return rawKey to user (one-time)
await db.developerKeys.insert({
  key_hash: keyHash,
  name: "My App",
  rate_limit_per_minute: 60,
  rate_limit_per_month: 10000
});
```

### Rate Limiting

```typescript
// Middleware: check rate limit per key
async function rateLimitMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const keyHash = hashApiKey(authHeader.substring(7));
  const key = await db.developerKeys.findOne({ key_hash: keyHash });

  if (!key || !key.is_active) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Check rate limits
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const recentCount = await db.apiLogs.count({
    key_id: key.id,
    created_at: { $gte: oneMinuteAgo }
  });

  const monthlyCount = await db.apiLogs.count({
    key_id: key.id,
    created_at: { $gte: thisMonthStart }
  });

  if (recentCount >= key.rate_limit_per_minute) {
    return res.status(429).json({ error: 'Rate limit exceeded (per minute)' });
  }

  if (monthlyCount >= key.rate_limit_per_month) {
    return res.status(429).json({ error: 'Rate limit exceeded (per month)' });
  }

  req.apiKey = key;
  next();
}
```

### MCP Server Implementation

```typescript
// packages/mcp-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "mainstreetly-gateway",
  version: "1.0.0",
});

// Tool: Search for businesses
server.tool(
  "search_businesses",
  "Find local service businesses by type and location. Returns ratings from Google, Yelp, and Facebook. Supports price and rating filters.",
  {
    query: z.string().describe("Type of business (e.g. 'haircut', 'dentist', 'plumber')"),
    location: z.string().describe("City or address (e.g. 'Austin, TX', '78704')"),
    radius_km: z.number().optional().default(10),
    max_price: z.number().optional().describe("Maximum price filter"),
    min_rating: z.number().optional().describe("Minimum rating (1-5)"),
  },
  async ({ query, location, radius_km, max_price, min_rating }) => {
    const results = await businessService.search({
      query, location, radius_km, max_price, min_rating
    });
    await queryLogger.log({
      query, location, results_count: results.length,
      business_ids: results.map(r => r.id)
    });
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
    };
  }
);

// Tool: Get business info
server.tool(
  "get_business_info",
  "Get full details about a specific business including services, hours, pricing, ratings, and contact information.",
  {
    business_id: z.string(),
  },
  async ({ business_id }) => {
    const profile = await businessService.getProfile(business_id);
    await queryLogger.logView(business_id);
    return {
      content: [{ type: "text", text: JSON.stringify(profile) }],
    };
  }
);

// Tool: List service categories
server.tool(
  "list_service_categories",
  "List all available service categories with business counts.",
  {},
  async () => {
    const categories = await businessService.listCategories();
    return {
      content: [{ type: "text", text: JSON.stringify(categories) }],
    };
  }
);

// Tool: Check availability (two-tier system)
server.tool(
  "check_availability",
  "Check if a business has availability on a specific date and time.",
  {
    business_id: z.string(),
    date: z.string().describe("Date in YYYY-MM-DD format"),
    time_range: z.string().optional().describe("Preferred time range (e.g. '2pm-4pm')"),
  },
  async (params) => {
    const business = await businessService.getProfile(params.business_id);

    // Tier 1: Auto-confirm (calendar-connected businesses)
    if (business.profile_status === 'premium' && business.calendar_connected) {
      const availability = await availabilityService.check(params);
      return {
        content: [{ type: "text", text: JSON.stringify(availability) }]
      };
    }

    // Tier 2: Request-to-book (non-calendar businesses)
    return {
      content: [{ type: "text", text: JSON.stringify({
        available: "requires_confirmation",
        message: "This business requires manual confirmation. Booking request can be sent.",
        phone: business.phone,
        website: business.website,
        hours: business.hours
      })}],
    };
  }
);

// Tool: Book an appointment (two-tier system)
server.tool(
  "book_appointment",
  "Book an appointment at a local business.",
  {
    business_id: z.string(),
    service_id: z.string(),
    datetime: z.string().describe("ISO 8601 datetime"),
    customer_name: z.string(),
    customer_phone: z.string().optional(),
  },
  async (params) => {
    const business = await businessService.getProfile(params.business_id);

    if (business.profile_status !== 'premium') {
      return {
        content: [{ type: "text", text: JSON.stringify({
          booked: false,
          message: "Online booking not enabled. Contact them directly.",
          phone: business.phone,
          website: business.website
        })}],
      };
    }

    // Tier 1: Auto-confirm (calendar-connected)
    if (business.calendar_connected) {
      const booking = await bookingEngine.autoConfirm(params);
      return { content: [{ type: "text", text: JSON.stringify(booking) }] };
    }

    // Tier 2: Request-to-book (sends WhatsApp notification, pending owner response)
    const booking = await bookingEngine.requestToBook(params);
    return { content: [{ type: "text", text: JSON.stringify(booking) }] };
  }
);

// Health check
server.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Server startup
server.listen(process.env.PORT || 3000);
```

### Response Format (Token-Efficient)

For `search_businesses`:
```json
{
  "results": [
    {
      "id": "uuid-123",
      "name": "Tony's Barbershop",
      "category": "barber",
      "address": "4501 S Congress Ave, Austin, TX",
      "distance_km": 1.2,
      "rating": 4.6,
      "ratings": { "google": 4.7, "yelp": 4.5, "reviews": 323 },
      "phone": "+1-512-555-0123",
      "website": "https://tonysbarbershop.com",
      "hours_today": "9am-7pm",
      "profile_status": "claimed",
      "services_available": true,
      "booking_available": false
    }
  ],
  "count": 1,
  "query": "barber near South Congress Austin"
}
```

For `get_business_info`:
```json
{
  "id": "uuid-123",
  "name": "Tony's Barbershop",
  "category": "barber",
  "subcategories": ["men's haircuts", "beard trim", "kids cuts"],
  "address": "4501 S Congress Ave, Austin, TX 78745",
  "coordinates": { "lat": 30.2272, "lng": -97.7631 },
  "phone": "+1-512-555-0123",
  "website": "https://tonysbarbershop.com",
  "hours": {
    "monday": { "open": "09:00", "close": "19:00" },
    "tuesday": { "open": "09:00", "close": "19:00" },
    "wednesday": { "open": "09:00", "close": "19:00" },
    "thursday": { "open": "09:00", "close": "19:00" },
    "friday": { "open": "09:00", "close": "20:00" },
    "saturday": { "open": "08:00", "close": "18:00" },
    "sunday": "closed"
  },
  "ratings": {
    "google": { "score": 4.7, "count": 234 },
    "yelp": { "score": 4.5, "count": 89 },
    "composite": 4.6,
    "total_reviews": 323
  },
  "profile_status": "claimed",
  "services": [
    {
      "name": "Men's Haircut",
      "price_min": 20, "price_max": 25,
      "duration_minutes": 30,
      "description": "Classic cut with hot towel finish"
    }
  ],
  "languages": ["en", "es"],
  "payment_methods": ["cash", "debit", "credit"],
  "accessibility": ["wheelchair_accessible"],
  "special_notes": "Free parking in rear lot. Walk-ins welcome.",
  "booking_available": false,
  "availability_available": false
}
```

---

## 8. Public SEO Profile Pages

### Purpose

ChatGPT and Perplexity discover Mainstreetly via web search when agents or users search for local services.

### Architecture

```
mainstreetly.com/business/[slug]
├── SEO Meta Tags (OpenGraph, structured data)
├── Business Profile (name, rating, hours, services)
├── Customer Reviews (from Google, Yelp)
├── Map (embedded Google Maps)
├── CTA: "Claim this business" or "Contact"
└── Analytics Tracking (for "your business was found X times")
```

### Structured Data (Schema.org)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Tony's Barbershop",
  "image": "https://...",
  "description": "Professional men's haircuts and beard trims in South Congress",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "4501 S Congress Ave",
    "addressLocality": "Austin",
    "addressRegion": "TX",
    "postalCode": "78745",
    "addressCountry": "US"
  },
  "telephone": "+15125550123",
  "url": "https://tonysbarbershop.com",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Monday",
      "opens": "09:00",
      "closes": "19:00"
    }
  ],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "ratingCount": "323"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "30.2272",
    "longitude": "-97.7631"
  }
}
</script>
```

### Implementation

```typescript
// pages/business/[slug].tsx (Next.js)
export async function getStaticProps({ params }) {
  const business = await db.businesses.findBySlug(params.slug);
  const services = await db.services.findByBusinessId(business.id);

  // Log view for analytics
  await db.queryAppearances.logPageView(business.id);

  return {
    props: { business, services },
    revalidate: 3600  // Revalidate every hour
  };
}

export default function BusinessProfile({ business, services }) {
  return (
    <>
      <Head>
        <title>{business.name} - Mainstreetly</title>
        <meta name="description" content={`${business.name} in ${business.city}`} />
        <meta property="og:title" content={business.name} />
        <meta property="og:image" content={business.photo_url} />
        <script type="application/ld+json">{/* schema above */}</script>
      </Head>

      <div className="business-profile">
        <h1>{business.name}</h1>
        <div className="rating">{business.rating_composite} ⭐</div>
        <p>{business.address}, {business.city}</p>
        <p>{business.phone}</p>

        <h2>Hours</h2>
        <div className="hours">
          {Object.entries(business.hours).map(([day, times]) => (
            <p key={day}>{day}: {times.open}-{times.close}</p>
          ))}
        </div>

        <h2>Services</h2>
        <ul>
          {services.map(s => (
            <li key={s.id}>{s.name} - ${s.price_min}-${s.price_max}</li>
          ))}
        </ul>

        <button onClick={() => claimBusiness(business.id)}>
          Claim This Business
        </button>
      </div>
    </>
  );
}
```

---

## 9. WhatsApp AI Agent

### Architecture

```
Business Owner's WhatsApp
        │
        ▼ (webhook)
┌──────────────────────────────┐
│  WhatsApp Webhook Handler    │
│  (Railway API service)       │
│                              │
│  Routes inbound messages to: │
│  ┌────────────────────────┐  │
│  │  Mainstreetly AI Agent │  │
│  │  (Claude Sonnet)       │  │
│  │                        │  │
│  │  System prompt includes│  │
│  │  business context from │  │
│  │  DB + conversation     │  │
│  │  history               │  │
│  └────────────────────────┘  │
│              │               │
│              ▼               │
│  ┌────────────────────────┐  │
│  │  Tool Router           │  │
│  │                        │  │
│  │  • confirm_booking()   │  │
│  │  • reschedule()        │  │
│  │  • update_services()   │  │
│  │  • update_hours()      │  │
│  │  • block_time()        │  │
│  │  • get_stats()         │  │
│  └────────────────────────┘  │
│              │               │
│              ▼               │
│     DB write + GCal sync     │
│              │               │
│              ▼               │
│  WhatsApp Cloud API → reply  │
└──────────────────────────────┘
```

### WhatsApp Cloud API — Direct Integration (No BSP)

**Why Direct:** Zero markup on Meta's per-message fees. Full control. TypeScript SDK available.

**Setup Requirements:**
1. Meta Business Account (free)
2. Meta Developer App with WhatsApp product
3. Dedicated phone number for Mainstreetly
4. Approved message templates
5. Webhook endpoint on Railway

### Cost Model

| Message Type | Cost | When Used |
|---|---|---|
| Service (reply within 24h) | **FREE** | Responding to business owner messages |
| Utility template | ~$0.015/msg | Booking notifications, confirmations |
| Marketing template | ~$0.025/msg | Upsell, weekly digest (use sparingly) |

**Projected cost at 100 premium businesses:**
- ~10 booking notifications/business/day = 1,000 utility msgs/day
- 1,000 × $0.015 = **$15/day = ~$450/month** in Meta fees
- Business owner replies are free (service window)
- Total: **$450–600/month** at 100 subscribers

### Three-Tier Message Routing (Cost Optimization)

**Resolved Decision:** Use Claude strategically, not for everything.

```typescript
// Inbound message routing
async function routeWhatsAppMessage(phone: string, text: string) {
  // Tier 1: Pattern Matching (FREE)
  // Simple, deterministic responses
  if (text.match(/^✅|^confirm/i)) {
    return confirmLastBooking(phone);
  }
  if (text.match(/^❌|^decline/i)) {
    return declineLastBooking(phone);
  }
  if (text.match(/^stats|^how am i/i)) {
    return getQuickStats(phone);  // Premade from DB
  }

  // Tier 2: Haiku (Intent Detection) — $0.001
  // Classify the intent cheaply
  const intent = await claude.haiku(`
    Classify this message intent (one word):
    "I need to add a new service - eyebrow threading for $15, 20 minutes"

    Options: booking_management, profile_update, availability, stats, other
  `, { text });

  if (intent === 'profile_update' || intent === 'availability') {
    // Tier 3: Sonnet (Complex Reasoning) — $0.03
    // For complex updates, use full model
    const response = await claude.sonnet(buildSystemPrompt(businessContext), {
      text,
      conversation_history,
      tools: [confirmBooking, updateServices, updateHours, blockTime]
    });
    return response;
  }

  // Default: Sonnet for general chat
  return claude.sonnet(buildSystemPrompt(businessContext), { text });
}
```

### Estimated Monthly Costs (100 subscribers)

- 1,000 booking notifications/day × $0.015 = $450
- 500 Haiku intent classifications/day × $0.001 = $5
- 200 Sonnet conversations/day × $0.01 (avg tokens) = $60
- **Total: ~$515/month** (covered by $4,900 subscription revenue)

### Message Templates (Pre-Approved by Meta)

```
TEMPLATE: new_booking_request
───────────────────────────
🆕 New Booking Request

Customer: {{1}}
Service: {{2}}
Date/Time: {{3}}

Reply: ✅ CONFIRM | 🔄 SUGGEST | ❌ DECLINE

TEMPLATE: booking_confirmed
───────────────────────────
✅ Booking Confirmed

{{1}} is booked for {{2}} at {{3}}.
Added to your Google Calendar.

TEMPLATE: daily_digest
───────────────────────────
📊 Your Mainstreetly Daily

Today's bookings: {{1}}
AI searches for "{{2}}": {{3}} this week
New inquiries: {{4}}

TEMPLATE: weekly_stats
───────────────────────────
📈 Weekly Report — {{1}}

🔍 AI agents searched your category {{2}} times
👤 Your business appeared in {{3}} results
📅 Bookings this week: {{4}}
💰 Estimated revenue: {{5}}
```

### System Prompt

```typescript
const buildSystemPrompt = (business: Business, services: Service[], stats: Stats) => `
You are the Mainstreetly AI Assistant for ${business.name}.
You help ${business.claimed_by_name} manage their business.

BUSINESS CONTEXT:
- Name: ${business.name}
- Category: ${business.category}
- Address: ${business.address}
- Hours: ${JSON.stringify(business.hours)}
- Services: ${JSON.stringify(services)}
- Calendar connected: ${business.calendar_connected ? 'Yes' : 'No'}

YOUR CAPABILITIES:
1. BOOKING MANAGEMENT — Confirm, reschedule, or decline requests
2. PROFILE UPDATES — Update services, prices, hours when the owner tells you
3. AVAILABILITY — Block/unblock time slots, sync calendar
4. STATS — Share analytics about AI searches, bookings, revenue
5. GENERAL Q&A — Answer questions about Mainstreetly

RULES:
- Be concise. This is WhatsApp, not email.
- Use emojis sparingly.
- Extract structured data from owner input and call appropriate tools.
- Never fabricate stats. Use real data.
- If unsure, ask for clarification.

CURRENT STATS:
- AI searches this week: ${stats.weeklySearches}
- Your appearances in results: ${stats.weeklyAppearances}
- Pending bookings: ${stats.pendingBookings}
- This month's bookings: ${stats.monthlyBookings}
`;
```

### Conversation Examples

```
── BOOKING NOTIFICATION ──────────────────────────────

[Mainstreetly]: 🆕 New Booking Request
Customer: Sarah M.
Service: Men's Haircut ($25)
Date/Time: Tomorrow, Mar 20 at 3:00 PM

Reply: ✅ CONFIRM | 🔄 SUGGEST | ❌ DECLINE

[Business Owner]: ✅

[Mainstreetly]: ✅ Done! Sarah M. is confirmed for tomorrow at 3 PM.
Added to your Google Calendar.

── PROFILE UPDATE VIA CHAT ───────────────────────────

[Business Owner]: Hey I'm adding a new service — beard trim for $15, takes about 20 min

[Mainstreetly]: Got it! Adding:
• Beard Trim — $15, 20 min

This will appear immediately in AI searches. ✅ Added.

── STATS CHECK ───────────────────────────────────────

[Business Owner]: How am I doing this week?

[Mainstreetly]: 📊 This week so far:
🔍 AI agents searched "barber" in your area 142 times
👤 Your business appeared in 47 of those results
📅 3 bookings confirmed
💰 Estimated revenue: $85

You're in the top 3 barbers in South Congress.
```

---

## 10. Google Calendar Integration

### OAuth2 Flow

```
Business owner clicks "Connect Google Calendar" in dashboard
        │
        ▼
┌────────────────────────────────────┐
│  /api/calendar/google/auth         │
│  Redirects to Google OAuth consent │
│  Scopes:                           │
│    calendar.events                 │
│    calendar.readonly               │
└──────────┬─────────────────────────┘
           │ callback
           ▼
┌────────────────────────────────────┐
│  /api/calendar/google/callback     │
│  Exchange code for tokens          │
│  Store in calendar_connections     │
│  List calendars → user picks one   │
│  Set up Google Push Notification   │
│    (webhook channel)               │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│  Initial Sync                      │
│  Pull next 30 days of events       │
│  Generate availability_slots       │
│  (inverse of busy times)           │
└────────────────────────────────────┘
```

### Sync Logic

**Inbound (Google → Mainstreetly):**
- Google Push Notifications webhook fires on calendar changes
- Fetch changed events since last sync token
- Recalculate `availability_slots` for affected dates
- Busy events → `is_available = false`
- Free slots (within business hours) → `is_available = true`

**Outbound (Mainstreetly → Google):**
- When a booking is confirmed, create a Google Calendar event
- Include customer name, service, and duration
- Store `google_event_id` on the booking record

### Availability Generation

```typescript
async function generateAvailability(businessId: string, date: string) {
  const business = await getBusinessWithHours(businessId);
  const busySlots = await getGoogleCalendarEvents(businessId, date);
  const dayHours = business.hours[dayOfWeek(date)];

  if (dayHours === 'closed') return [];

  // Generate 30-min slots within business hours
  const allSlots = generateTimeSlots(dayHours.open, dayHours.close, 30);

  // Remove slots that overlap with busy calendar events
  const availableSlots = allSlots.filter(slot =>
    !busySlots.some(busy => overlaps(slot, busy))
  );

  // Upsert into availability_slots table
  await upsertAvailabilitySlots(businessId, date, availableSlots);
}
```

### Google API Costs

| API Call | Cost | Volume |
|---|---|---|
| Calendar Events list | Free (quota: 1M/day) | High |
| Calendar Events insert | Free | Per booking |
| Push Notifications setup | Free | Per calendar |
| **Total** | **$0** | — |

---

## 11. Dashboard

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | SSR, API routes, React Server Components |
| Hosting | **Vercel** (free tier) or **Railway** | Vercel free handles this scale easily |
| Auth | **NextAuth.js + Magic Link** | No password friction |
| Styling | **Tailwind CSS** | Fast iteration |
| Charts | **Recharts** | Lightweight, React-native |
| Payments | **Stripe Checkout + Customer Portal** | Subscription management |

### Pages

```
/login                  — Magic link (email) or WhatsApp verification
/dashboard              — Home: today's bookings, weekly stats snapshot
/dashboard/profile      — Edit business info, services, hours, photos
/dashboard/bookings     — Booking list with status filters
/dashboard/calendar     — Connect/disconnect Google Calendar
/dashboard/analytics    — Charts: AI searches, appearances, bookings, revenue
/dashboard/settings     — Subscription (Stripe portal), WhatsApp connection
```

### Dashboard Wireframe

```
┌──────────────────────────────────────────────────────────┐
│  MAINSTREETLY  │  Tony's Barbershop        [Settings ⚙] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📅 TODAY — Mar 19                                       │
│  ┌──────────────────────────────────────────────────┐    │
│  │  3:00 PM  Sarah M. — Men's Haircut ($25) ✅      │    │
│  │  4:30 PM  James K. — Beard Trim ($15) ⏳ pending │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  📊 THIS WEEK                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 142        │ │ 47         │ │ $210       │           │
│  │ AI searches│ │ Your shows │ │ AI revenue │           │
│  │ "barber"   │ │ in results │ │ this week  │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  🔗 QUICK ACTIONS                                        │
│  [Connect Google Calendar]  [Update Services]            │
│  [View Full Analytics]      [Manage Subscription]        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 12. Stripe Integration

### Subscription Model

| Plan | Price | Features |
|---|---|---|
| **Free (Claimed)** | $0 | Profile editing, basic analytics (search count only) |
| **Premium** | $49/mo | Calendar sync, AI bookings, WhatsApp agent, full analytics, featured placement |
| **Enterprise** (future) | $99/mo | Multi-location, API access, custom integrations |

### Implementation

```typescript
// Checkout flow
app.post('/api/stripe/checkout', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    customer: user.stripe_customer_id || undefined,
    customer_email: !user.stripe_customer_id ? user.email : undefined,
    line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    success_url: `${BASE_URL}/dashboard?upgraded=true`,
    cancel_url: `${BASE_URL}/dashboard/settings`,
    metadata: { user_id: user.id, business_id: business.id },
  });
  res.json({ url: session.url });
});

// Webhook handler
app.post('/api/stripe/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed':
      await upgradeBusinessToPremium(event.data.object);
      await sendWhatsAppTemplate('premium_welcome', phone, [businessName]);
      break;

    case 'invoice.payment_failed':
      await sendWhatsAppTemplate('payment_failed', phone, [businessName]);
      break;

    case 'customer.subscription.deleted':
      await downgradeBusinessToClaimed(subscriptionId);
      break;
  }

  res.json({ received: true });
});
```

### Costs

| Item | Cost |
|---|---|
| Platform fee | 2.9% + $0.30 per transaction |
| At $49/mo subscription | ~$1.72 per subscriber per month |
| At 100 subscribers | ~$172/month to Stripe |

---

## 13. Booking Flow — End to End

### Two-Tier Booking System

**Resolved Decision:**
1. **Tier 1 (Auto-Confirm):** Calendar-connected businesses
   - Agent books → System checks availability → Auto-confirmed → Calendar event created
   - Customer gets immediate confirmation

2. **Tier 2 (Request-to-Book):** Non-calendar businesses
   - Agent books → System creates pending booking → WhatsApp notification sent to owner
   - Owner confirms within 30 min → Booking confirmed
   - If no response → Auto-expire, return "unconfirmed" to agent

```
STEP 1: Customer's AI agent calls MCP
────────────────────────────────────────
Agent → book_appointment({
  business_id: "uuid",
  service_id: "uuid",
  datetime: "2026-03-20T15:00:00-05:00",
  customer_name: "Sarah M.",
  customer_phone: "+15125559876"
})

STEP 2: MCP server processes
────────────────────────────────────────
1. Verify business is premium
2. Check availability_slots for requested time
3. If available:
   a. Create booking record (status: pending)
   b. Temporarily hold slot (is_available = false)
   c. Send WhatsApp notification to owner
   d. Return: { booked: true, status: "pending_confirmation", confirmation_eta: "15 minutes" }
4. If not available:
   a. Suggest 3 nearest alternative slots
   b. Return alternatives to agent

STEP 3: WhatsApp notification to business owner
────────────────────────────────────────
[Mainstreetly → Owner via template "new_booking_request"]

🆕 New Booking Request
Customer: Sarah M.
Service: Men's Haircut ($25)
Date/Time: Tomorrow, Mar 20 at 3:00 PM

Reply: ✅ CONFIRM | 🔄 SUGGEST | ❌ DECLINE

STEP 4: Business owner responds
────────────────────────────────────────
Case A: "✅" or "confirm"
  → AI agent parses intent → confirm_booking tool
  → Update booking status to "confirmed"
  → Create Google Calendar event
  → (Future) Notify customer agent of confirmation

Case B: "🔄 4pm instead"
  → AI agent parses → suggest_reschedule tool
  → Update booking with proposed_datetime
  → (Future) Agent negotiation loop

Case C: "❌" or "decline"
  → AI agent parses → decline_booking tool
  → Update booking status to "cancelled"
  → Release availability slot

STEP 5: Confirmation synced
────────────────────────────────────────
→ Google Calendar event created (if connected)
→ availability_slots updated
→ booking.status = "confirmed"
→ Stats incremented
```

---

## 14. Waitlist & Founding Member System

### Scarcity Mechanics

**Resolved Decision:**
- Cap founding members at **5 per category per city** (not 1)
- Track position in queue per city + category
- Invite overflow to waitlist

### Implementation

```sql
CREATE TABLE waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  name TEXT,
  position INT,  -- Position in queue for city+category
  invited_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',  -- pending | invited | claimed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_waitlist_city_category_email ON waitlist_signups(city, category, email);
```

### Founding Member Logic

```typescript
async function joinWaitlist(city: string, category: string, email: string) {
  // Check if already at max for this city+category
  const confirmedCount = await db.businesses.count({
    city: city.toLowerCase(),
    category: category.toLowerCase(),
    profile_status: { $in: ['claimed', 'premium'] }
  });

  if (confirmedCount >= 5) {
    // Add to waitlist
    const position = await db.waitlistSignups.count({
      city: city.toLowerCase(),
      category: category.toLowerCase()
    }) + 1;

    await db.waitlistSignups.insert({
      city: city.toLowerCase(),
      category: category.toLowerCase(),
      email: email,
      position: position,
      status: 'pending'
    });

    return { status: 'waitlist', position, message: `You're #${position} on the waitlist for ${category} in ${city}` };
  }

  // Space available — offer founding member pricing
  return {
    status: 'invited',
    message: 'You qualify for founding member pricing: $9/mo for 1 year (normally $49/mo)'
  };
}
```

---

## 15. Geocoding Strategy

### Global Architecture (No Austin Hardcoding)

**Resolved Decision:**
- Remove all Austin hardcoding from schema
- Support any city/state combination
- **Free local geocoding:** Census zip/city lookup table (~42,000 US zips)
- **Fallback:** Nominatim public API (free, no key required)

### Census Lookup Table

Seed a `geocoding_lookups` table with ~42,000 US zip codes:

```sql
CREATE TABLE geocoding_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geocoding_lookups_city_state ON geocoding_lookups(city, state);
```

**Data source:** USPS ZIP+4 data (public domain) or free Census dataset.

### Geocoding Implementation

```typescript
async function geocodeLocation(query: string): Promise<{ lat: number, lng: number }> {
  // Try Census lookup first (free)
  const [city, state] = query.split(',').map(s => s.trim());

  if (city && state) {
    const record = await db.geocodingLookups.findOne({
      city: city.toLowerCase(),
      state: state.toUpperCase()
    });

    if (record) {
      return { lat: record.latitude, lng: record.longitude };
    }
  }

  // Fallback: Nominatim (free, public API)
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json`);
    const data = await response.json();

    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    // Silent fail, user must refine query
  }

  throw new Error(`Could not geocode "${query}". Try "City, State" format.`);
}
```

---

## 16. Monorepo Structure

```
mainstreetly/
├── packages/
│   ├── mcp-server/                 # Core MCP server (stateless HTTP)
│   │   ├── src/
│   │   │   ├── index.ts           # Server entry + MCP tool definitions
│   │   │   ├── services/
│   │   │   │   ├── business.ts    # Search, get info, list categories
│   │   │   │   ├── booking.ts     # Booking state machine
│   │   │   │   └── availability.ts
│   │   │   ├── auth/
│   │   │   │   └── api-key.ts     # Bearer token validation, rate limiting
│   │   │   ├── health.ts          # Health check endpoint
│   │   │   └── metrics.ts         # Request logging, analytics
│   │   └── package.json
│   │
│   ├── api/                       # Business-owner API service
│   │   ├── src/
│   │   │   ├── index.ts          # Express app entry
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts        # Magic link login
│   │   │   │   ├── business.ts    # Profile CRUD
│   │   │   │   ├── bookings.ts    # Booking management
│   │   │   │   ├── calendar.ts    # Google Calendar OAuth + sync
│   │   │   │   ├── stripe.ts      # Checkout + webhooks
│   │   │   │   └── analytics.ts   # Stats endpoints
│   │   │   ├── services/
│   │   │   │   ├── whatsapp.ts    # WhatsApp Cloud API client
│   │   │   │   ├── calendar-sync.ts
│   │   │   │   ├── ai-agent.ts    # Claude API for WhatsApp
│   │   │   │   └── booking-engine.ts
│   │   │   └── webhooks/
│   │   │       ├── whatsapp.ts    # Meta webhook handler
│   │   │       ├── google-calendar.ts
│   │   │       └── stripe.ts
│   │   └── package.json
│   │
│   ├── dashboard/                 # Next.js web app
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── page.tsx       # Home
│   │   │       ├── profile/page.tsx
│   │   │       ├── bookings/page.tsx
│   │   │       ├── calendar/page.tsx
│   │   │       ├── analytics/page.tsx
│   │   │       └── settings/page.tsx
│   │   └── package.json
│   │
│   ├── sdk-typescript/            # TypeScript SDK for agents
│   │   ├── src/
│   │   │   ├── client.ts         # HTTP client + type definitions
│   │   │   ├── tools.ts          # Tool implementations (search, book, etc.)
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── sdk-python/               # Python SDK for agents
│   │   ├── src/
│   │   │   ├── client.py
│   │   │   ├── tools.py
│   │   │   └── types.py
│   │   └── setup.py
│   │
│   ├── shared/                   # Shared types, DB schema, utils
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   └── schema.ts     # Drizzle schema (all tables)
│   │   │   ├── types/
│   │   │   │   ├── business.ts
│   │   │   │   ├── booking.ts
│   │   │   │   └── common.ts
│   │   │   └── utils/
│   │   │       ├── geocoding.ts
│   │   │       ├── dedup.ts
│   │   │       └── hours-parser.ts
│   │   └── package.json
│   │
│   └── business-adapters/        # Integration adapters (Square, Calendly, etc.)
│       ├── src/
│       │   ├── base.ts          # Base adapter interface
│       │   ├── square.ts        # Square Appointments adapter
│       │   ├── calendly.ts      # Calendly adapter
│       │   ├── fresha.ts        # Fresha adapter
│       │   └── setmore.ts       # Setmore adapter
│       └── package.json
│
├── scripts/
│   ├── seed-osm.ts             # OpenStreetMap data seeding
│   ├── enrich-google.ts         # Google/Outscraper enrichment merge
│   ├── enrich-yelp.ts          # Yelp API enrichment
│   ├── deduplicate.ts          # Cross-source deduplication
│   ├── seed-geocoding.ts       # Seed Census zip/city data
│   └── refresh-materialized-views.ts
│
├── examples/
│   ├── book-haircut/           # "Book a haircut" demo agent
│   ├── restaurant-reserve/     # "Reserve a table" demo
│   └── check-availability/     # "Is this time available?" demo
│
├── docs/
│   ├── README.md
│   ├── GETTING_STARTED.md
│   ├── MCP_PROTOCOL.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Run tests on PR
│   │   ├── deploy-mcp.yml      # Deploy MCP to Railway
│   │   ├── deploy-api.yml      # Deploy API to Railway
│   │   └── deploy-dashboard.yml # Deploy dashboard to Vercel
│   └── CODEOWNERS
│
├── drizzle.config.ts
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .gitignore
├── LICENSE                     # BSL 1.1
├── CONTRIBUTING.md
└── README.md
```

---

## 17. Tech Stack

| Layer | Technology | Reasoning |
|---|---|---|
| **MCP Server** | TypeScript + official MCP SDK | Best MCP ecosystem support |
| **API Service** | Express.js (Node.js) | Fast, lightweight, mature |
| **Dashboard** | Next.js 15 (App Router) | SSR, API routes, fast iteration |
| **Database** | PostgreSQL + PostGIS + Drizzle | Spatial queries, reliable, type-safe ORM |
| **Hosting (MCP)** | Railway.app | Simple deployment, managed DB |
| **Hosting (Dashboard)** | Vercel | Free tier, optimized for Next.js |
| **Auth** | NextAuth.js + Magic Link | Zero friction for non-technical users |
| **Payments** | Stripe | Mature, handles subscriptions |
| **WhatsApp** | Meta Cloud API (direct, no BSP) | Zero markup, full control |
| **Calendar** | Google Calendar API | 65% SMB adoption |
| **AI** | Claude API (Sonnet) | Best tool-calling, cost-effective |
| **Monitoring** | Sentry | Free tier, great error tracking |
| **Scraping** | Overpass API + Outscraper + Yelp | OSM free foundation + paid enrichment |
| **Package Manager** | pnpm | Monorepo workspace, fast |
| **Testing** | Jest + Supertest | Unit + integration tests |

---

## 18. Cost Summary

### Phase 1: MVP (Months 1–3) — ~$5–35/month

| Service | Plan | Cost |
|---|---|---|
| GitHub Organization | Free (public + private repos) | $0 |
| Cloudflare | Free tier (MCP hosting, DNS, CDN) | $0 |
| Railway.app | Hobby plan (API + PostgreSQL) | $5/mo |
| Sentry | Free tier (error monitoring) | $0 |
| Outscraper | Seed 10K businesses | ~$30 once |
| Yelp API | 30-day trial (5,000 calls) | $0 |
| OpenStreetMap | Overpass API | $0 |
| **Total** | | **~$5/mo + $30 one-time** |

### Phase 2: Launch (Months 4–6) — ~$50–100/month

Add: Stripe (2.9% per transaction), upgraded Railway, analytics, SMS (optional).

### At Scale (100 Premium Subscribers @ $49/mo = $4,900/mo revenue)

| Service | Cost |
|---|---|
| **Railway** (API + DB) | $20–50/mo |
| **Vercel** (Dashboard) | $0–20/mo |
| **WhatsApp Cloud API** | $450–600/mo |
| **Claude API** (Sonnet) | $100–200/mo |
| **Stripe fees** | $172/mo |
| **Google Calendar API** | $0 |
| **Domain + misc** | $20/mo |
| **Total infrastructure** | **~$762–1,062/mo** |
| **Gross margin** | **~$3,838–4,138/mo (78–84%)** |

---

## 19. Testing Strategy

### Unit Tests

**What to test:**
- Category mapping (OSM → standardized categories)
- Search logic (filters, sorting)
- Deduplication algorithm (address normalization, source overlap)
- Hours parsing (`opening_hours` library)
- API key validation and rate limiting
- Booking state machine (pending → confirmed → completed)

**Example (Jest):**

```typescript
// tests/search.test.ts
describe('searchBusinesses', () => {
  it('should find barbers within radius', async () => {
    const results = await businessService.search({
      query: 'barber',
      location: 'Austin, TX',
      radius_km: 5
    });

    expect(results).toHaveLength(greaterThan(0));
    expect(results[0].category).toBe('barber');
    expect(results[0].distance_km).toBeLessThanOrEqual(5);
  });

  it('should filter by price', async () => {
    const results = await businessService.search({
      query: 'haircut',
      max_price: 30
    });

    expect(results.every(r => r.price_min <= 30)).toBe(true);
  });

  it('should filter by rating', async () => {
    const results = await businessService.search({
      query: 'dentist',
      min_rating: 4.5
    });

    expect(results.every(r => r.rating_composite >= 4.5)).toBe(true);
  });
});

// tests/dedup.test.ts
describe('deduplication', () => {
  it('should merge records with matching address + source overlap', async () => {
    const osm = { name: 'Tony Barbershop', address: '4501 S Congress', osm_id: '123' };
    const google = { name: 'Tony\'s Barbershop', address: '4501 S Congress', google_id: '456' };

    const merged = await dedupService.merge([osm, google]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source_osm_id).toBe('123');
    expect(merged[0].source_google_place_id).toBe('456');
  });

  it('should not merge if proximity > 50m', async () => {
    const rec1 = { address: '4501 S Congress', lat: 30.227, lng: -97.763 };
    const rec2 = { address: '4502 S Congress', lat: 30.228, lng: -97.762 };

    const distance = haversine(rec1, rec2);
    expect(distance).toBeGreaterThan(50);

    const merged = await dedupService.merge([rec1, rec2]);
    expect(merged).toHaveLength(2);  // No merge
  });
});

// tests/hours-parser.test.ts
describe('hours parsing', () => {
  it('should parse OSM format', () => {
    const osm = 'Mo-Fr 09:00-19:00; Sa 08:00-18:00; Su closed';
    const hours = parseHours(osm);

    expect(hours.monday).toEqual({ open: '09:00', close: '19:00' });
    expect(hours.sunday).toBe('closed');
  });

  it('getTodayHours() should return real data', () => {
    const business = { hours: { monday: { open: '09:00', close: '19:00' } } };
    const today = getTodayHours(business, new Date('2026-03-19'));  // Monday

    expect(today).toEqual({ open: '09:00', close: '19:00' });
  });
});
```

### Integration Tests

**What to test:**
- Full search flow: geocoding → spatial query → results
- Booking flow: create booking → send WhatsApp → confirm → update calendar
- Calendar sync: OAuth → initial sync → push notifications
- Analytics: log queries → aggregate stats

**Example (Supertest):**

```typescript
// tests/integration/search.integration.ts
describe('Search Integration', () => {
  it('should search and return real results', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ query: 'barber', location: 'Austin, TX' })
      .set('Authorization', `Bearer ${testApiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(greaterThan(0));
    expect(res.body.results[0]).toHaveProperty('id');
    expect(res.body.results[0]).toHaveProperty('rating_composite');
  });
});

// tests/integration/booking.integration.ts
describe('Booking Integration', () => {
  it('should create pending booking and send WhatsApp notification', async () => {
    const bookingRes = await request(app)
      .post('/api/book')
      .set('Authorization', `Bearer ${testApiKey}`)
      .send({
        business_id: businessId,
        service_id: serviceId,
        datetime: '2026-03-20T15:00:00Z',
        customer_name: 'Test User'
      });

    expect(bookingRes.status).toBe(200);
    expect(bookingRes.body.status).toBe('pending');

    // Verify WhatsApp notification was queued
    const notifications = await db.whatsappNotifications.find({ booking_id: bookingRes.body.id });
    expect(notifications).toHaveLength(1);
  });
});
```

### Smoke Tests (MCP Endpoints)

```typescript
// tests/smoke/mcp.test.ts
describe('MCP Smoke Tests', () => {
  it('should list service categories', async () => {
    const res = await mcpClient.call('list_service_categories', {});
    expect(res).toHaveProperty('results');
    expect(res.results).toHaveLength(greaterThan(5));
  });

  it('should search businesses', async () => {
    const res = await mcpClient.call('search_businesses', {
      query: 'barber',
      location: 'Austin, TX'
    });
    expect(res.results).toHaveLength(greaterThan(0));
  });

  it('should get business info', async () => {
    const searchRes = await mcpClient.call('search_businesses', {
      query: 'dentist',
      location: 'Austin, TX'
    });

    const businessId = searchRes.results[0].id;
    const infoRes = await mcpClient.call('get_business_info', { business_id: businessId });

    expect(infoRes).toHaveProperty('services');
    expect(infoRes).toHaveProperty('hours');
  });
});
```

### Before Launch

- ✅ Unit test coverage for critical business logic (search, dedup, hours parsing)
- ✅ Integration tests for data pipeline (OSM seed → merge → availability)
- ✅ Integration tests for booking flow (create → WhatsApp → confirm)
- ✅ Smoke tests for all MCP endpoints
- ✅ Manual testing of dashboard (profile claiming, subscription signup)
- ✅ Manual testing of WhatsApp flows (booking notification, stats query)

---

## 20. Licensing

### Dual License Strategy

**Resolved Decision:**

#### Apache 2.0 for Client SDKs

```text
Modules:
- sdk-typescript
- sdk-python
- business-adapters

Rationale: Developers building on Mainstreetly should be able to
ship code without license compatibility headaches.
```

#### Business Source License 1.1 (BSL) for Server & Data Pipeline

```text
Licensed Work:    Mainstreetly Gateway v1.0
Licensor:         [Your Company]
Additional Use Grant:
  You may use the Licensed Work in production provided that you do NOT
  offer it as a commercial hosted service that competes with Licensor's
  hosted offering.

  Individual developers and companies with <$5M annual revenue may use
  the Licensed Work freely for any purpose including production use.

Change Date:      4 years after each version release
Change License:   Apache License 2.0
```

**Protection:**
- ✅ Agent developers use MCP freely (consumers, not competitors)
- ✅ Small businesses and startups use it freely
- ❌ Big companies can't clone and compete
- 🔄 After 4 years, becomes Apache 2.0

---

## 21. Security & IP Protection

### Secrets Management

```bash
# .gitignore
.env
.env.*
*.pem
*.key
.DS_Store
node_modules/
```

### Pre-Commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

### Signed Commits

```bash
git config --global commit.gpgsign true
```

### CODEOWNERS (GitHub)

```
# .github/CODEOWNERS
/packages/mcp-server/src/auth/    @your-username
LICENSE                            @your-username
*.env*                             @your-username
```

### Environment Variables (.env.example — public)

```bash
# Public example (no secrets)
DATABASE_URL=postgresql://localhost/mainstreetly_dev
NEXT_PUBLIC_API_URL=http://localhost:3001
SENTRY_DSN=
```

### Actual Secrets (Railway secrets, never in git)

```
WHATSAPP_ACCESS_TOKEN
STRIPE_SECRET_KEY
ANTHROPIC_API_KEY
GOOGLE_CLIENT_SECRET
DATABASE_URL (with password)
```

---

## 22. Git Workflow

```
main (protected, always deployable)
  ├── dev (integration branch)
  │     ├── feature/add-square-adapter
  │     ├── feature/osm-seed-script
  │     ├── fix/spatial-query-performance
  │     └── feature/waitlist-mechanics
  └── release/v1.0
```

### Daily Workflow

```bash
# Start new feature
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# Commit with GPG signing
git add src/my-file.ts
git commit -S -m "Add my feature"

# Open PR against dev (not main)
git push origin feature/my-feature
# Open PR on GitHub: feature/my-feature → dev

# Merge strategy: squash + rebase (keeps main clean)
```

### Protection Rules

- ✅ Require pull request reviews (1+ approval)
- ✅ Require signed commits
- ✅ Require status checks (CI/CD tests pass)
- ❌ Allow force pushes? NO
- ❌ Allow deletions? NO

---

## 23. Agent Discovery & Distribution

| Channel | Action | Priority |
|---|---|---|
| **Smithery.ai** | Publish on the MCP marketplace | 🔴 High |
| **mcpt (Mintlify)** | Register MCP server | 🔴 High |
| **npm & PyPI** | Publish SDK packages | 🔴 High |
| **Claude MCP Directory** | Apply for listing | 🟡 Medium |
| **GitHub Topics** | Tag: `mcp`, `mcp-server`, `booking`, `ai-agents` | 🟡 Medium |
| **Hacker News** | "Show HN: MCP server for booking local businesses" | 🟡 Medium |
| **OpenClaw Discord** | Post in agent developer channels | 🟡 Medium |
| **r/LocalLLaMA** | Cross-post with examples | 🟡 Medium |
| **Dev blogs** | "Building Agent-Native Local Commerce" | 🟡 Medium |

### Built-in Discovery

- Semantic tool names
- Rich tool descriptions
- Public SEO pages on mainstreetly.com
- `npx mainstreetly-mcp` starter command
- Open-source examples (book-haircut, restaurant-reserve)

---

## 24. Go-To-Market

### Geographic Focus (Phase 1)

**Primary:** Austin, Texas (Codie Sanchez's market, high SMB density)
**Phase 2:** Expand to 5–10 major metros (SF, NYC, LA, Chicago, Boston, etc.)
**Phase 3:** Global (pre-loaded OSM + city-specific Outscraper runs)

### Initial GTM

1. **Agents:** Blog post + Smithery submission → "Here's a working MCP for booking"
2. **Businesses:** Proactive WhatsApp outreach → "Your barber shop was found 47 times by AI this month"
3. **Founding members:** 5 per category per city at $9/mo for 1 year (scarcity)
4. **Local communities:** Austin business Facebook groups, Chamber of Commerce

### Pre-Launch Checklist

- [ ] Database seeded with 10,000+ Austin service businesses
- [ ] MCP server deployed on Railway, health check working
- [ ] First 50 claimed profiles (manual outreach)
- [ ] WhatsApp business account set up
- [ ] Dashboard live on Vercel
- [ ] Stripe account connected
- [ ] Google Calendar OAuth working
- [ ] Example agents published
- [ ] Documentation complete

---

## 25. Competitive Landscape & Moat

### Competitive Landscape

- **Jobber**: Internal business management, not agent-facing
- **VOYGR (YC)**: Maps/place data for agents, not business onboarding
- **Orthogonal (YC)**: API marketplace for devs, not SMB-focused
- **Natural ($9.8M seed)**: Agent payments infra, complementary
- **Google UCP / OpenAI ACP**: Product commerce only, not services
- **Gap:** Nobody making small non-technical service businesses agent-accessible

### Mainstreetly's Moat

1. **First-party owner relationships via WhatsApp**
   - Claimed profiles = owned data
   - WhatsApp AI agent = recurring engagement
   - Multi-agent compatibility (the "Switzerland play")

2. **Owner-verified structured data**
   - Scraped data is the on-ramp
   - Verified services/pricing/hours is the product
   - Composite ratings (multi-source) = unavailable elsewhere

3. **Data density**
   - 100K+ pre-seeded businesses per city (day 1)
   - Deduped, merged, rated, enriched
   - Competitor would need months/years to accumulate

4. **Booking integration**
   - Seamless agent → booking flow
   - Calendar sync as core premium upsell
   - Two-tier system (auto-confirm + request-to-book)

---

## 26. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Someone clones repo and competes | BSL license prevents competitive hosting for 4 years |
| API keys leak to public repo | detect-secrets pre-commit + GitHub scanning |
| Small businesses don't claim profiles | Pre-loaded data makes MCP useful anyway; analytics drive claims |
| Google ToS enforcement on scraped data | OSM is foundation (100% clean); Google data is one-time seed; claimed profiles are source of truth |
| MCP standard changes | Follow Agentic AI Foundation (Linux Foundation) updates |
| Google/OpenAI launch services protocol | Already in market with density + local relationships + Switzerland play |
| Meta template approval delays | Submit templates early; fallback to service messages within 24h window |
| Business owner doesn't respond to booking | Auto-expire pending bookings after 30 min; return "unconfirmed" to agent |
| Google Calendar token refresh fails | Cron job to refresh 1 hour before expiry; alert on failure |
| WhatsApp number gets flagged | Follow Meta's messaging policies strictly; low volume per number initially |
| Claude API costs spike | Set budget alerts; cache business context; use Haiku for intent, Sonnet for complex |
| Stripe webhook missed | Idempotent handlers; cron reconciliation every 6 hours |

---

## 27. Environment Variables

### MCP Server (.env)

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname

# API Key Management
API_KEY_HASH_SALT=your-secret-salt

# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=info

# Hosting
PORT=3000
NODE_ENV=production
```

### API Service (.env)

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname

# WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=EAAxxxxx
WHATSAPP_VERIFY_TOKEN=webhook-verify-token
WHATSAPP_APP_SECRET=app-secret-for-signature

# Google Calendar OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://api.mainstreetly.com/api/calendar/google/callback

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx

# Claude API (for WhatsApp AI agent)
ANTHROPIC_API_KEY=sk-ant-xxx

# Dashboard
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://app.mainstreetly.com

# Hosting
PORT=3001
NODE_ENV=production
```

### Dashboard (.env.local)

```env
# Public API
NEXT_PUBLIC_API_URL=https://api.mainstreetly.com
NEXT_PUBLIC_STRIPE_KEY=pk_live_xxx

# Auth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://app.mainstreetly.com
```

---

## 28. Domain Architecture

| Domain | Purpose | Hosting |
|---|---|---|
| `mainstreetly.com` | Marketing + SEO profiles | Vercel / Netlify |
| `api.mainstreetly.com` | Business API + webhooks | Railway |
| `app.mainstreetly.com` | Dashboard | Vercel |
| `mcp.mainstreetly.com` | MCP server (optional alias) | Railway |

---

## 29. Phased Build Plan

### PHASE 1: "The Directory" (Weeks 1–4)

**What to Build:**
1. Data pipeline — seed businesses from OSM + Outscraper + Yelp
2. PostgreSQL + PostGIS database on Railway
3. MCP server with `search_businesses`, `get_business_info`, `list_service_categories`
4. Stub tools for `check_availability` and `book_appointment` (return contact info)
5. Landing page for business owners to claim profiles
6. Public business pages with structured data (SEO fallback)
7. Agent query logging for analytics

**Key Milestone:** An agent can ask "find me a barber near downtown Austin with good reviews" and get real results with ratings from multiple sources.

**Deliverables:**
- [ ] MCP server deployed on Railway, health check working
- [ ] Database with 10,000+ Austin businesses
- [ ] Landing page + profile claiming flow
- [ ] Public profile pages (SEO-optimized)
- [ ] First 50 businesses claimed manually
- [ ] Example agent (book-haircut)
- [ ] Published on Smithery + npm

**Revenue Phase 1 (Optional):** Manual onboarding $150–300/business, featured profiles $20–50/mo, consulting $500–1,000

### PHASE 2: "The Action" (Weeks 5–10)

**Real-Time Availability System (Three Tiers):**
1. Google/Outlook Calendar sync: blocked = booked, open = available
2. Booking tool integrations: Square, Calendly, Fresha, Setmore, Jobber (adapter plugins)
3. SMS/WhatsApp availability bot: daily text → Claude structures → time blocks

**Booking Capability:**
- Business connects existing tools OR uses built-in scheduler
- Agents book appointments, request quotes, place orders
- Two-tier system: auto-confirm (calendar-connected) + request-to-book (manual)

**Deliverables:**
- [ ] Google Calendar OAuth + sync
- [ ] WhatsApp AI agent (Sonnet)
- [ ] Booking state machine
- [ ] Dashboard (Next.js, Vercel)
- [ ] Stripe subscription integration
- [ ] WhatsApp message templates (Meta-approved)
- [ ] Calendar push notifications

**Revenue Phase 2:** Transaction fee $1–3/booking (or 3–5%), Pro $49/mo, integration setup $100

### PHASE 3: Scale & Expand (Weeks 11+)

- Multi-city expansion (SF, NYC, LA, Chicago, Boston)
- OAuth 2.1 for agents
- Business adapter ecosystem (marketplace for integrations)
- Analytics API for partners
- Multi-location support ($99/mo enterprise plan)
- SMS booking fallback for agents without WhatsApp

---

## Immediate Build Priority (This Week)

### Day 1: Foundation
- [ ] Create GitHub Organization (`mainstreetly`)
- [ ] Create public + private repos with BSL 1.1 LICENSE
- [ ] Set up branch protection, GPG commits, .gitignore, CODEOWNERS
- [ ] Set up Railway project with PostgreSQL + PostGIS

### Day 2: Data Pipeline
- [ ] Write OSM seed script (Overpass API → parse → insert)
- [ ] Run Outscraper export for top 18 service categories
- [ ] Write merge/dedup script (OSM + Outscraper → unified)
- [ ] Sign up for Yelp API trial, write enrichment script
- [ ] Verify: database has 10,000+ businesses with ratings

### Day 3–4: MCP Server
- [ ] Initialize TypeScript + MCP SDK project
- [ ] Implement `search_businesses` with PostGIS spatial queries
- [ ] Implement `get_business_info` with full profile
- [ ] Implement `list_service_categories` with business counts
- [ ] Implement stubs for `check_availability` and `book_appointment`
- [ ] Test with Claude Desktop as MCP client

### Day 5–6: Profile Claiming + Landing Page
- [ ] Build claim flow: business owner verifies ownership (phone/email)
- [ ] Build profile editor: add services, pricing, hours corrections
- [ ] Landing page explaining value prop
- [ ] Public business profile pages with structured data

### Day 7: Deploy + Distribute
- [ ] Deploy MCP server on Railway
- [ ] Register on Smithery.ai and mcpt
- [ ] Write "Book a haircut in Austin" example
- [ ] Post on OpenClaw Discord, r/LocalLLaMA
- [ ] Test end-to-end: user → Claude → MCP → real Austin results

---

## Final Notes

This document is the complete technical and business blueprint for Mainstreetly. It supersedes all prior architecture documents. Use this as your specification:

1. **For agents:** "Build with the Mainstreetly MCP. Here's what it does, what it doesn't."
2. **For business owners:** "Make your business visible to AI. Start free, upgrade for bookings."
3. **For the team:** "This is what we're building, why, and how."

Every decision is justified. Every section is actionable. When in doubt, refer back to the **Resolved Architecture Decisions** at the top.

**Ship Phase 1, then reassess Phase 2 based on real usage data.**

---

**Document end.**
