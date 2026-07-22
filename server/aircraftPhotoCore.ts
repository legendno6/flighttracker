/**
 * Shared proxy logic for planespotters.net's public photo API, used by both
 * the Vite dev server middleware (local development) and the Vercel
 * serverless function (production). planespotters' API is CORS-enabled, but
 * requests must identify themselves via `User-Agent` (or they receive a 403)
 * — and browsers forbid client-side JS from overriding that header, so a
 * same-origin proxy is the only way to reliably attach it from every user's
 * browser regardless of what their own browser would otherwise send.
 *
 * No API key needed — this is a dumb passthrough like FlightAware's proxy.
 */

const PLANESPOTTERS_BASE = 'https://api.planespotters.net/pub/photos/hex';
const PLANESPOTTERS_USER_AGENT = 'PlaneStatus/1.0 (+https://github.com/legendno6/flighttracker)';
const ICAO24_PATTERN = /^[0-9a-f]{6}$/i;

export interface ProxyResult {
  status: number;
  body: string;
}

function jsonError(status: number, title: string, detail: string): ProxyResult {
  return { status, body: JSON.stringify({ error: { title, detail } }) };
}

export async function fetchAircraftPhoto(icao24: string | null): Promise<ProxyResult> {
  if (!icao24 || !ICAO24_PATTERN.test(icao24)) {
    return jsonError(400, 'bad_request', 'Missing or invalid "icao24" query parameter.');
  }

  try {
    const upstream = await fetch(`${PLANESPOTTERS_BASE}/${icao24.toLowerCase()}`, {
      headers: { 'User-Agent': PLANESPOTTERS_USER_AGENT },
    });
    const body = await upstream.text();
    return { status: upstream.status, body };
  } catch {
    return jsonError(502, 'network_error', 'Could not reach planespotters.net.');
  }
}
