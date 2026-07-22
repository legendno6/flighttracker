import {
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type FlightLookupRequest,
  type FlightProvider,
} from './FlightProvider';
import type { AirportInfo, FlightLookupResult, FlightStatus } from '../types/flight';
import { findAirportTimezone } from '../data/airportTimezones';

// Same-origin proxy — see server/flightAwareCore.ts for why this can't call
// AeroAPI directly from the browser (no CORS headers on their responses).
const PROXY_URL = '/api/flightaware';

interface FlightAwareAirport {
  code?: string | null;
  code_iata?: string | null;
  code_icao?: string | null;
  name?: string | null;
  city?: string | null;
  timezone?: string | null;
}

interface FlightAwareFlight {
  ident_iata?: string | null;
  ident_icao?: string | null;
  registration?: string | null;
  aircraft_type?: string | null;
  status?: string | null;
  cancelled?: boolean;
  diverted?: boolean;
  origin?: FlightAwareAirport | null;
  destination?: FlightAwareAirport | null;
  scheduled_out?: string | null;
  estimated_out?: string | null;
  actual_out?: string | null;
  scheduled_in?: string | null;
  estimated_in?: string | null;
  actual_in?: string | null;
  gate_origin?: string | null;
  gate_destination?: string | null;
  terminal_origin?: string | null;
  terminal_destination?: string | null;
  baggage_claim?: string | null;
}

interface FlightAwareResponse {
  flights?: FlightAwareFlight[];
}

interface FlightAwareErrorResponse {
  error?: { title?: string; detail?: string; reason?: string };
}

const STATUS_KEYWORD_MAP: Array<[RegExp, FlightStatus]> = [
  [/cancel/i, 'Cancelled'],
  [/divert/i, 'Diverted'],
  [/arriv|land/i, 'Landed'],
  [/delay/i, 'Delayed'],
  [/board/i, 'Boarding'],
  [/route|air|depart|taxi/i, 'In Flight'],
  [/schedul/i, 'Scheduled'],
];

function mapStatus(flight: FlightAwareFlight): FlightStatus {
  if (flight.diverted) return 'Diverted';
  if (flight.cancelled) return 'Cancelled';
  const raw = flight.status;
  if (!raw) return 'Unknown';
  const match = STATUS_KEYWORD_MAP.find(([pattern]) => pattern.test(raw));
  return match ? match[1] : 'Unknown';
}

function mapAirport(airport: FlightAwareAirport | null | undefined, gate?: string | null, terminal?: string | null, baggageClaim?: string | null): AirportInfo {
  const code = airport?.code_iata ?? airport?.code ?? null;
  return {
    name: airport?.name ?? null,
    code,
    icaoCode: airport?.code_icao ?? null,
    city: airport?.city ?? null,
    scheduled: null, // filled in per-leg by the caller
    estimated: null,
    actual: null,
    adsbConfirmed: null, // filled in later by ProviderManager's OpenSky track-history enrichment, if any
    terminal: terminal ?? null,
    gate: gate ?? null,
    baggageClaim: baggageClaim ?? null,
    timezone: airport?.timezone ?? findAirportTimezone(code) ?? findAirportTimezone(airport?.code_icao ?? null),
  };
}

export class FlightAwareProvider implements FlightProvider {
  readonly id = 'flightaware';
  readonly displayName = 'FlightAware (AeroAPI Personal)';

  isConfigured(): boolean {
    // The API key lives server-side; the client can't see whether it's set,
    // so this optimistically returns true and lets the proxy's own "not
    // configured" error (if any) surface through the normal error path.
    return true;
  }

  async lookupFlight(request: FlightLookupRequest): Promise<FlightLookupResult> {
    const ident = request.normalized.icaoFlightNumber ?? request.normalized.iataFlightNumber;
    if (!ident) {
      throw new ProviderUnavailableError('Could not resolve a flight identifier to search for.');
    }

    const params = new URLSearchParams({
      ident,
      start: `${request.flightDate}T00:00:00Z`,
      end: `${request.flightDate}T23:59:59Z`,
    });

    let response: Response;
    try {
      response = await fetch(`${PROXY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderNetworkError(
        err instanceof Error && err.name === 'TimeoutError'
          ? 'FlightAware proxy request timed out.'
          : 'Could not reach the FlightAware proxy — is the dev server (or your deployment) running it?',
      );
    }

    if (response.status === 429) {
      throw new ProviderRateLimitError('FlightAware rate limit exceeded (Personal plan: 10 requests/minute).');
    }

    let body: FlightAwareResponse & FlightAwareErrorResponse;
    try {
      body = (await response.json()) as FlightAwareResponse & FlightAwareErrorResponse;
    } catch {
      throw new ProviderNetworkError(`FlightAware proxy returned an unreadable response (HTTP ${response.status}).`);
    }

    if (body.error) {
      const detail = body.error.detail ?? body.error.title ?? 'Unknown error';
      throw new ProviderUnavailableError(`FlightAware error: ${detail}`);
    }
    if (!response.ok) {
      throw new ProviderNetworkError(`FlightAware returned HTTP ${response.status}.`);
    }
    if (!body.flights || body.flights.length === 0) {
      throw new FlightNotFoundError();
    }

    const flight =
      body.flights.find((f) => (f.scheduled_out ?? '').slice(0, 10) === request.flightDate) ?? body.flights[0];

    const departure = mapAirport(flight.origin, flight.gate_origin, flight.terminal_origin);
    departure.scheduled = flight.scheduled_out ?? null;
    departure.estimated = flight.estimated_out ?? null;
    departure.actual = flight.actual_out ?? null;

    const arrival = mapAirport(flight.destination, flight.gate_destination, flight.terminal_destination, flight.baggage_claim);
    arrival.scheduled = flight.scheduled_in ?? null;
    arrival.estimated = flight.estimated_in ?? null;
    arrival.actual = flight.actual_in ?? null;

    return {
      airline: request.normalized.airlineName,
      airlineIata: request.normalized.iataCode,
      airlineIcao: request.normalized.icaoCode,
      flightNumber: request.normalized.number,
      flightIata: flight.ident_iata ?? request.normalized.iataFlightNumber,
      flightIcao: flight.ident_icao ?? request.normalized.icaoFlightNumber,
      aircraftType: flight.aircraft_type ?? null,
      aircraftRegistration: flight.registration ?? null,
      flightDate: request.flightDate,
      status: mapStatus(flight),
      departure,
      arrival,
      live: null,
      providerName: this.displayName,
      fetchedAt: new Date().toISOString(),
    };
  }
}
