/**
 * enrich-outscraper.ts — Merge Outscraper Google Maps data into Mainstreetly DB
 *
 * How to use:
 * 1. Go to outscraper.com, sign up for free tier (500 records free)
 * 2. Search for service categories in Austin TX (see README for queries)
 * 3. Export as CSV with fields: name, full_address, phone, website, rating,
 *    reviews_count, price_level, working_hours, latitude, longitude, google_id, category
 * 4. Place CSV files in scripts/data/ directory
 * 5. Run: pnpm tsx scripts/enrich-outscraper.ts
 *
 * This script will:
 * - Read each CSV row
 * - Match to existing business by name proximity + location (< 100m)
 * - Update matched businesses with Google ratings, review counts, google_place_id
 * - Create new records for unmatched businesses
 */

console.log("Outscraper enrichment script — not yet implemented.");
console.log("See comments in this file for usage instructions.");
process.exit(0);
