// Google Street View Static API helper.
//
// IMPORTANT: Street View is a DEV FALLBACK ONLY — never the primary image source.
// Primary source = municipal vehicle cameras. Google automatically and
// irreversibly blurs faces and license plates, so imagery is anonymized by the
// provider. This module only builds a public Street View Static URL; it never
// touches the local-pipeline API normalizer (that stays loopback-only).

const STREETVIEW_ENDPOINT =
  "https://maps.googleapis.com/maps/api/streetview";

export function getStreetViewKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_STREETVIEW_API_KEY || "";
}

export function hasStreetViewKey() {
  return Boolean(getStreetViewKey());
}

// Builds a Street View Static image URL for a detection's coordinates.
// Returns null when no API key is configured or the coordinates are invalid,
// so the UI can render a graceful placeholder instead of a broken image.
export function buildStreetViewUrl({
  lat,
  lng,
  size = "600x300",
  heading,
  pitch = 0,
  fov = 80,
  key,
} = {}) {
  const apiKey = key ?? getStreetViewKey();
  if (!apiKey) return null;

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return null;
  }

  const params = new URLSearchParams({
    size,
    location: `${lat},${lng}`,
    fov: String(fov),
    pitch: String(pitch),
    key: apiKey,
  });

  if (heading !== undefined && heading !== null) {
    params.set("heading", String(heading));
  }

  return `${STREETVIEW_ENDPOINT}?${params.toString()}`;
}
