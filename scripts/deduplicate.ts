/**
 * deduplicate.ts — Cross-source deduplication for business records
 *
 * Finds duplicate business records (same business from OSM + Google + Yelp)
 * and merges them into a single record using priority rules:
 *   Name: Google > OSM > Yelp
 *   Address: Google > OSM
 *   Hours: Google > OSM
 *   Phone: Google > OSM > Yelp
 *   Ratings: keep ALL sources separately, composite = weighted average
 *
 * Usage: pnpm deduplicate
 * Run AFTER enrichment scripts (enrich-outscraper, enrich-yelp)
 */

import { getDb, businesses } from "@mainstreetly/shared";
import { eq, sql } from "drizzle-orm";
import { readFileSync } from "fs";

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

// ─── Types ──────────────────────────────────────────────────────────────────

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  email: string | null;
  hours: unknown;
  ratingGoogle: number | null;
  ratingGoogleCount: number | null;
  ratingYelp: number | null;
  ratingYelpCount: number | null;
  ratingFb: number | null;
  ratingComposite: number | null;
  totalReviewCount: number | null;
  sourceOsmId: string | null;
  sourceGooglePlaceId: string | null;
  sourceYelpId: string | null;
  sourceFbPageId: string | null;
  dataSources: string[];
  profileStatus: string;
  createdAt: Date | null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Mainstreetly Deduplication ===\n");

  const db = getDb();

  // Load all businesses
  console.log("Loading all businesses...");
  const all: BusinessRow[] = (await db
    .select()
    .from(businesses)) as BusinessRow[];

  console.log(`Found ${all.length} total businesses\n`);

  if (all.length === 0) {
    console.log("No businesses to deduplicate.");
    return;
  }

  // Group potential duplicates by normalized name
  const nameGroups = new Map<string, BusinessRow[]>();
  for (const biz of all) {
    const key = normalizeName(biz.name);
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key)!.push(biz);
  }

  // Find actual duplicates: same normalized name AND within 100m
  const duplicateSets: BusinessRow[][] = [];

  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;

    // Cluster by proximity within the name group
    const visited = new Set<string>();

    for (let i = 0; i < group.length; i++) {
      if (visited.has(group[i].id)) continue;

      const cluster: BusinessRow[] = [group[i]];
      visited.add(group[i].id);

      for (let j = i + 1; j < group.length; j++) {
        if (visited.has(group[j].id)) continue;

        const dist = haversineMeters(
          group[i].latitude,
          group[i].longitude,
          group[j].latitude,
          group[j].longitude,
        );

        if (dist < 100) {
          cluster.push(group[j]);
          visited.add(group[j].id);
        }
      }

      if (cluster.length > 1) {
        duplicateSets.push(cluster);
      }
    }
  }

  console.log(`Found ${duplicateSets.length} duplicate sets\n`);

  if (duplicateSets.length === 0) {
    console.log("No duplicates found. Database is clean!");
    await recalculateCompositeRatings(db);
    return;
  }

  let merged = 0;
  let deleted = 0;

  for (const dupes of duplicateSets) {
    // Determine the "winner" — priority: Google source > OSM > other
    // Within same source type, prefer the one with more data
    const sorted = dupes.sort((a, b) => {
      // Google-sourced records get priority
      const aHasGoogle = a.sourceGooglePlaceId ? 1 : 0;
      const bHasGoogle = b.sourceGooglePlaceId ? 1 : 0;
      if (aHasGoogle !== bHasGoogle) return bHasGoogle - aHasGoogle;

      // Then by most data sources
      const aSourceCount = a.dataSources.length;
      const bSourceCount = b.dataSources.length;
      if (aSourceCount !== bSourceCount) return bSourceCount - aSourceCount;

      // Then by oldest (first created = canonical)
      const aTime = a.createdAt?.getTime() || 0;
      const bTime = b.createdAt?.getTime() || 0;
      return aTime - bTime;
    });

    const winner = sorted[0];
    const losers = sorted.slice(1);

    // Merge data from losers into winner using priority rules
    const mergedSources = new Set(winner.dataSources);
    let mergedOsmId = winner.sourceOsmId;
    let mergedGoogleId = winner.sourceGooglePlaceId;
    let mergedYelpId = winner.sourceYelpId;
    let mergedFbId = winner.sourceFbPageId;
    let mergedRatingGoogle = winner.ratingGoogle;
    let mergedRatingGoogleCount = winner.ratingGoogleCount;
    let mergedRatingYelp = winner.ratingYelp;
    let mergedRatingYelpCount = winner.ratingYelpCount;
    let mergedRatingFb = winner.ratingFb;
    let mergedPhone = winner.phone;
    let mergedWebsite = winner.website;
    let mergedEmail = winner.email;
    let mergedHours = winner.hours;
    let mergedAddress = winner.address;

    for (const loser of losers) {
      // Collect all source IDs
      for (const src of loser.dataSources) mergedSources.add(src);
      if (!mergedOsmId && loser.sourceOsmId) mergedOsmId = loser.sourceOsmId;
      if (!mergedGoogleId && loser.sourceGooglePlaceId)
        mergedGoogleId = loser.sourceGooglePlaceId;
      if (!mergedYelpId && loser.sourceYelpId) mergedYelpId = loser.sourceYelpId;
      if (!mergedFbId && loser.sourceFbPageId) mergedFbId = loser.sourceFbPageId;

      // Ratings: keep whichever source has data
      if (!mergedRatingGoogle && loser.ratingGoogle) {
        mergedRatingGoogle = loser.ratingGoogle;
        mergedRatingGoogleCount = loser.ratingGoogleCount;
      }
      if (!mergedRatingYelp && loser.ratingYelp) {
        mergedRatingYelp = loser.ratingYelp;
        mergedRatingYelpCount = loser.ratingYelpCount;
      }
      if (!mergedRatingFb && loser.ratingFb) mergedRatingFb = loser.ratingFb;

      // Contact: fill gaps (Google > OSM > Yelp already handled by sort order)
      if (!mergedPhone && loser.phone) mergedPhone = loser.phone;
      if (!mergedWebsite && loser.website) mergedWebsite = loser.website;
      if (!mergedEmail && loser.email) mergedEmail = loser.email;

      // Hours: prefer Google-sourced hours
      if (!mergedHours && loser.hours) mergedHours = loser.hours;

      // Address: prefer non-default addresses
      if (
        mergedAddress === "Austin, TX" &&
        loser.address &&
        loser.address !== "Austin, TX"
      ) {
        mergedAddress = loser.address;
      }
    }

    // Calculate composite rating (weighted average)
    const googleWeight = mergedRatingGoogleCount || 0;
    const yelpWeight = mergedRatingYelpCount || 0;
    const totalWeight = googleWeight + yelpWeight;
    const compositeRating =
      totalWeight > 0
        ? ((mergedRatingGoogle || 0) * googleWeight +
            (mergedRatingYelp || 0) * yelpWeight) /
          totalWeight
        : mergedRatingGoogle || mergedRatingYelp || null;

    // Update winner with merged data
    await db
      .update(businesses)
      .set({
        sourceOsmId: mergedOsmId,
        sourceGooglePlaceId: mergedGoogleId,
        sourceYelpId: mergedYelpId,
        sourceFbPageId: mergedFbId,
        ratingGoogle: mergedRatingGoogle,
        ratingGoogleCount: mergedRatingGoogleCount,
        ratingYelp: mergedRatingYelp,
        ratingYelpCount: mergedRatingYelpCount,
        ratingFb: mergedRatingFb,
        ratingComposite: compositeRating,
        totalReviewCount: totalWeight || null,
        phone: mergedPhone,
        website: mergedWebsite,
        email: mergedEmail,
        hours: mergedHours as Record<string, unknown>,
        address: mergedAddress,
        dataSources: [...mergedSources],
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, winner.id));

    // Delete losers
    for (const loser of losers) {
      await db.delete(businesses).where(eq(businesses.id, loser.id));
      deleted++;
    }

    merged++;
    console.log(
      `  Merged: "${winner.name}" (${losers.length} duplicate${losers.length > 1 ? "s" : ""} removed, sources: ${[...mergedSources].join("+")})`,
    );
  }

  // Recalculate composite ratings for all remaining records
  await recalculateCompositeRatings(db);

  // Final count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businesses);

  console.log(`\n=== Deduplication Complete ===`);
  console.log(`Duplicate sets found: ${duplicateSets.length}`);
  console.log(`Records merged: ${merged}`);
  console.log(`Duplicate records deleted: ${deleted}`);
  console.log(`Total businesses remaining: ${count}`);
}

async function recalculateCompositeRatings(db: ReturnType<typeof getDb>) {
  console.log("\nRecalculating composite ratings for all businesses...");

  await db.execute(sql`
    UPDATE businesses SET
      rating_composite = (
        COALESCE(rating_google, 0) * COALESCE(rating_google_count, 0)
        + COALESCE(rating_yelp, 0) * COALESCE(rating_yelp_count, 0)
      ) / NULLIF(
        COALESCE(rating_google_count, 0) + COALESCE(rating_yelp_count, 0), 0
      ),
      total_review_count = NULLIF(
        COALESCE(rating_google_count, 0) + COALESCE(rating_yelp_count, 0), 0
      ),
      updated_at = NOW()
    WHERE rating_google IS NOT NULL OR rating_yelp IS NOT NULL
  `);

  console.log("Composite ratings updated.");
}

main().catch((err) => {
  console.error("Deduplication script failed:", err);
  process.exit(1);
});
