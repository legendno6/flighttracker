export type FlightStatus =
  | 'Scheduled'
  | 'Boarding'
  | 'Gate Open'
  | 'Delayed'
  | 'Taxiing'
  | 'Departed'
  | 'In Flight'
  | 'Descending'
  | 'Landed'
  | 'Cancelled'
  | 'Diverted'
  | 'Unknown';

/** Broad color-coding bucket: green/yellow/blue/gray/red per the dashboard spec. */
export type StatusCategory = 'ontime' | 'delayed' | 'inflight' | 'scheduled' | 'cancelled';

export interface AirportInfo {
  name: string | null;
  code: string | null;
  /** ICAO airport code (e.g. "KJFK"), kept separate from the IATA-preferring `code` above — needed for OpenSky's airport-based track-history lookups. */
  icaoCode: string | null;
  city: string | null;
  scheduled: string | null; // ISO 8601
  estimated: string | null; // ISO 8601
  actual: string | null; // ISO 8601
  /** ADS-B-observed departure/arrival time from OpenSky's flight-track history, when found. Distinct from `actual` (schedule-provider gate time) — not the same event, shown as a separate supplementary data point rather than merged in. */
  adsbConfirmed: string | null; // ISO 8601
  terminal: string | null;
  gate: string | null;
  baggageClaim: string | null;
  timezone: string | null; // IANA tz name, e.g. "America/New_York"
}

export interface LivePosition {
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  headingDeg: number | null;
  /** Climb (+) / descent (-) rate in feet/minute. */
  verticalRateFtMin: number | null;
  /** Aircraft's unique ADS-B transponder hex address. */
  icao24: string | null;
  /** Raw ADS-B emitter category code (0=no info, 1=light, ... 7=rotorcraft, ...) — mapped to a label in the UI layer. */
  categoryCode: number | null;
  onGround: boolean;
  source: 'opensky';
  observedAt: string; // ISO 8601
}

export interface FlightLookupResult {
  airline: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  flightNumber: string; // digits only, e.g. "5111"
  flightIata: string | null; // e.g. "DL5111"
  flightIcao: string | null; // e.g. "DAL5111"
  aircraftType: string | null;
  aircraftRegistration: string | null;
  flightDate: string; // yyyy-mm-dd
  status: FlightStatus;
  departure: AirportInfo;
  arrival: AirportInfo;
  live: LivePosition | null;
  /** Name of the provider that produced this result, for diagnostics/UI. */
  providerName: string;
  fetchedAt: string; // ISO 8601
}

/** A flight the user is tracking, combining input + last known lookup result. */
export interface TrackedFlight {
  id: string; // stable id: `${flightIcaoOrInput}-${flightDate}`
  input: string; // raw normalized user input, e.g. "DAL5111"
  flightDate: string; // yyyy-mm-dd
  data: FlightLookupResult | null;
  lastError: string | null;
  isLoading: boolean;
  lastRefreshedAt: string | null; // ISO 8601 — last *successful* lookup, shown on the card
  /** ISO 8601 — last lookup *attempt* regardless of outcome, used for tiered-refresh timing so a repeatedly-failing lookup doesn't retry on every tick. */
  lastAttemptedAt: string | null;
  addedAt: string; // ISO 8601
  /** True when this flight was added 2+ calendar days before departure and the user said they don't have paid API access that far out — see flightService's far-out gating. Real lookups are deferred until close enough to departure that a free-tier plan can plausibly return data. */
  farOutDeferred: boolean;
}

export interface NormalizedFlightNumber {
  /** Original text entered by the user. */
  raw: string;
  /** IATA airline code, e.g. "DL". Null if the prefix wasn't recognized. */
  iataCode: string | null;
  /** ICAO airline code, e.g. "DAL". Null if the prefix wasn't recognized. */
  icaoCode: string | null;
  /** Human airline name if known. */
  airlineName: string | null;
  /** Numeric flight number portion, e.g. "5111". */
  number: string;
  /** Best-effort canonical IATA-style identifier, e.g. "DL5111". */
  iataFlightNumber: string | null;
  /** Best-effort canonical ICAO-style identifier, e.g. "DAL5111". */
  icaoFlightNumber: string | null;
}
