/**
 * seed-geojson.ts — Seed businesses from OpenStreetMap GeoJSON exports
 *
 * Reads .geojson files exported from overpass-turbo and inserts businesses
 * into the database. This is an alternative to seed-osm.ts that works
 * offline from pre-downloaded exports.
 *
 * Usage: pnpm seed:geojson
 * Requires: DATABASE_URL + GeoJSON files in scripts/data/
 */

import { getDb, businesses } from "@mainstreetly/shared";
import { OSM_CATEGORY_MAP } from "@mainstreetly/shared";
import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env
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
  // .env not found
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");

// ─── Types ──────────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: "Feature";
  id?: string;
  properties: Record<string, string>;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractCategory(props: Record<string, string>): string | null {
  for (const tagKey of ["shop", "amenity", "craft", "office", "leisure"]) {
    const value = props[tagKey];
    if (value && OSM_CATEGORY_MAP[value]) {
      return OSM_CATEGORY_MAP[value];
    }
  }
  return null;
}

function getCentroid(geometry: GeoJSONFeature["geometry"]): { lat: number; lng: number } | null {
  if (geometry.type === "Point") {
    const coords = geometry.coordinates as number[];
    return { lat: coords[1], lng: coords[0] };
  }

  // For Polygon/MultiPolygon, compute centroid from outer ring
  let allCoords: number[][] = [];
  if (geometry.type === "Polygon") {
    allCoords = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as unknown as number[][][][];
    for (const poly of polys) {
      allCoords.push(...poly[0]);
    }
  } else if (geometry.type === "LineString") {
    allCoords = geometry.coordinates as number[][];
  }

  if (allCoords.length === 0) return null;

  let sumLat = 0, sumLng = 0;
  for (const coord of allCoords) {
    sumLng += coord[0];
    sumLat += coord[1];
  }
  return {
    lat: sumLat / allCoords.length,
    lng: sumLng / allCoords.length,
  };
}

function generateSlug(name: string, osmId: string): string {
  const base = name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const idSuffix = osmId.replace(/[^a-z0-9]/gi, "");
  return `${base}-${idSuffix}`;
}

function buildAddress(props: Record<string, string>): string {
  const parts = [];
  if (props["addr:housenumber"]) parts.push(props["addr:housenumber"]);
  if (props["addr:street"]) parts.push(props["addr:street"]);
  if (parts.length > 0) return parts.join(" ");
  return props["addr:full"] || "Austin, TX";
}

function parseHours(props: Record<string, string>): Record<string, unknown> | null {
  const raw = props.opening_hours;
  if (!raw) return null;
  return { raw };
}

// ─── Main ───────────────────────────────────────────────────────────────────

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

async function main() {
  console.log("=== Mainstreetly GeoJSON Seed Script ===\n");

  // Find GeoJSON files
  let geoFiles: string[];
  try {
    geoFiles = readdirSync(DATA_DIR).filter((f) => f.endsWith(".geojson"));
  } catch {
    console.error(`No data directory found at ${DATA_DIR}`);
    process.exit(1);
  }

  if (geoFiles.length === 0) {
    console.error("No .geojson files found in scripts/data/");
    process.exit(1);
  }

  console.log(`Found ${geoFiles.length} GeoJSON file(s): ${geoFiles.join(", ")}`);

  const records: BusinessRecord[] = [];
  const seen = new Set<string>();

  for (const file of geoFiles) {
    console.log(`\nParsing: ${file}`);
    const raw = readFileSync(join(DATA_DIR, file), "utf-8");
    const collection: GeoJSONCollection = JSON.parse(raw);
    console.log(`  ${collection.features.length} features`);

    for (const feature of collection.features) {
      const props = feature.properties;
      const name = props.name;
      if (!name) continue;

      const osmId = (feature.id || props["@id"] || "").toString();
      if (seen.has(osmId)) continue;
      seen.add(osmId);

      const category = extractCategory(props);
      if (!category) continue;

      const centroid = getCentroid(feature.geometry);
      if (!centroid) continue;

      records.push({
        name,
        slug: generateSlug(name, osmId),
        category,
        subcategories: props.cuisine
          ? props.cuisine.split(";").map((s) => s.trim())
          : [],
        address: buildAddress(props),
        city: props["addr:city"] || "Austin",
        state: props["addr:state"] || "TX",
        zip: props["addr:postcode"] || null,
        latitude: centroid.lat,
        longitude: centroid.lng,
        phone: props.phone || props["contact:phone"] || null,
        website: props.website || props["contact:website"] || null,
        email: props.email || props["contact:email"] || null,
        hours: parseHours(props),
        sourceOsmId: osmId,
        dataSources: ["osm"],
        profileStatus: "auto",
        lastScrapedAt: new Date(),
      });
    }
  }

  console.log(`\nParsed ${records.length} valid business records`);

  // Category breakdown
  const categoryCounts = new Map<string, number>();
  for (const r of records) {
    categoryCounts.set(r.category, (categoryCounts.get(r.category) || 0) + 1);
  }
  console.log("\nCategory breakdown:");
  for (const [cat, count] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Insert into database
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
    } catch {
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

    if (i > 0 && (i / BATCH_SIZE) % 10 === 0) {
      console.log(`  Progress: ${inserted} inserted, ${skipped} skipped`);
    }
  }

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
    console.error("GeoJSON seed script failed:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
