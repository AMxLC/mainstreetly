/**
 * seed-osm.ts — Seed Austin service businesses from OpenStreetMap (Overpass API)
 *
 * Queries the Overpass API for service businesses in the Austin, TX bounding box,
 * maps OSM tags to Mainstreetly categories, generates slugs, and inserts into PostgreSQL.
 *
 * Usage: pnpm seed:osm
 * Requires: DATABASE_URL environment variable
 */

import { getDb, businesses } from "@mainstreetly/shared";
import { OSM_CATEGORY_MAP } from "@mainstreetly/shared";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

// Load .env file if present
try {
  const envContent = readFileSync(".env", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env not found, rely on environment variables
}

// Austin bounding box: south, west, north, east
const AUSTIN_BBOX = "30.1,-97.95,30.55,-97.55";

// OSM tag groups to query
const TAG_QUERIES = [
  `node["shop"~"hairdresser|beauty|barber|car_repair|car_parts|laundry|dry_cleaning"](${AUSTIN_BBOX})`,
  `node["amenity"~"dentist|doctors|clinic|veterinary|restaurant|cafe|fast_food|childcare"](${AUSTIN_BBOX})`,
  `node["craft"~"plumber|electrician|hvac|painter|carpenter"](${AUSTIN_BBOX})`,
  `node["office"~"estate_agent|lawyer|accountant"](${AUSTIN_BBOX})`,
  `node["leisure"~"fitness_centre|spa"](${AUSTIN_BBOX})`,
  `way["shop"~"hairdresser|beauty|barber|car_repair|car_parts|laundry|dry_cleaning"](${AUSTIN_BBOX})`,
  `way["amenity"~"dentist|doctors|clinic|veterinary|restaurant|cafe|fast_food|childcare"](${AUSTIN_BBOX})`,
  `way["craft"~"plumber|electrician|hvac|painter|carpenter"](${AUSTIN_BBOX})`,
  `way["office"~"estate_agent|lawyer|accountant"](${AUSTIN_BBOX})`,
  `way["leisure"~"fitness_centre|spa"](${AUSTIN_BBOX})`,
];

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OsmResponse {
  elements: OsmElement[];
}

function buildOverpassQuery(): string {
  const unionParts = TAG_QUERIES.join(";\n  ");
  return `[out:json][timeout:120];
(
  ${unionParts};
);
out body center;`;
}

function extractCategory(tags: Record<string, string>): string | null {
  // Check tag types in priority order: shop, amenity, craft, office, leisure
  for (const tagKey of ["shop", "amenity", "craft", "office", "leisure"]) {
    const value = tags[tagKey];
    if (value && OSM_CATEGORY_MAP[value]) {
      return OSM_CATEGORY_MAP[value];
    }
  }
  return null;
}

function generateSlug(name: string, id: number): string {
  const base = name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${id}`;
}

function parseHours(tags: Record<string, string>): Record<string, unknown> | null {
  const raw = tags.opening_hours;
  if (!raw) return null;

  // Store raw OSM hours string — proper parsing is complex
  // A full parser would handle "Mo-Fr 09:00-17:00; Sa 10:00-14:00" etc.
  return { raw };
}

function buildAddress(tags: Record<string, string>): string {
  const parts = [];
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  if (tags["addr:street"]) parts.push(tags["addr:street"]);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  // Fallback: use name + general location
  return tags["addr:full"] || "Austin, TX";
}

interface BusinessRecord {
  name: string;
  slug: string;
  category: string;
  subcategories: string[];
  address: string;
  city: string;
  state: string;
  zip: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  email: string | null;
  hours: Record<string, unknown> | null;
  sourceOsmId: string;
  dataSources: string[];
  profileStatus: string;
  lastScrapedAt: Date;
}

function osmElementToRecord(el: OsmElement): BusinessRecord | null {
  if (!el.tags?.name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const category = extractCategory(el.tags);
  if (!category) return null;

  const tags = el.tags;

  return {
    name: tags.name,
    slug: generateSlug(tags.name, el.id),
    category,
    subcategories: tags.cuisine
      ? tags.cuisine.split(";").map((s) => s.trim())
      : [],
    address: buildAddress(tags),
    city: tags["addr:city"] || "Austin",
    state: tags["addr:state"] || "TX",
    zip: tags["addr:postcode"] || null,
    latitude: lat,
    longitude: lon,
    phone: tags.phone || tags["contact:phone"] || null,
    website: tags.website || tags["contact:website"] || null,
    email: tags.email || tags["contact:email"] || null,
    hours: parseHours(tags),
    sourceOsmId: `${el.type}/${el.id}`,
    dataSources: ["osm"],
    profileStatus: "auto",
    lastScrapedAt: new Date(),
  };
}

async function fetchOverpassData(): Promise<OsmElement[]> {
  const query = buildOverpassQuery();
  console.log("Querying Overpass API for Austin service businesses...");
  console.log(`Query length: ${query.length} chars`);

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(
      `Overpass API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as OsmResponse;
  console.log(`Received ${data.elements.length} raw elements from Overpass`);
  return data.elements;
}

async function main() {
  console.log("=== Mainstreetly OSM Seed Script ===\n");

  // Fetch data from Overpass API
  const elements = await fetchOverpassData();

  // Convert to business records
  const records: BusinessRecord[] = [];
  const seen = new Set<string>(); // deduplicate by OSM ID

  for (const el of elements) {
    const osmId = `${el.type}/${el.id}`;
    if (seen.has(osmId)) continue;
    seen.add(osmId);

    const record = osmElementToRecord(el);
    if (record) records.push(record);
  }

  console.log(`\nParsed ${records.length} valid business records`);

  // Count by category
  const categoryCounts = new Map<string, number>();
  for (const r of records) {
    categoryCounts.set(r.category, (categoryCounts.get(r.category) || 0) + 1);
  }
  console.log("\nCategory breakdown:");
  for (const [cat, count] of [...categoryCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${cat}: ${count}`);
  }

  // Insert into database in batches
  const db = getDb();
  const BATCH_SIZE = 100;
  let inserted = 0;
  let skipped = 0;

  console.log(`\nInserting into database in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    try {
      await db
        .insert(businesses)
        .values(batch)
        .onConflictDoNothing({ target: businesses.slug });
      inserted += batch.length;
    } catch (err) {
      // Handle individual slug conflicts by inserting one at a time
      for (const record of batch) {
        try {
          await db
            .insert(businesses)
            .values(record)
            .onConflictDoNothing({ target: businesses.slug });
          inserted++;
        } catch (innerErr) {
          skipped++;
          console.error(`  Skipped "${record.name}": ${innerErr}`);
        }
      }
    }

    if ((i / BATCH_SIZE) % 10 === 0 && i > 0) {
      console.log(`  Progress: ${inserted} inserted, ${skipped} skipped`);
    }
  }

  // Final count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businesses);

  console.log(`\n=== Seed Complete ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total businesses in database: ${count}`);
}

main()
  .catch((err) => {
    console.error("Seed script failed:", err);
    process.exit(1);
  })
  .finally(() => {
    // Close database connection pool
    process.exit(0);
  });
