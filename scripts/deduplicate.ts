/**
 * deduplicate.ts — Cross-source deduplication for business records
 *
 * Merge strategy (from brief):
 * 1. Primary key: normalized(name) + geocode proximity (< 100m)
 * 2. If OSM + Google + Yelp all match → merge into single record
 * 3. Priority for conflicts:
 *    - Name: Google > OSM > Yelp
 *    - Address: Google > OSM
 *    - Hours: Google > OSM
 *    - Phone: Google > OSM > Yelp
 *    - Ratings: keep ALL sources separately (composite = weighted average)
 * 4. Store all source IDs: osm_id, google_place_id, yelp_id, fb_page_id
 */

console.log("Deduplication script — not yet implemented.");
console.log("Run after enrichment scripts to merge duplicate records.");
process.exit(0);
