/**
 * Google Maps Platform (Places API v1) access through the Lovable connector gateway.
 * Everything returned here was actually returned by Google — nothing is inferred.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function headers(extra: Record<string, string> = {}) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !connection) throw new Error("Google Maps is not connected.");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": connection,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  mapsUri: string | null;
  types: string[];
};

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.types",
].join(",");

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  types?: string[];
};

function map(p: RawPlace): PlaceResult {
  return {
    id: p.id ?? "",
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    phone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    businessStatus: p.businessStatus ?? null,
    mapsUri: p.googleMapsUri ?? null,
    types: p.types ?? [],
  };
}

/** Text search against the official Places API. */
export async function searchPlaces(query: string, maxResults = 10): Promise<PlaceResult[]> {
  const res = await fetch(`${GATEWAY}/v1/places:searchText`, {
    method: "POST",
    headers: headers({ "X-Goog-FieldMask": FIELDS }),
    body: JSON.stringify({ textQuery: query, maxResultCount: Math.min(20, maxResults) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Places search failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { places?: RawPlace[] };
  return (json.places ?? []).map(map);
}
