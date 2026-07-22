import {
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type FlightLookupRequest,
  type FlightProvider,
} from './FlightProvider';
import type { AirportInfo, FlightLookupResult, FlightStatus } from '../types/flight';
import { MonthlyRequestBudget } from '../services/requestBudget';
import { reinterpretAsLocalWallClock, todayIsoDate } from '../utils/dateTimeUtils';
import { findAirportTimezone } from '../data/airportTimezones';

// AviationStack's free tier is HTTP-only (no HTTPS) and capped at 100
// requests/month. Both constraints come from their pricing terms, not this
// app — worth re-checking on their pricing page if this ever seems stale.
const API_BASE_URL = 'http://api.aviationstack.com/v1/flights';
const FREE_TIER_MONTHLY_LIMIT = 100;

interface AviationStackAirportPayload {
  airport: string | null;
  timezone: string | null;
  iata: string | null;
  icao: string | null;
  terminal: string | null;
  gate: string | null;
  baggage?: string | null;
  delay: number | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
}

interface AviationStackFlightPayload {
  flight_date: string;
  flight_status: string;
  departure: AviationStackAirportPayload;
  arrival: AviationStackAirportPayload;
  airline: { name: string | null; iata: string | null; icao: string | null };
  flight: { number: string | null; iata: string | null; icao: string | null };
  aircraft: { registration: string | null; iata: string | null; icao: string | null } | null;
  live: {
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
    updated: string;
  } | null;
}

interface AviationStackResponse {
  data: AviationStackFlightPayload[];
  error?: { code: string; message: string };
}

const STATUS_MAP: Record<string, FlightStatus> = {
  scheduled: 'Scheduled',
  active: 'In Flight',
  landed: 'Landed',
  cancelled: 'Cancelled',
  incident: 'Unknown',
  diverted: 'Diverted',
};

function mapAirport(payload: AviationStackAirportPayload | undefined): AirportInfo {
  const code = payload?.iata ?? payload?.icao ?? null;
  // AviationStack's free tier is inconsistent about populating this field —
  // fall back to a static lookup for major airports rather than silently
  // displaying local-as-if-UTC when it's missing.
  const timezone = payload?.timezone ?? findAirportTimezone(code) ?? findAirportTimezone(payload?.icao ?? null);

  return {
    name: payload?.airport ?? null,
    code,
    icaoCode: payload?.icao ?? null,
    city: null, // AviationStack doesn't return city separately from airport name
    // AviationStack's scheduled/estimated/actual timestamps are already the
    // airport's own local wall-clock time, just mislabeled with a bogus
    // "+00:00" as if they were UTC — re-anchor them to true UTC for this
    // zone so the rest of the app (which assumes correctly-anchored
    // timestamps) displays and converts them correctly.
    scheduled: reinterpretAsLocalWallClock(payload?.scheduled ?? null, timezone),
    estimated: reinterpretAsLocalWallClock(payload?.estimated ?? null, timezone),
    actual: reinterpretAsLocalWallClock(payload?.actual ?? null, timezone),
    adsbConfirmed: null, // filled in later by ProviderManager's OpenSky track-history enrichment, if any
    terminal: payload?.terminal ?? null,
    gate: payload?.gate ?? null,
    baggageClaim: payload?.baggage ?? null,
    timezone,
  };
}

export class AviationStackProvider implements FlightProvider {
  readonly id = 'aviationstack';
  readonly displayName = 'AviationStack';
  readonly budget = new MonthlyRequestBudget(this.id, FREE_TIER_MONTHLY_LIMIT);

  constructor(private readonly getApiKey: () => string) {}

  isConfigured(): boolean {
    return this.getApiKey().trim().length > 0;
  }

  async lookupFlight(request: FlightLookupRequest): Promise<FlightLookupResult> {
    const apiKey = this.getApiKey().trim();
    if (!apiKey) {
      throw new ProviderUnavailableError('No AviationStack API key configured. Add one in Settings.');
    }
    if (!this.budget.hasRemaining()) {
      throw new ProviderRateLimitError(
        `AviationStack free-tier limit (${this.budget.limit}/month) reached. Try again next month, or add another provider.`,
      );
    }

    const flightIata = request.normalized.iataFlightNumber;
    const flightIcao = request.normalized.icaoFlightNumber;
    const identifier = flightIata ?? flightIcao;
    if (!identifier) {
      throw new ProviderUnavailableError('Could not resolve a flight identifier to search for.');
    }

    const params = new URLSearchParams({ access_key: apiKey });
    if (flightIata) {
      params.set('flight_iata', flightIata);
    } else if (flightIcao) {
      params.set('flight_icao', flightIcao);
    }
    // The free plan doesn't support flight_date at all (it's a paid-only
    // "historical/scheduled" feature) — even sending it for today's date
    // gets rejected with function_access_restricted. Omitting it for today
    // lets the free plan's real-time endpoint behavior serve the request;
    // for other dates we still send it since there's no way around needing
    // that paid feature, and the resulting error is accurate.
    if (request.flightDate !== todayIsoDate()) {
      params.set('flight_date', request.flightDate);
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderNetworkError(
        err instanceof Error && err.name === 'TimeoutError'
          ? 'AviationStack request timed out.'
          : 'Could not reach AviationStack.',
      );
    }

    this.budget.recordUsage();

    if (response.status === 429) {
      throw new ProviderRateLimitError('AviationStack rate limit exceeded.');
    }

    // AviationStack sends a JSON body describing what went wrong on error
    // responses too (e.g. https_access_restricted, usage_limit_reached) —
    // worth reading even when the HTTP status itself isn't 2xx.
    let body: AviationStackResponse;
    try {
      body = (await response.json()) as AviationStackResponse;
    } catch {
      if (!response.ok) {
        throw new ProviderNetworkError(`AviationStack returned HTTP ${response.status}.`);
      }
      throw new ProviderNetworkError('AviationStack returned an unreadable response.');
    }

    if (body.error) {
      throw new ProviderUnavailableError(
        `AviationStack error${body.error.code ? ` (${body.error.code})` : ''}: ${body.error.message}`,
      );
    }
    if (!response.ok) {
      throw new ProviderNetworkError(`AviationStack returned HTTP ${response.status}.`);
    }
    if (!body.data || body.data.length === 0) {
      throw new FlightNotFoundError();
    }

    // Without flight_date, AviationStack can return more than one recent
    // occurrence of this flight number — prefer the one matching the
    // requested date if present, rather than assuming data[0] is the right day.
    const flight = body.data.find((f) => f.flight_date === request.flightDate) ?? body.data[0];
    const status = STATUS_MAP[flight.flight_status] ?? 'Unknown';

    const result: FlightLookupResult = {
      airline: flight.airline?.name ?? request.normalized.airlineName,
      airlineIata: flight.airline?.iata ?? request.normalized.iataCode,
      airlineIcao: flight.airline?.icao ?? request.normalized.icaoCode,
      flightNumber: request.normalized.number,
      flightIata: flight.flight?.iata ?? flightIata,
      flightIcao: flight.flight?.icao ?? flightIcao,
      aircraftType: flight.aircraft?.icao ?? flight.aircraft?.iata ?? null,
      aircraftRegistration: flight.aircraft?.registration ?? null,
      flightDate: flight.flight_date ?? request.flightDate,
      status,
      departure: mapAirport(flight.departure),
      arrival: mapAirport(flight.arrival),
      live: flight.live
        ? {
            latitude: flight.live.latitude,
            longitude: flight.live.longitude,
            altitudeFt: flight.live.altitude ? Math.round(flight.live.altitude * 3.28084) : null,
            groundSpeedKt: flight.live.speed_horizontal
              ? Math.round(flight.live.speed_horizontal * 0.539957)
              : null,
            headingDeg: flight.live.direction ?? null,
            // speed_vertical is in km/h, same unit as speed_horizontal above (1 km/h = 54.6807 ft/min)
            verticalRateFtMin: flight.live.speed_vertical
              ? Math.round(flight.live.speed_vertical * 54.6807)
              : null,
            icao24: null, // AviationStack's live object doesn't include the ADS-B transponder address
            categoryCode: null,
            onGround: flight.live.is_ground,
            source: 'opensky', // overwritten by ProviderManager if OpenSky supplies its own reading
            observedAt: flight.live.updated ?? new Date().toISOString(),
          }
        : null,
      providerName: this.displayName,
      fetchedAt: new Date().toISOString(),
    };

    return result;
  }
}
