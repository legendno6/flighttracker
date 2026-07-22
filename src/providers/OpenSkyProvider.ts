import {
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type FlightLookupRequest,
  type FlightProvider,
} from './FlightProvider';
import type { FlightLookupResult, LivePosition } from '../types/flight';

// Same-origin proxy — see server/openSkyCore.ts for why this can't call
// OpenSky directly from the browser (client-credentials auth doesn't expose
// CORS headers for real, valid clients, and there's no per-client "Web
// Origins" setting in their self-service portal to fix it).
const PROXY_URL = '/api/opensky';

interface OpenSkyProxySuccess {
  live: {
    latitude: number;
    longitude: number;
    altitudeFt: number | null;
    groundSpeedKt: number | null;
    headingDeg: number | null;
    verticalRateFtMin: number | null;
    icao24: string | null;
    categoryCode: number | null;
    onGround: boolean;
    observedAt: string;
  };
}

interface OpenSkyProxyError {
  error?: { title?: string; detail?: string };
}

export interface FlightTrackHistory {
  firstSeen: string; // ISO 8601
  lastSeen: string; // ISO 8601
}

/**
 * Live-position source used as a fallback when the primary provider is
 * unavailable, and as an enrichment source to fill in live lat/lon/altitude
 * when the primary provider doesn't include live tracking data.
 *
 * Note: OpenSky's REST API has no "search by flight number" endpoint — every
 * lookup fetches the full global state-vector snapshot and matches by ICAO
 * callsign (done server-side in the proxy, since that payload is sizeable).
 * That's inherent to the API, not this app; it means OpenSky can only ever
 * report *current* position for an airborne aircraft, never gates,
 * terminals, baggage claims, or scheduled times.
 */
export class OpenSkyProvider implements FlightProvider {
  readonly id = 'opensky';
  readonly displayName = 'OpenSky Network';

  isConfigured(): boolean {
    // Credentials live server-side (OPENSKY_CLIENT_ID/SECRET); the client
    // can't see whether they're set, so this optimistically returns true and
    // lets the proxy's own "not configured" error surface through the normal
    // error-reporting path if they aren't.
    return true;
  }

  /**
   * Fetches live position for a flight by matching its ICAO callsign against
   * the global state snapshot. `callsignOverride` should be used whenever a
   * richer provider (FlightAware/AviationStack) already confirmed the actual
   * operating callsign — for regional/codeshare flights (e.g. United Express
   * "UAL5511" marketed but actually flown by SkyWest broadcasting "SKW5511"
   * over ADS-B), the marketing-number guess in `request.normalized` never
   * matches anything OpenSky is tracking.
   */
  async lookupFlight(request: FlightLookupRequest, callsignOverride?: string | null): Promise<FlightLookupResult> {
    const callsign = callsignOverride ?? request.normalized.icaoFlightNumber;
    if (!callsign) {
      throw new ProviderUnavailableError(
        'OpenSky matches flights by ICAO callsign; this flight number could not be resolved to one.',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${PROXY_URL}?${new URLSearchParams({ callsign }).toString()}`, {
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new ProviderNetworkError(
        err instanceof Error && err.name === 'TimeoutError'
          ? 'OpenSky proxy request timed out.'
          : 'Could not reach the OpenSky proxy — is the dev server (or your deployment) running it?',
      );
    }

    if (response.status === 429) {
      throw new ProviderRateLimitError('OpenSky rate limit reached.');
    }

    let body: Partial<OpenSkyProxySuccess> & OpenSkyProxyError;
    try {
      body = (await response.json()) as Partial<OpenSkyProxySuccess> & OpenSkyProxyError;
    } catch {
      throw new ProviderNetworkError(`OpenSky proxy returned an unreadable response (HTTP ${response.status}).`);
    }

    if (body.error?.title === 'not_found') {
      throw new FlightNotFoundError(
        'OpenSky has no current position for this flight (it may not be airborne right now).',
      );
    }
    if (body.error) {
      throw new ProviderUnavailableError(`OpenSky error: ${body.error.detail ?? body.error.title ?? 'Unknown error'}`);
    }
    if (!response.ok || !body.live) {
      throw new ProviderNetworkError(`OpenSky returned HTTP ${response.status}.`);
    }

    const live: LivePosition = { ...body.live, source: 'opensky' };

    return {
      airline: request.normalized.airlineName,
      airlineIata: request.normalized.iataCode,
      airlineIcao: request.normalized.icaoCode,
      flightNumber: request.normalized.number,
      flightIata: request.normalized.iataFlightNumber,
      flightIcao: request.normalized.icaoFlightNumber,
      aircraftType: null,
      aircraftRegistration: null,
      flightDate: request.flightDate,
      status: live.onGround ? 'Taxiing' : 'In Flight',
      departure: emptyAirport(),
      arrival: emptyAirport(),
      live,
      providerName: this.displayName,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Best-effort lookup of ADS-B-observed departure/arrival times via
   * OpenSky's airport-based /flights/departure and /flights/arrival
   * endpoints. Returns null on any failure (not-found, not-configured,
   * network error) rather than throwing — this is a supplementary
   * confirmation step, never required for a flight card to work.
   */
  async fetchTrackHistory(
    callsign: string,
    departureIcao: string | null,
    arrivalIcao: string | null,
    flightDate: string,
  ): Promise<FlightTrackHistory | null> {
    if (!departureIcao && !arrivalIcao) return null;

    const params = new URLSearchParams({ mode: 'track', callsign, date: flightDate });
    if (departureIcao) params.set('departureIcao', departureIcao);
    if (arrivalIcao) params.set('arrivalIcao', arrivalIcao);

    try {
      const response = await fetch(`${PROXY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json()) as Partial<FlightTrackHistory> & OpenSkyProxyError;
      if (!response.ok || body.error || !body.firstSeen || !body.lastSeen) return null;
      return { firstSeen: body.firstSeen, lastSeen: body.lastSeen };
    } catch {
      return null;
    }
  }
}

function emptyAirport() {
  return {
    name: null,
    code: null,
    icaoCode: null,
    city: null,
    scheduled: null,
    estimated: null,
    actual: null,
    adsbConfirmed: null,
    terminal: null,
    gate: null,
    baggageClaim: null,
    timezone: null,
  };
}
