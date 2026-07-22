/**
 * Shared proxy logic for FlightAware's AeroAPI, used by both the Vite dev
 * server middleware (local development) and the Vercel serverless function
 * (production). This exists because AeroAPI sends no CORS headers at all —
 * confirmed by testing directly: requests complete on FlightAware's servers
 * but the browser hides the response, so `fetch()` throws "Failed to fetch"
 * no matter how the client-side code is written. A same-origin proxy is the
 * only way to use it from a browser app; it also keeps FLIGHTAWARE_API_KEY
 * out of client-side network traffic entirely.
 *
 * Deliberately dumb: forwards only the handful of query parameters AeroAPI's
 * `/flights/{ident}` endpoint documents (ident, start, end, max_pages) and
 * passes the response through verbatim. All interpretation of the flight
 * data (status mapping, date matching, field selection) stays client-side in
 * FlightAwareProvider, consistent with every other provider in this app.
 */

const AEROAPI_BASE = 'https://aeroapi.flightaware.com/aeroapi';
const FORWARDED_PARAMS = ['start', 'end', 'max_pages'];

export interface ProxyResult {
  status: number;
  body: string;
}

function jsonError(status: number, title: string, detail: string): ProxyResult {
  return { status, body: JSON.stringify({ error: { title, detail } }) };
}

export async function fetchFlightAwareFlight(ident: string | null, searchParams: URLSearchParams): Promise<ProxyResult> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) {
    return jsonError(500, 'not_configured', 'FLIGHTAWARE_API_KEY is not set on the server.');
  }
  if (!ident) {
    return jsonError(400, 'bad_request', 'Missing "ident" query parameter.');
  }

  const upstreamParams = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value) upstreamParams.set(key, value);
  }
  const query = upstreamParams.toString();
  const url = `${AEROAPI_BASE}/flights/${encodeURIComponent(ident)}${query ? `?${query}` : ''}`;

  try {
    const upstream = await fetch(url, { headers: { 'x-apikey': apiKey } });
    const body = await upstream.text();
    return { status: upstream.status, body };
  } catch {
    return jsonError(502, 'network_error', 'Could not reach FlightAware.');
  }
}
