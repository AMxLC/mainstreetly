import { getDb, businesses, services } from "@mainstreetly/shared";
import { eq, sql, and, gte, lte, ilike, desc, or } from "drizzle-orm";
import type {
  BusinessSearchResult,
  BusinessProfile,
  CategoryCount,
  BusinessHours,
} from "@mainstreetly/shared";

// Austin zip code centroids for basic geocoding
const ZIP_COORDS: Record<string, { lat: number; lng: number }> = {
  "78701": { lat: 30.2672, lng: -97.7431 }, // Downtown
  "78702": { lat: 30.2627, lng: -97.7188 }, // East Austin
  "78703": { lat: 30.2955, lng: -97.7675 }, // Tarrytown
  "78704": { lat: 30.2402, lng: -97.7633 }, // South Congress / SoCo
  "78705": { lat: 30.2916, lng: -97.7415 }, // UT / Campus
  "78721": { lat: 30.2665, lng: -97.6928 }, // East Austin
  "78722": { lat: 30.2851, lng: -97.7127 }, // Cherrywood
  "78723": { lat: 30.3013, lng: -97.6858 }, // Windsor Park
  "78731": { lat: 30.3535, lng: -97.7636 }, // NW Hills
  "78741": { lat: 30.2228, lng: -97.7340 }, // South Austin
  "78745": { lat: 30.1946, lng: -97.7932 }, // South Austin
  "78748": { lat: 30.1618, lng: -97.8013 }, // South Austin
  "78751": { lat: 30.3135, lng: -97.7232 }, // Hyde Park
  "78752": { lat: 30.3301, lng: -97.7085 }, // North Loop
  "78753": { lat: 30.3797, lng: -97.6849 }, // North Austin
  "78757": { lat: 30.3508, lng: -97.7337 }, // Crestview
  "78758": { lat: 30.3846, lng: -97.7139 }, // North Austin
  "78759": { lat: 30.3966, lng: -97.7526 }, // NW Austin / Arboretum
};

// Default: downtown Austin
const AUSTIN_CENTER = { lat: 30.2672, lng: -97.7431 };

function parseLocation(location: string): { lat: number; lng: number } {
  // Check if it's a zip code
  const zip = location.replace(/\D/g, "");
  if (zip.length === 5 && ZIP_COORDS[zip]) {
    return ZIP_COORDS[zip];
  }

  // Default to Austin center for any Austin-related query
  return AUSTIN_CENTER;
}

function getTodayHours(hours: BusinessHours | null): string | null {
  if (!hours) return null;
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const today = days[new Date().getDay()];
  const todayHours = hours[today];
  if (!todayHours) return null;
  if (todayHours === "closed") return "Closed";
  if (todayHours === "24hours") return "24 hours";
  if (typeof todayHours === "object") {
    return `${todayHours.open}-${todayHours.close}`;
  }
  return null;
}

// Map query terms to categories
const QUERY_CATEGORY_MAP: Record<string, string[]> = {
  haircut: ["barber", "hair_salon"],
  barber: ["barber"],
  hair: ["hair_salon", "barber"],
  salon: ["hair_salon", "beauty_salon"],
  beauty: ["beauty_salon"],
  dentist: ["dentist"],
  dental: ["dentist"],
  doctor: ["doctor", "clinic"],
  vet: ["veterinarian"],
  veterinary: ["veterinarian"],
  plumber: ["plumber"],
  plumbing: ["plumber"],
  electrician: ["electrician"],
  electrical: ["electrician"],
  hvac: ["hvac"],
  "air conditioning": ["hvac"],
  heating: ["hvac"],
  painter: ["painter"],
  painting: ["painter"],
  carpenter: ["carpenter"],
  auto: ["auto_repair"],
  "car repair": ["auto_repair"],
  mechanic: ["auto_repair"],
  restaurant: ["restaurant"],
  food: ["restaurant", "cafe", "fast_food"],
  cafe: ["cafe"],
  coffee: ["cafe"],
  laundry: ["laundry"],
  "dry cleaning": ["dry_cleaning"],
  lawyer: ["lawyer"],
  attorney: ["lawyer"],
  accountant: ["accountant"],
  "real estate": ["real_estate"],
  realtor: ["real_estate"],
  gym: ["gym"],
  fitness: ["gym"],
  spa: ["spa"],
  massage: ["spa"],
  childcare: ["childcare"],
  daycare: ["childcare"],
};

function queryToCategories(query: string): string[] | null {
  const lower = query.toLowerCase().trim();

  // Direct match
  if (QUERY_CATEGORY_MAP[lower]) {
    return QUERY_CATEGORY_MAP[lower];
  }

  // Partial match
  for (const [term, categories] of Object.entries(QUERY_CATEGORY_MAP)) {
    if (lower.includes(term) || term.includes(lower)) {
      return categories;
    }
  }

  return null;
}

export interface SearchParams {
  query: string;
  location: string;
  radius_km?: number;
  max_price?: number;
  min_rating?: number;
  limit?: number;
}

export async function searchBusinesses(
  params: SearchParams,
): Promise<{ results: BusinessSearchResult[]; count: number; query: string }> {
  const db = getDb();
  const coords = parseLocation(params.location);
  const radiusMeters = (params.radius_km ?? 10) * 1000;
  const categories = queryToCategories(params.query);

  // Build WHERE conditions
  const conditions = [
    // Spatial filter using PostGIS
    sql`ST_DWithin(
      coordinates,
      ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography,
      ${radiusMeters}
    )`,
  ];

  // Category filter
  if (categories) {
    conditions.push(
      sql`${businesses.category} IN (${sql.join(
        categories.map((c) => sql`${c}`),
        sql`, `,
      )})`,
    );
  }

  // Rating filter
  if (params.min_rating) {
    conditions.push(
      sql`${businesses.ratingComposite} >= ${params.min_rating}`,
    );
  }

  // Price filter — match businesses that have at least one service within budget
  if (params.max_price) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM services s
        WHERE s.business_id = ${businesses.id}
        AND s.price_min <= ${params.max_price}
      )`,
    );
  }

  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      category: businesses.category,
      address: businesses.address,
      city: businesses.city,
      state: businesses.state,
      latitude: businesses.latitude,
      longitude: businesses.longitude,
      phone: businesses.phone,
      website: businesses.website,
      hours: businesses.hours,
      ratingGoogle: businesses.ratingGoogle,
      ratingYelp: businesses.ratingYelp,
      ratingComposite: businesses.ratingComposite,
      totalReviewCount: businesses.totalReviewCount,
      profileStatus: businesses.profileStatus,
      distance: sql<number>`ST_Distance(
        coordinates,
        ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography
      )`.as("distance"),
    })
    .from(businesses)
    .where(and(...conditions))
    .orderBy(
      sql`ST_Distance(
        coordinates,
        ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography
      )`,
    )
    .limit(params.limit ?? 20);

  // Check which businesses have services
  const businessIds = rows.map((r) => r.id);
  const serviceRows =
    businessIds.length > 0
      ? await db
          .select({ businessId: services.businessId })
          .from(services)
          .where(
            sql`${services.businessId} IN (${sql.join(
              businessIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : [];
  const hasServices = new Set(serviceRows.map((s) => s.businessId));

  const results: BusinessSearchResult[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    address: `${row.address}, ${row.city}, ${row.state}`,
    distance_km: row.distance ? Math.round((row.distance / 1000) * 10) / 10 : null,
    rating: row.ratingComposite,
    ratings: {
      google: row.ratingGoogle,
      yelp: row.ratingYelp,
      reviews: row.totalReviewCount,
    },
    phone: row.phone,
    website: row.website,
    hours_today: getTodayHours(row.hours as BusinessHours | null),
    profile_status: row.profileStatus,
    services_available: hasServices.has(row.id),
    booking_available: row.profileStatus === "premium",
  }));

  return {
    results,
    count: results.length,
    query: `${params.query} near ${params.location}`,
  };
}

export async function getBusinessProfile(
  businessId: string,
): Promise<BusinessProfile | null> {
  const db = getDb();

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return null;

  const bizServices = await db
    .select()
    .from(services)
    .where(eq(services.businessId, businessId));

  return {
    id: biz.id,
    name: biz.name,
    category: biz.category,
    subcategories: biz.subcategories,
    address: `${biz.address}, ${biz.city}, ${biz.state}${biz.zip ? ` ${biz.zip}` : ""}`,
    coordinates: { lat: biz.latitude, lng: biz.longitude },
    phone: biz.phone,
    website: biz.website,
    email: biz.email,
    hours: biz.hours as BusinessHours | null,
    ratings: {
      google: { score: biz.ratingGoogle, count: biz.ratingGoogleCount },
      yelp: { score: biz.ratingYelp, count: biz.ratingYelpCount },
      facebook: biz.ratingFb,
      composite: biz.ratingComposite,
      total_reviews: biz.totalReviewCount,
    },
    profile_status: biz.profileStatus,
    services: bizServices.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      price_min: s.priceMin,
      price_max: s.priceMax,
      duration_minutes: s.durationMinutes,
    })),
    booking_available: biz.profileStatus === "premium",
    availability_available: biz.profileStatus === "premium",
  };
}

export async function listCategories(): Promise<CategoryCount[]> {
  const db = getDb();

  const rows = await db
    .select({
      category: businesses.category,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(businesses)
    .groupBy(businesses.category)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({ category: r.category, count: r.count }));
}
