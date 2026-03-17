/**
 * enrich-outscraper.ts — Merge Outscraper Google Maps data into Mainstreetly DB
 *
 * Reads the Google Maps Data Scraper CSV from scripts/data/ and:
 * 1. Matches rows to existing businesses by name similarity + geo proximity (<100m)
 * 2. Updates matched businesses with Google ratings, place IDs, phone, website, hours
 * 3. Creates new records for unmatched businesses
 *
 * Usage: pnpm enrich:outscraper
 * Requires: DATABASE_URL environment variable + CSV in scripts/data/
 */

import { getDb, businesses } from "@mainstreetly/shared";
import { eq, sql } from "drizzle-orm";
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
  // .env not found, rely on environment variables
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");

// ─── RFC 4180-compliant CSV Parser (handles multiline quoted fields) ────────

function parseCSV(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const chars = content;
  const len = chars.length;
  let pos = 0;

  function parseField(): string {
    if (pos >= len) return "";

    if (chars[pos] === '"') {
      // Quoted field — can span multiple lines
      pos++; // skip opening quote
      let field = "";
      while (pos < len) {
        if (chars[pos] === '"') {
          if (pos + 1 < len && chars[pos + 1] === '"') {
            field += '"';
            pos += 2;
          } else {
            pos++; // skip closing quote
            break;
          }
        } else {
          field += chars[pos];
          pos++;
        }
      }
      return field;
    }

    // Unquoted field
    let field = "";
    while (pos < len && chars[pos] !== "," && chars[pos] !== "\n" && chars[pos] !== "\r") {
      field += chars[pos];
      pos++;
    }
    return field;
  }

  function parseRow(): string[] {
    const fields: string[] = [];
    fields.push(parseField());
    while (pos < len && chars[pos] === ",") {
      pos++; // skip comma
      fields.push(parseField());
    }
    // Skip line ending
    if (pos < len && chars[pos] === "\r") pos++;
    if (pos < len && chars[pos] === "\n") pos++;
    return fields;
  }

  // Parse header row
  const headers = parseRow().map((h) => h.trim());

  // Parse data rows
  while (pos < len) {
    // Skip blank lines
    if (chars[pos] === "\n" || chars[pos] === "\r") {
      pos++;
      continue;
    }

    const values = parseRow();
    if (values.length === 1 && values[0] === "") continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || "").trim();
    }
    rows.push(row);
  }

  return rows;
}

// ─── Category Mapping (Google Maps subtypes → Mainstreetly categories) ──────

const GOOGLE_CATEGORY_MAP: Record<string, string> = {
  // Hair & Beauty
  barber_shop: "barber",
  barber: "barber",
  hair_salon: "hair_salon",
  hair_care: "hair_salon",
  beauty_salon: "beauty_salon",
  beauty_supply_store: "beauty_salon",
  nail_salon: "beauty_salon",

  // Medical
  dentist: "dentist",
  dental_clinic: "dentist",
  doctor: "doctor",
  medical_clinic: "clinic",
  clinic: "clinic",
  veterinarian: "veterinarian",
  veterinary_care: "veterinarian",
  animal_hospital: "veterinarian",
  pet_store: "veterinarian",

  // Trades
  plumber: "plumber",
  plumbing: "plumber",
  plumbing_service: "plumber",
  electrician: "electrician",
  electrical_contractor: "electrician",
  hvac_contractor: "hvac",
  heating_contractor: "hvac",
  air_conditioning_contractor: "hvac",
  air_conditioning_repair_service: "hvac",
  painter: "painter",
  painting: "painter",
  painting_contractor: "painter",
  house_painter: "painter",
  carpenter: "carpenter",
  carpentry: "carpenter",
  handyman: "carpenter",

  // Auto
  auto_repair: "auto_repair",
  auto_repair_shop: "auto_repair",
  car_repair: "auto_repair",
  car_repair_and_maintenance: "auto_repair",
  mechanic: "auto_repair",
  auto_parts_store: "auto_parts",

  // Food
  restaurant: "restaurant",
  cafe: "cafe",
  coffee_shop: "cafe",
  fast_food_restaurant: "fast_food",

  // Cleaning
  laundry: "laundry",
  laundry_service: "laundry",
  laundromat: "laundry",
  dry_cleaner: "dry_cleaning",
  dry_cleaning: "dry_cleaning",
  dry_cleaning_service: "dry_cleaning",

  // Professional
  lawyer: "lawyer",
  attorney: "lawyer",
  law_firm: "lawyer",
  accountant: "accountant",
  accounting_firm: "accountant",
  accounting: "accountant",
  tax_preparation: "accountant",
  tax_preparation_service: "accountant",
  real_estate_agency: "real_estate",
  real_estate_agent: "real_estate",
  real_estate: "real_estate",

  // Other
  child_care_agency: "childcare",
  day_care: "childcare",
  child_care: "childcare",
  preschool: "childcare",
  gym: "gym",
  fitness_center: "gym",
  health_club: "gym",
  yoga_studio: "gym",
  spa: "spa",
  massage: "spa",
  massage_therapist: "spa",

  // Cleaning services
  cleaning_service: "cleaning",
  house_cleaning_service: "cleaning",
  pressure_washing_service: "painter",
};

function mapGoogleCategory(subtypes: string, category: string): string | null {
  // subtypes is comma-separated, try each one
  const types = subtypes
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"));

  for (const t of types) {
    if (GOOGLE_CATEGORY_MAP[t]) return GOOGLE_CATEGORY_MAP[t];
  }

  // Try the main category field too
  const cat = category.toLowerCase().replace(/\s+/g, "_");
  if (GOOGLE_CATEGORY_MAP[cat]) return GOOGLE_CATEGORY_MAP[cat];

  return null;
}

// ─── Working Hours Parser ───────────────────────────────────────────────────

function parseWorkingHours(
  hoursStr: string,
): Record<string, unknown> | null {
  if (!hoursStr || hoursStr === "None" || hoursStr === "N/A") return null;

  // Outscraper formats hours as JSON-like or pipe-separated
  try {
    const parsed = JSON.parse(hoursStr);
    if (typeof parsed === "object") return parsed;
  } catch {
    // not JSON
  }

  return { raw: hoursStr, source: "google" };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''""]/g, "")
    .replace(/\b(llc|inc|ltd|corp|co)\b\.?/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateSlug(name: string, googleId: string): string {
  const base = name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = googleId.replace(/[^a-z0-9]/gi, "").slice(-8);
  return `${base}-g${suffix}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface ExistingBusiness {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceGooglePlaceId: string | null;
}

async function main() {
  console.log("=== Mainstreetly Outscraper Enrichment ===\n");

  // Find CSV files in data directory
  let csvFiles: string[];
  try {
    csvFiles = readdirSync(DATA_DIR).filter(
      (f) => f.endsWith(".csv") && !f.toLowerCase().includes("review"),
    );
  } catch {
    console.error(`No data directory found at ${DATA_DIR}`);
    console.error("Create scripts/data/ and place your Outscraper CSV files there.");
    process.exit(1);
  }

  if (csvFiles.length === 0) {
    console.error("No business CSV files found in scripts/data/");
    console.error('Place your Outscraper "Google Maps Data Scraper" CSV exports there.');
    console.error('(Files with "review" in the name are skipped.)');
    process.exit(1);
  }

  console.log(`Found ${csvFiles.length} CSV file(s): ${csvFiles.join(", ")}`);

  const db = getDb();

  // Load all existing businesses for matching
  console.log("Loading existing businesses from database...");
  const existing: ExistingBusiness[] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      latitude: businesses.latitude,
      longitude: businesses.longitude,
      sourceGooglePlaceId: businesses.sourceGooglePlaceId,
    })
    .from(businesses);

  console.log(`Found ${existing.length} existing businesses in DB\n`);

  // Build lookup index by normalized name for fast matching
  const nameIndex = new Map<string, ExistingBusiness[]>();
  for (const biz of existing) {
    const key = normalizeName(biz.name);
    if (!nameIndex.has(key)) nameIndex.set(key, []);
    nameIndex.get(key)!.push(biz);
  }

  // Build place_id index for dedup
  const placeIdIndex = new Set(
    existing
      .filter((b) => b.sourceGooglePlaceId)
      .map((b) => b.sourceGooglePlaceId!),
  );

  let totalRows = 0;
  let matched = 0;
  let created = 0;
  let skippedNoCategory = 0;
  let skippedNoName = 0;
  let alreadyLinked = 0;
  let errors = 0;

  for (const csvFile of csvFiles) {
    console.log(`\n--- Processing: ${csvFile} ---`);
    const content = readFileSync(join(DATA_DIR, csvFile), "utf-8");
    const rows = parseCSV(content);
    console.log(`Parsed ${rows.length} rows`);

    for (const row of rows) {
      totalRows++;
      const name = row.name;
      if (!name) {
        skippedNoName++;
        continue;
      }

      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      const placeId = row.place_id || "";
      const googleId = row.google_id || "";
      const rating = parseFloat(row.rating) || null;
      const reviewCount = parseInt(row.reviews, 10) || null;
      const phone = row.phone || null;
      const website = row.website || null;
      const address =
        row.address || `${row.street || ""}, Austin, TX`.replace(/^,\s*/, "");
      const hours = parseWorkingHours(row.working_hours || "");
      const subtypes = row.subtypes || "";
      const category = row.category || "";
      const zip = row.postal_code || null;

      // Skip if already enriched by place_id
      if (placeId && placeIdIndex.has(placeId)) {
        alreadyLinked++;
        continue;
      }

      // Try to find a match: same normalized name within 100m
      const normalizedName = normalizeName(name);
      const candidates = nameIndex.get(normalizedName) || [];
      let match: ExistingBusiness | null = null;

      for (const candidate of candidates) {
        if (
          candidate.sourceGooglePlaceId &&
          candidate.sourceGooglePlaceId !== placeId
        ) {
          continue;
        }
        const dist = haversineMeters(lat, lng, candidate.latitude, candidate.longitude);
        if (dist < 100) {
          match = candidate;
          break;
        }
      }

      if (match) {
        // Single UPDATE: merge Google data + recalculate composite
        await db
          .update(businesses)
          .set({
            ratingGoogle: rating,
            ratingGoogleCount: reviewCount,
            sourceGooglePlaceId: placeId || undefined,
            phone: phone || undefined,
            website: website || undefined,
            hours: hours || undefined,
            ratingComposite: sql`(
              COALESCE(${rating}::real, 0) * COALESCE(${reviewCount}::int, 0)
              + COALESCE(rating_yelp, 0) * COALESCE(rating_yelp_count, 0)
            ) / NULLIF(
              COALESCE(${reviewCount}::int, 0) + COALESCE(rating_yelp_count, 0), 0
            )`,
            totalReviewCount: sql`COALESCE(${reviewCount}::int, 0) + COALESCE(rating_yelp_count, 0)`,
            dataSources: sql`CASE
              WHEN 'google' = ANY(data_sources) THEN data_sources
              ELSE array_append(data_sources, 'google')
            END`,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, match.id));

        // Track place_id to avoid re-processing
        if (placeId) placeIdIndex.add(placeId);
        matched++;
      } else {
        // No match — create new record if we can map the category
        const mappedCategory = mapGoogleCategory(subtypes, category);
        if (!mappedCategory) {
          skippedNoCategory++;
          continue;
        }

        const slug = generateSlug(
          name,
          googleId || placeId || String(totalRows),
        );

        try {
          await db
            .insert(businesses)
            .values({
              name,
              slug,
              category: mappedCategory,
              subcategories: subtypes
                ? subtypes
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : [],
              address: address || "Austin, TX",
              city: row.city || "Austin",
              state: row.state_code || "TX",
              zip,
              latitude: lat,
              longitude: lng,
              phone,
              website,
              hours,
              ratingGoogle: rating,
              ratingGoogleCount: reviewCount,
              ratingComposite: rating,
              totalReviewCount: reviewCount,
              sourceGooglePlaceId: placeId || null,
              dataSources: ["google"],
              profileStatus: "auto",
              lastScrapedAt: new Date(),
            })
            .onConflictDoNothing({ target: businesses.slug });

          if (placeId) placeIdIndex.add(placeId);
          created++;
        } catch (err) {
          errors++;
          if (errors <= 10) {
            console.error(`  Failed to insert "${name}": ${err}`);
          }
        }
      }

      if (totalRows % 500 === 0) {
        console.log(
          `  Progress: ${totalRows} rows — ${matched} matched, ${created} created`,
        );
      }
    }
  }

  // Final count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businesses);

  console.log(`\n=== Enrichment Complete ===`);
  console.log(`Total CSV rows processed: ${totalRows}`);
  console.log(`Matched & updated existing: ${matched}`);
  console.log(`Created new businesses: ${created}`);
  console.log(`Already linked (skipped): ${alreadyLinked}`);
  console.log(`Skipped (no mapped category): ${skippedNoCategory}`);
  console.log(`Skipped (no name): ${skippedNoName}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total businesses in database: ${count}`);
}

main()
  .catch((err) => {
    console.error("Enrichment script failed:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
