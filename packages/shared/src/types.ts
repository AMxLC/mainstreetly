// MCP response types — optimized for token efficiency

export interface BusinessBase {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string | null;
  website: string | null;
  email?: string | null;
  hours_today?: string | null;
  rating: number | null;
  profile_status: string;
  booking_available: boolean;
}

export interface BusinessSearchResult extends BusinessBase {
  distance_km: number | null;
  services_available: boolean;
  ratings: {
    google: number | null;
    yelp: number | null;
    reviews?: number | null;
  };
}

export interface SearchResponse {
  results: BusinessSearchResult[];
  count: number;
  query: string;
}

export interface BusinessHours {
  [day: string]:
    | { open: string; close: string }
    | "closed"
    | "24hours";
}

export interface BusinessProfile extends BusinessBase {
  subcategories: string[];
  coordinates: { lat: number; lng: number };
  hours: BusinessHours | null;
  ratings: {
    google: { score: number | null; count: number | null };
    yelp: { score: number | null; count: number | null };
    facebook: number | null;
    composite: number | null;
    total_reviews: number | null;
  };
  services: ServiceInfo[];
  availability_available: boolean;
}

export interface ServiceInfo {
  id: string;
  name: string;
  description: string | null;
  price_min: number | null;
  price_max: number | null;
  duration_minutes: number | null;
}

export interface CategoryCount {
  category: string;
  count: number;
}

// OSM tag → category mapping
export const OSM_CATEGORY_MAP: Record<string, string> = {
  // shop tags
  hairdresser: "hair_salon",
  beauty: "beauty_salon",
  barber: "barber",
  car_repair: "auto_repair",
  car_parts: "auto_parts",
  laundry: "laundry",
  dry_cleaning: "dry_cleaning",

  // amenity tags
  dentist: "dentist",
  doctors: "doctor",
  clinic: "clinic",
  veterinary: "veterinarian",
  restaurant: "restaurant",
  cafe: "cafe",
  fast_food: "fast_food",
  childcare: "childcare",

  // craft tags
  plumber: "plumber",
  electrician: "electrician",
  hvac: "hvac",
  painter: "painter",
  carpenter: "carpenter",

  // office tags
  estate_agent: "real_estate",
  lawyer: "lawyer",
  accountant: "accountant",

  // leisure tags
  fitness_centre: "gym",
  spa: "spa",
};

// Human-readable category labels
export const CATEGORY_LABELS: Record<string, string> = {
  barber: "Barber",
  hair_salon: "Hair Salon",
  beauty_salon: "Beauty Salon",
  dentist: "Dentist",
  doctor: "Doctor",
  clinic: "Clinic",
  veterinarian: "Veterinarian",
  plumber: "Plumber",
  electrician: "Electrician",
  hvac: "HVAC",
  painter: "Painter",
  carpenter: "Carpenter",
  auto_repair: "Auto Repair",
  auto_parts: "Auto Parts",
  restaurant: "Restaurant",
  cafe: "Cafe",
  fast_food: "Fast Food",
  laundry: "Laundry",
  dry_cleaning: "Dry Cleaning",
  real_estate: "Real Estate",
  lawyer: "Lawyer",
  accountant: "Accountant",
  childcare: "Childcare",
  gym: "Gym / Fitness",
  spa: "Spa",
};

// ─── Waitlist Signup ────────────────────────────────────────────────────────

export interface WaitlistSignup {
  id: string;
  email: string;
  businessName: string | null;
  businessCategory: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  position: number | null;
  status: string; // waiting | contacted | onboarded
  createdAt: Date;
}

// ─── Developer Key ──────────────────────────────────────────────────────────

export interface DeveloperKey {
  id: string;
  name: string;
  keyPrefix: string | null; // e.g., "sk-...abc" (hash not exposed)
  rateLimitPerMinute: number;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

// ─── Geocoding Lookup ───────────────────────────────────────────────────────

export interface GeocodingLookup {
  id: string;
  zip: string | null;
  city: string | null;
  state: string | null;
  country: string; // default "US"
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}
