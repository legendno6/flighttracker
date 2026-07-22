/**
 * Shared proxy logic for OpenSky Network, used by both the Vite dev-server
 * middleware and the Vercel serverless function. OpenSky's client-credentials
 * auth flow doesn't work from a browser — confirmed by testing: the token
 * exchange completes server-side (visible in OpenSky's own usage dashboard),
 * but the response isn't exposed to JavaScript, and OpenSky's self-service
 * client portal has no "Web Origins"/CORS setting to fix this per-client.
 * A same-origin proxy is the only way to use it from a browser app.
 *
 * Unlike the FlightAware proxy (a dumb passthrough), this one does the
 * callsign matching server-side too: the states/all payload is a global
 * snapshot of every tracked aircraft (megabytes of JSON), and there's no
 * reason to ship that whole thing to the browser just to find one row.
 */

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const STATES_URL = 'https://opensky-network.org/api/states/all';
const FLIGHTS_URL = 'https://opensky-network.org/api/flights';

// [icao24, callsign, origin_country, time_position, last_contact, longitude,
//  latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate,
//  sensors, geo_altitude, squawk, spi, position_source, category]
type OpenSkyStateVector = [
  string,
  string | null,
  string,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  boolean,
  number | null,
  number | null,
  number | null,
  number[] | null,
  number | null,
  string | null,
  boolean,
  number,
  number?,
];

interface OpenSkyStatesPayload {
  states: OpenSkyStateVector[] | null;
}

interface OpenSkyFlightTrackEntry {
  icao24: string;
  firstSeen: number;
  estDepartureAirport: string | null;
  lastSeen: number;
  estArrivalAirport: string | null;
  callsign: string | null;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

class OpenSkyAuthError extends Error {}
class OpenSkyNotConfiguredError extends Error {}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new OpenSkyNotConfiguredError();
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new OpenSkyAuthError(`OpenSky auth returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

export interface ProxyResult {
  status: number;
  body: string;
}

function jsonError(status: number, title: string, detail: string): ProxyResult {
  return { status, body: JSON.stringify({ error: { title, detail } }) };
}

// --- states/all (live position) ---------------------------------------

interface CachedStates {
  payload: OpenSkyStatesPayload;
  cachedAt: number;
}

let cachedStates: CachedStates | null = null;
let pendingStatesFetch: Promise<OpenSkyStatesPayload> | null = null;
const STATES_CACHE_TTL_MS = 15_000;

/**
 * Fetches (or reuses a recent cached copy of) the full states/all snapshot.
 * Refreshing many tracked flights at once (e.g. one auto-refresh cycle
 * hitting several in-flight cards) would otherwise trigger that many
 * redundant full-globe fetches; this collapses them into one.
 */
async function getStatesSnapshot(token: string): Promise<OpenSkyStatesPayload> {
  if (cachedStates && Date.now() - cachedStates.cachedAt < STATES_CACHE_TTL_MS) {
    return cachedStates.payload;
  }
  if (pendingStatesFetch) {
    return pendingStatesFetch;
  }

  pendingStatesFetch = (async () => {
    const response = await fetch(STATES_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`states_http_${response.status}`);
    }
    const payload = (await response.json()) as OpenSkyStatesPayload;
    cachedStates = { payload, cachedAt: Date.now() };
    return payload;
  })();

  try {
    return await pendingStatesFetch;
  } finally {
    pendingStatesFetch = null;
  }
}

export async function fetchOpenSkyPosition(callsign: string | null): Promise<ProxyResult> {
  if (!callsign) {
    return jsonError(400, 'bad_request', 'Missing "callsign" query parameter.');
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    if (err instanceof OpenSkyNotConfiguredError) {
      return jsonError(500, 'not_configured', 'OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET are not set on the server.');
    }
    return jsonError(502, 'auth_failed', 'OpenSky authentication failed — check the server-side client ID/secret.');
  }

  let payload: OpenSkyStatesPayload;
  try {
    payload = await getStatesSnapshot(token);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('states_http_')) {
      return jsonError(502, 'upstream_error', `OpenSky returned HTTP ${err.message.replace('states_http_', '')}.`);
    }
    return jsonError(502, 'network_error', 'Could not reach OpenSky Network.');
  }

  const match = (payload.states ?? []).find((s) => (s[1] ?? '').trim().toUpperCase() === callsign.toUpperCase());
  if (!match) {
    return jsonError(404, 'not_found', 'OpenSky has no current position for this callsign.');
  }

  const live = {
    latitude: match[6] ?? 0,
    longitude: match[5] ?? 0,
    altitudeFt: match[13] != null ? Math.round(match[13] * 3.28084) : null,
    groundSpeedKt: match[9] != null ? Math.round(match[9] * 1.94384) : null,
    headingDeg: match[10] ?? null,
    verticalRateFtMin: match[11] != null ? Math.round(match[11] * 196.85) : null,
    icao24: match[0] ?? null,
    categoryCode: match[17] ?? null,
    onGround: match[8],
    observedAt: new Date(match[4] * 1000).toISOString(),
  };

  return { status: 200, body: JSON.stringify({ live }) };
}

// --- flights/departure, flights/arrival (ADS-B track history) ---------

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60 - 60; // stay just under the API's 2-day cap

async function fetchAirportFlights(
  kind: 'departure' | 'arrival',
  airportIcao: string,
  beginUnix: number,
  endUnix: number,
  token: string,
): Promise<OpenSkyFlightTrackEntry[]> {
  const params = new URLSearchParams({
    airport: airportIcao,
    begin: String(beginUnix),
    end: String(endUnix),
  });
  const response = await fetch(`${FLIGHTS_URL}/${kind}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return []; // OpenSky 404s when there's simply no data for the window
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error(`[openSkyCore] ${kind} request failed`, response.status, detail, `${FLIGHTS_URL}/${kind}?${params.toString()}`);
    throw new Error(`flights_http_${response.status}`);
  }
  return (await response.json()) as OpenSkyFlightTrackEntry[];
}

/**
 * Looks up ADS-B-observed departure/arrival times for a specific flight by
 * querying the relevant airport's flight list and matching by callsign.
 * Only queries whichever of departureIcao/arrivalIcao is actually known —
 * the primary provider (AviationStack/FlightAware) supplies these, this is
 * purely a confirmation/enrichment step, not a replacement.
 */
export async function fetchOpenSkyFlightTrack(
  callsign: string | null,
  departureIcao: string | null,
  arrivalIcao: string | null,
  flightDateIso: string | null,
): Promise<ProxyResult> {
  if (!callsign || !flightDateIso) {
    return jsonError(400, 'bad_request', 'Missing "callsign" or "date" query parameter.');
  }
  if (!departureIcao && !arrivalIcao) {
    return jsonError(400, 'bad_request', 'Need at least one of departureIcao/arrivalIcao.');
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    if (err instanceof OpenSkyNotConfiguredError) {
      return jsonError(500, 'not_configured', 'OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET are not set on the server.');
    }
    return jsonError(502, 'auth_failed', 'OpenSky authentication failed — check the server-side client ID/secret.');
  }

  // OpenSky partitions this data by UTC calendar day and rejects a query
  // spanning more than 2 partitions (confirmed via their own error message:
  // "You can only query across 2 partitions (days)") — so the window here is
  // exactly the flight date + the following UTC day (covers delays pushing
  // into the next day), not a window centered with slop on both sides.
  const beginUnix = Math.floor(new Date(`${flightDateIso}T00:00:00Z`).getTime() / 1000);
  const endUnix = beginUnix + TWO_DAYS_SECONDS;

  try {
    const upperCallsign = callsign.toUpperCase();
    const [departures, arrivals] = await Promise.all([
      departureIcao ? fetchAirportFlights('departure', departureIcao, beginUnix, endUnix, token) : Promise.resolve([]),
      arrivalIcao ? fetchAirportFlights('arrival', arrivalIcao, beginUnix, endUnix, token) : Promise.resolve([]),
    ]);

    const match = [...departures, ...arrivals].find(
      (f) => (f.callsign ?? '').trim().toUpperCase() === upperCallsign,
    );

    if (!match) {
      return jsonError(404, 'not_found', 'No ADS-B track record found for this flight in the given window.');
    }

    return {
      status: 200,
      body: JSON.stringify({
        firstSeen: new Date(match.firstSeen * 1000).toISOString(),
        lastSeen: new Date(match.lastSeen * 1000).toISOString(),
      }),
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('flights_http_')) {
      return jsonError(502, 'upstream_error', `OpenSky returned HTTP ${err.message.replace('flights_http_', '')}.`);
    }
    return jsonError(502, 'network_error', 'Could not reach OpenSky Network.');
  }
}
