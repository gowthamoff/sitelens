/**
 * Google Places API (New) Service
 *
 * Fetches live, rating-enriched POI data from Google Places Nearby Search API.
 * Runs ALONGSIDE the OSM query to enrich our analysis with fresh data that OSM
 * simply doesn't have: ratings, review counts, open hours.
 *
 * If GOOGLE_PLACES_KEY is not set, this module gracefully returns empty results
 * so the rest of the analysis pipeline continues working without Google.
 */

// ─── Google → OSM Business Type Mapping ─────────────────────────────────────
// Maps our internal business type to Google Places includedTypes.
// See: https://developers.google.com/maps/documentation/places/web-service/place-types
const GOOGLE_TYPES_MAP = {
  restaurant: ['restaurant', 'fast_food_restaurant', 'cafe', 'food_court', 'ice_cream_shop'],
  pharmacy: ['pharmacy', 'drugstore'],
  grocery: ['supermarket', 'grocery_store', 'convenience_store', 'wholesale_store'],
  clinic: ['doctor', 'dentist', 'medical_clinic', 'veterinary_care'],
  hospital: ['hospital'],
  education: ['school', 'university', 'primary_school', 'secondary_school'],
  fitness: ['gym', 'sports_club', 'fitness_center'],
  bank: ['bank', 'atm'],
  hotel: ['hotel', 'motel', 'hostel', 'lodging'],
  tea: ['cafe', 'coffee_shop', 'tea_house'],
};

// ─── Haversine Distance (metres) ────────────────────────────────────────────
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Fetch from Google Places API (New) ─────────────────────────────────────
async function fetchGooglePlaces({ lat, lng, radius, business_type = 'restaurant' }) {
  const env = require('../config/env');
  const apiKey = env.GOOGLE_PLACES_KEY;

  if (!apiKey || apiKey.trim() === '') {
    // Gracefully disabled — log and return empty
    console.warn('\n⚠️ [GooglePlaces] GOOGLE_PLACES_KEY is missing or empty!');
    console.warn('   The Competitor Analysis tab will still work, but will only use OSM data (no ratings/hours).');
    console.warn('   To fix this: Set $env:GOOGLE_PLACES_KEY in your terminal before running deploy:backend.\n');
    return [];
  }

  const includedTypes = GOOGLE_TYPES_MAP[business_type] || ['establishment'];

  const body = {
    includedTypes,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(radius, 50000), // Google max for Nearby Search is 50 000m
      },
    },
  };

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.location',
    'places.types',
    'places.primaryType',
    'places.rating',
    'places.userRatingCount',
    'places.currentOpeningHours',
    'places.formattedAddress',
    'places.priceLevel',
  ].join(',');

  let res;
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    console.error('[GooglePlaces] Network error:', networkErr.message);
    return [];
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[GooglePlaces] API error ${res.status}:`, text);
    return [];
  }

  const data = await res.json();
  return data.places || [];
}

// ─── Normalise a Google place into our internal POI schema ──────────────────
function normaliseGooglePlace(gPlace, siteLat, siteLng) {
  const lat = gPlace.location?.latitude;
  const lng = gPlace.location?.longitude;
  if (!lat || !lng) return null;

  return {
    google_id: gPlace.id,
    name: gPlace.displayName?.text || 'Unnamed',
    lat,
    lng,
    amenity: gPlace.primaryType || null,
    sub_type: gPlace.primaryType || 'place',

    // Rich fields from Google — not available in OSM
    rating: gPlace.rating ?? null,
    review_count: gPlace.userRatingCount ?? null,
    open_now: gPlace.currentOpeningHours?.openNow ?? null,
    hours: gPlace.currentOpeningHours?.weekdayDescriptions ?? [],
    price_level: gPlace.priceLevel ?? null,
    address: gPlace.formattedAddress ?? null,

    // Derived
    distance_m: Math.round(haversineMetres(siteLat, siteLng, lat, lng)),
    source: 'google',
  };
}

// ─── Merge OSM + Google results ──────────────────────────────────────────────
/**
 * Merges an array of OSM POIs with Google Places results.
 *
 * Strategy:
 *   1. For each Google place, check if a matching OSM entry exists within 30m.
 *   2. If yes — enrich the OSM entry with Google's live data (rating, hours, etc.).
 *   3. If no  — add it as a new entry, flagged source:'google'.
 *
 * @param {object[]} osmList   - Rows from competitorAnalysis().list
 * @param {object[]} gPlaces   - Raw place objects from Google API
 * @param {number}   siteLat
 * @param {number}   siteLng
 * @returns {object[]}         - Merged, enriched list
 */
function mergeOsmWithGoogle(osmList, gPlaces, siteLat, siteLng) {
  const merged = osmList.map(p => ({ ...p, source: 'osm' }));

  for (const gPlace of gPlaces) {
    const norm = normaliseGooglePlace(gPlace, siteLat, siteLng);
    if (!norm) continue;

    const duplicate = merged.find(osm =>
      haversineMetres(osm.lat, osm.lng, norm.lat, norm.lng) < 30
    );

    if (duplicate) {
      // Enrich existing OSM entry with Google live data
      duplicate.rating = norm.rating;
      duplicate.review_count = norm.review_count;
      duplicate.open_now = norm.open_now;
      duplicate.hours = norm.hours;
      duplicate.price_level = norm.price_level;
      duplicate.address = norm.address;
      duplicate.google_id = norm.google_id;
      duplicate.source = 'osm+google';
    } else {
      // Brand-new place Google knows about but OSM doesn't
      merged.push(norm);
    }
  }

  // Re-sort by distance after adding Google-only entries
  merged.sort((a, b) => a.distance_m - b.distance_m);
  return merged;
}

module.exports = { fetchGooglePlaces, mergeOsmWithGoogle };
