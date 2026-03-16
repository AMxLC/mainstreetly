#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchBusinesses,
  getBusinessProfile,
  listCategories,
} from "./services/business.service.js";
import { logQuery } from "./services/query-logger.js";

const server = new McpServer({
  name: "mainstreetly-gateway",
  version: "0.1.0",
});

// ─── Tool: Search businesses ────────────────────────────────────────────────

server.tool(
  "search_businesses",
  "Find local service businesses by type and location. Search for barbers, dentists, plumbers, cleaners, restaurants, spas, mechanics, and more in Austin TX. Returns ratings from Google, Yelp, and Facebook. Supports price and rating filters.",
  {
    query: z
      .string()
      .describe(
        "What type of business (e.g. 'haircut', 'dentist', 'plumber', 'auto repair')",
      ),
    location: z
      .string()
      .describe(
        "City, address, or zip code (e.g. 'Austin, TX', '78704', 'South Congress')",
      ),
    radius_km: z.number().optional().default(10).describe("Search radius in km (default 10)"),
    max_price: z.number().optional().describe("Maximum price filter in USD"),
    min_rating: z.number().optional().describe("Minimum composite rating (1-5)"),
    limit: z.number().optional().default(20).describe("Max results to return (default 20)"),
  },
  async ({ query, location, radius_km, max_price, min_rating, limit }) => {
    const start = Date.now();

    const response = await searchBusinesses({
      query,
      location,
      radius_km,
      max_price,
      min_rating,
      limit,
    });

    const elapsed = Date.now() - start;

    // Log asynchronously — don't block the response
    logQuery({
      queryText: `${query} near ${location}`,
      location,
      resultsCount: response.count,
      businessIds: response.results.map((r) => r.id),
      responseTimeMs: elapsed,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response) }],
    };
  },
);

// ─── Tool: Get business info ────────────────────────────────────────────────

server.tool(
  "get_business_info",
  "Get full details about a specific business including services, hours, pricing, ratings from Google/Yelp/Facebook, and contact information.",
  {
    business_id: z.string().uuid().describe("UUID of the business"),
  },
  async ({ business_id }) => {
    const profile = await getBusinessProfile(business_id);

    if (!profile) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Business not found",
              business_id,
            }),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(profile) }],
    };
  },
);

// ─── Tool: List service categories ──────────────────────────────────────────

server.tool(
  "list_service_categories",
  "List all available service categories with business counts. Use this to discover what types of businesses are available (barber, dentist, plumber, restaurant, etc.).",
  {},
  async () => {
    const categories = await listCategories();
    return {
      content: [{ type: "text", text: JSON.stringify({ categories }) }],
    };
  },
);

// ─── Tool: Check availability (stub — Phase 2) ─────────────────────────────

server.tool(
  "check_availability",
  "Check if a business has availability on a specific date and time. Currently only available for premium businesses with calendar integration.",
  {
    business_id: z.string().uuid().describe("UUID of the business"),
    date: z.string().describe("Date in YYYY-MM-DD format"),
    time_range: z
      .string()
      .optional()
      .describe("Preferred time range (e.g. '2pm-4pm')"),
  },
  async ({ business_id, date, time_range }) => {
    const profile = await getBusinessProfile(business_id);

    if (!profile) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: "Business not found" }) },
        ],
      };
    }

    if (profile.profile_status !== "premium") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              available: "unknown",
              message:
                "Real-time availability not yet enabled for this business. Contact them directly.",
              phone: profile.phone,
              website: profile.website,
              hours: profile.hours,
            }),
          },
        ],
      };
    }

    // Phase 2: Query availability_slots table
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            available: "unknown",
            message: "Availability checking coming soon for premium businesses.",
            phone: profile.phone,
            website: profile.website,
          }),
        },
      ],
    };
  },
);

// ─── Tool: Book appointment (stub — Phase 2) ───────────────────────────────

server.tool(
  "book_appointment",
  "Book an appointment at a local business. Currently only available for premium businesses with booking enabled.",
  {
    business_id: z.string().uuid().describe("UUID of the business"),
    service_id: z.string().uuid().optional().describe("UUID of the specific service"),
    datetime: z.string().describe("Desired appointment time in ISO 8601 format"),
    customer_name: z.string().describe("Customer's name"),
    customer_phone: z.string().optional().describe("Customer's phone number"),
  },
  async ({ business_id }) => {
    const profile = await getBusinessProfile(business_id);

    if (!profile) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: "Business not found" }) },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            booked: false,
            message:
              profile.profile_status === "premium"
                ? "Booking integration coming soon."
                : "Online booking not yet enabled for this business. Contact them directly.",
            phone: profile.phone,
            website: profile.website,
          }),
        },
      ],
    };
  },
);

// ─── Tool: Cancel booking (stub — Phase 2) ──────────────────────────────────

server.tool(
  "cancel_booking",
  "Cancel an existing booking. Requires the booking confirmation ID.",
  {
    booking_id: z.string().describe("Booking confirmation ID"),
  },
  async ({ booking_id }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            cancelled: false,
            message: "Booking management coming soon. Contact the business directly to cancel.",
            booking_id,
          }),
        },
      ],
    };
  },
);

// ─── Start server ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mainstreetly MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
