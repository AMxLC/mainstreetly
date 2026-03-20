import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb, geocodingLookups } from "../db/index.js";
import { eq, and, ilike } from "drizzle-orm";

/**
 * Generate a Haversine SQL expression for distance calculation.
 * Returns distance in meters.
 *
 * TODO: Migrate to PostGIS ST_Distance for better performance at scale.
 * PostGIS uses spatial indexes and is optimized for distance calculations.
 * This Haversine formula is a temporary solution for MVP.
 *
 * @param userLat - User's latitude
 * @param userLng - User's longitude
 * @param businessLatColumn - The business latitude column from schema
 * @param businessLngColumn - The business longitude column from schema
 * @returns SQL expression that calculates distance in meters
 */
export function haversineSQL(
  userLat: number,
  userLng: number,
  businessLatColumn: SQL.Aliased<number>,
  businessLngColumn: SQL.Aliased<number>,
): SQL<number> {
  return sql`(
    6371000 * acos(
      cos(radians(${userLat})) * cos(radians(${businessLatColumn}))
      * cos(radians(${businessLngColumn}) - radians(${userLng}))
      + sin(radians(${userLat})) * sin(radians(${businessLatColumn}))
    )
  )`;
}

/**
 * Parse a location string to coordinates.
 *
 * Matching strategy (in order):
 * 1. Try zip code match (5 digits)
 * 2. Try city/state match (e.g. "Austin, TX")
 * 3. Try city name alone
 * 4. Fallback: geographic center of continental US (Kansas)
 *
 * @param location - Location string (zip code, city, or "city, state")
 * @returns Coordinates { lat, lng }
 */
export async function parseLocation(
  location: string,
): Promise<{ lat: number; lng: number }> {
  const db = getDb();
  const cleaned = location.trim();

  // 1. Try zip code match
  const zip = cleaned.replace(/\D/g, "");
  if (zip.length === 5) {
    const [match] = await db
      .select({ latitude: geocodingLookups.latitude, longitude: geocodingLookups.longitude })
      .from(geocodingLookups)
      .where(eq(geocodingLookups.zip, zip))
      .limit(1);
    if (match?.latitude && match?.longitude) {
      return { lat: match.latitude, lng: match.longitude };
    }
  }

  // 2. Try city/state match (e.g. "Austin, TX" or "Denver, CO")
  const cityStateMatch = cleaned.match(/^([^,]+),\s*([A-Z]{2})$/i);
  if (cityStateMatch) {
    const [match] = await db
      .select({ latitude: geocodingLookups.latitude, longitude: geocodingLookups.longitude })
      .from(geocodingLookups)
      .where(
        and(
          ilike(geocodingLookups.city, cityStateMatch[1].trim()),
          ilike(geocodingLookups.state, cityStateMatch[2].trim()),
        ),
      )
      .limit(1);
    if (match?.latitude && match?.longitude) {
      return { lat: match.latitude, lng: match.longitude };
    }
  }

  // 3. Try city name alone
  const [cityMatch] = await db
    .select({ latitude: geocodingLookups.latitude, longitude: geocodingLookups.longitude })
    .from(geocodingLookups)
    .where(ilike(geocodingLookups.city, cleaned.split(",")[0].trim()))
    .limit(1);
  if (cityMatch?.latitude && cityMatch?.longitude) {
    return { lat: cityMatch.latitude, lng: cityMatch.longitude };
  }

  // 4. Fallback: if geocoding_lookups is empty or no match, use a reasonable US center
  // TODO: Add Nominatim public API fallback here for street-level queries
  // For now, return geographic center of continental US (Kansas)
  console.error(`parseLocation: no geocoding match for "${location}", using US center fallback`);
  return { lat: 39.8283, lng: -98.5795 };
}
