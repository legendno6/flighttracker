import {
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type FlightLookupRequest,
  type FlightProvider,
} from './FlightProvider';
import type { AirportInfo, FlightLegSummary, FlightLookupResult, FlightStatus } from '../types/flight';
import { findAirportTimezone } from '../data/airportTimezones';
import { FlightAwareUsageTracker } from '../services/flightAwareUsageTracker';
import { localDateInZone } from '../utils/dateTimeUtils';

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

/**
 * AeroAPI's `/flights/{ident}` can return more than one instance for the
 * same ident on the same calendar date — some flight numbers cover a
 * same-day out-and-back rotation (e.g. HXD→CLT later today *and* CLT→HXD
 * already en route), both sharing one designator. Picking the array's
 * first match (as this used to) is unreliable: confirmed directly against
 * AeroAPI that the not-yet-departed leg can come back *before* the
 * currently-airborne one. Prefer whichever leg is actually in progress
 * right now (departed, not yet arrived); otherwise fall back to whichever
 * leg's departure is chronologically closest to now, so an already-passed
 * or far-future leg doesn't win over the one that's actually relevant.
 */
function pickMostRelevantFlight(flights: FlightAwareFlight[]): FlightAwareFlight {
  const inProgress = flights.find((f) => f.actual_out && !f.actual_in);
  if (inProgress) return inProgress;

  const now = Date.now();
  return flights.reduce((closest, candidate) => {
    const candidateTime = Date.parse(candidate.estimated_out ?? candidate.scheduled_out ?? '');
    if (Number.isNaN(candidateTime)) return closest;
    const closestTime = Date.parse(closest.estimated_out ?? closest.scheduled_out ?? '');
    if (Number.isNaN(closestTime)) return candidate;
    return Math.abs(candidateTime - now) < Math.abs(closestTime - now) ? candidate : closest;
  });
}

/** Stable identity for a specific leg — route + scheduled departure, not array position (AeroAPI's own response order isn't guaranteed stable). */
function legKeyFor(flight: FlightAwareFlight): string {
  const originCode = flight.origin?.code_iata ?? flight.origin?.code ?? '';
  const destCode = flight.destination?.code_iata ?? flight.destination?.code ?? '';
  return `${originCode}-${destCode}-${flight.scheduled_out ?? ''}`;
}

/** Adds (or subtracts) whole days from a yyyy-mm-dd date string, staying in UTC-safe arithmetic throughout. */
function shiftIsoDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The calendar date this leg's *origin airport* would call its own
 * departure date — not the UTC date `scheduled_out` happens to fall on.
 * Confirmed directly against AeroAPI: a Toronto (EDT, UTC-4) departure at
 * 9:50 PM local is 01:50 UTC the *next* day, so slicing `scheduled_out`'s
 * raw UTC digits (the previous approach) reads it as tomorrow, not today —
 * and worse, that same UTC slice makes *yesterday's* Toronto departure
 * (21:50 EDT the day before) land inside *today's* UTC calendar day,
 * silently matching a flight that already landed hours ago instead of the
 * one that hasn't departed yet. Any airport east of UTC has some evening
 * departure window where this flips.
 */
function flightLocalDate(flight: FlightAwareFlight): string | null {
  const tz =
    flight.origin?.timezone ??
    findAirportTimezone(flight.origin?.code_iata ?? flight.origin?.code ?? null) ??
    findAirportTimezone(flight.origin?.code_icao ?? null);
  return localDateInZone(flight.scheduled_out ?? null, tz);
}

function legSummaryFor(flight: FlightAwareFlight): FlightLegSummary {
  return {
    legKey: legKeyFor(flight),
    departureCode: flight.origin?.code_iata ?? flight.origin?.code ?? null,
    arrivalCode: flight.destination?.code_iata ?? flight.destination?.code ?? null,
    scheduledDeparture: flight.scheduled_out ?? null,
    status: mapStatus(flight),
  };
}

const STATUS_KEYWORD_MAP: Array<[RegExp, FlightStatus]> = [
  [/cancel/i, 'Cancelled'],
  [/divert/i, 'Diverted'],
  [/arriv|land/i, 'Landed'],
  [/delay/i, 'Delayed'],
  [/board/i, 'Boarding'],
  [/taxi/i, 'Taxiing'],
  [/route|air|depart/i, 'In Flight'],
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
  readonly usage = new FlightAwareUsageTracker();

  constructor(private readonly getCostLimit: () => number) {}

  isConfigured(): boolean {
    // The API key lives server-side; the client can't see whether it's set,
    // so this optimistically returns true and lets the proxy's own "not
    // configured" error (if any) surface through the normal error path.
    return true;
  }

  async lookupFlight(request: FlightLookupRequest): Promise<FlightLookupResult> {
    const costLimit = this.getCostLimit();
    if (this.usage.isOverLimit(costLimit)) {
      const spent = this.usage.current?.totalCost.toFixed(2) ?? '?';
      throw new ProviderRateLimitError(
        `FlightAware cost limit ($${costLimit.toFixed(2)}) reached — used $${spent} this period.`,
      );
    }

    const ident = request.normalized.icaoFlightNumber ?? request.normalized.iataFlightNumber;
    if (!ident) {
      throw new ProviderUnavailableError('Could not resolve a flight identifier to search for.');
    }

    // Padded a day on each side of the requested calendar date: the window
    // has to be expressed in UTC, but "today" means today at the *origin
    // airport*, which for any zone east of UTC (including every North
    // American airport in the evening) can fall on a different UTC date
    // than the requester's own calendar date. The exact match against
    // `request.flightDate` happens below, in the origin's own local time
    // (see flightLocalDate) — this window just has to be wide enough not to
    // exclude the real flight before that filtering ever runs.
    const params = new URLSearchParams({
      ident,
      start: `${shiftIsoDate(request.flightDate, -1)}T00:00:00Z`,
      end: `${shiftIsoDate(request.flightDate, 1)}T23:59:59Z`,
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

    const todaysFlights = body.flights.filter((f) => flightLocalDate(f) === request.flightDate);
    if (todaysFlights.length === 0) {
      // Nothing in the (deliberately wide) window actually falls on the
      // requested date at the origin's own local time — trusting an
      // adjacent day's instance here (as a bare fallback to `body.flights`
      // used to) risks silently showing an already-completed flight as if
      // it were the one being tracked.
      throw new FlightNotFoundError();
    }
    const pool = todaysFlights;

    // AeroAPI can return more than one instance for the same ident on the
    // same date (see pickMostRelevantFlight's doc comment) — dedupe by
    // route+scheduled-time so near-identical/duplicate records don't count
    // as "genuinely distinct" legs.
    const distinctByKey = new Map<string, FlightAwareFlight>();
    for (const f of pool) {
      const key = legKeyFor(f);
      if (!distinctByKey.has(key)) distinctByKey.set(key, f);
    }
    const distinctLegs = [...distinctByKey.values()];

    let flight: FlightAwareFlight;
    let legKey: string | undefined;
    let alternateLegs: FlightLegSummary[] | undefined;

    if (request.legKey) {
      // A specific leg was pinned by an earlier disambiguation — keep
      // selecting it. If it's no longer present (an unexpected schedule
      // change), fall back to the normal heuristic rather than erroring.
      flight = distinctByKey.get(request.legKey) ?? pickMostRelevantFlight(pool);
    } else if (distinctLegs.length > 1) {
      flight = pickMostRelevantFlight(distinctLegs);
      legKey = legKeyFor(flight);
      alternateLegs = distinctLegs.map(legSummaryFor);
    } else {
      flight = pickMostRelevantFlight(pool);
    }

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
      legKey,
      alternateLegs,
    };
  }
}
