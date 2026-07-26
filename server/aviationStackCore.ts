/**
 * Shared proxy logic for AviationStack, used by the Vite dev-server
 * middleware, the Vercel serverless function, and the Pi/self-hosted
 * production server. AviationStack's free tier only supports plain HTTP
 * (no HTTPS) — calling it directly from the browser, as this app used to,
 * means every request gets silently blocked as "mixed content" the moment
 * the page itself is loaded over HTTPS (confirmed by testing: `fetch()`
 * rejects before any request leaves the browser, and AviationStack never
 * even sees it). A server has no such restriction — proxying through here
 * fixes that regardless of which protocol the page itself uses, the same
 * reasoning that already applies to the FlightAware/OpenSky proxies (just
 * for HTTP-vs-HTTPS instead of missing CORS headers).
 *
 * Unlike FlightAware/OpenSky, AviationStack's API key is entered by the
 * user in the app's own Settings UI (not an env var) and is still supplied
 * by the browser on every request — this proxy only relays it to
 * AviationStack over the one hop that has to stay HTTP, it doesn't store
 * or need it configured server-side.
 */

const AVIATIONSTACK_BASE = 'http://api.aviationstack.com/v1/flights';
const FORWARDED_PARAMS = ['access_key', 'flight_iata', 'flight_icao', 'flight_date'];

export interface ProxyResult {
  status: number;
  body: string;
}

function jsonError(status: number, code: string, message: string): ProxyResult {
  return { status, body: JSON.stringify({ error: { code, message } }) };
}

export async function fetchAviationStackFlight(searchParams: URLSearchParams): Promise<ProxyResult> {
  if (!searchParams.get('access_key')) {
    return jsonError(400, 'bad_request', 'Missing "access_key" query parameter.');
  }
  if (!searchParams.get('flight_iata') && !searchParams.get('flight_icao')) {
    return jsonError(400, 'bad_request', 'Missing "flight_iata" or "flight_icao" query parameter.');
  }

  const upstreamParams = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value) upstreamParams.set(key, value);
  }

  try {
    const upstream = await fetch(`${AVIATIONSTACK_BASE}?${upstreamParams.toString()}`);
    const body = await upstream.text();
    return { status: upstream.status, body };
  } catch {
    return jsonError(502, 'network_error', 'Could not reach AviationStack.');
  }
}
