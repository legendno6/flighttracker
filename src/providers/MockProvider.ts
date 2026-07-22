import type { FlightLookupRequest, FlightProvider } from './FlightProvider';
import type { AirportInfo, FlightLookupResult } from '../types/flight';

const DEMO_AIRPORTS: Record<string, { name: string; city: string; tz: string }> = {
  ATL: { name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', tz: 'America/New_York' },
  LGA: { name: 'LaGuardia Airport', city: 'New York', tz: 'America/New_York' },
  JFK: { name: 'John F. Kennedy International', city: 'New York', tz: 'America/New_York' },
  ORD: { name: "O'Hare International", city: 'Chicago', tz: 'America/Chicago' },
  LAX: { name: 'Los Angeles International', city: 'Los Angeles', tz: 'America/Los_Angeles' },
  DFW: { name: 'Dallas/Fort Worth International', city: 'Dallas', tz: 'America/Chicago' },
  SEA: { name: 'Seattle-Tacoma International', city: 'Seattle', tz: 'America/Los_Angeles' },
  DEN: { name: 'Denver International', city: 'Denver', tz: 'America/Denver' },
};

const AIRPORT_CODES = Object.keys(DEMO_AIRPORTS);

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildAirport(code: string, iso: string, timezone: string): AirportInfo {
  const info = DEMO_AIRPORTS[code];
  return {
    name: info.name,
    code,
    icaoCode: `K${code}`, // demo-only convention for continental US airports
    city: info.city,
    scheduled: iso,
    estimated: iso,
    actual: null,
    adsbConfirmed: null,
    terminal: String(1 + (hashString(code) % 5)),
    gate: `${String.fromCharCode(65 + (hashString(code) % 6))}${1 + (hashString(code) % 30)}`,
    baggageClaim: String(1 + (hashString(code + timezone) % 12)),
    timezone,
  };
}

/**
 * Deterministic, offline data generator. Useful for exercising the full UI
 * (progress bars, status colors, sorting) without spending real API quota,
 * and as a reference implementation for what a minimal FlightProvider needs.
 */
export class MockProvider implements FlightProvider {
  readonly id = 'mock';
  readonly displayName = 'Demo Data (offline)';

  isConfigured(): boolean {
    return true;
  }

  async lookupFlight(request: FlightLookupRequest): Promise<FlightLookupResult> {
    const seed = hashString(request.normalized.raw + request.flightDate);
    const depCode = AIRPORT_CODES[seed % AIRPORT_CODES.length];
    const arrCode = AIRPORT_CODES[(seed + 3) % AIRPORT_CODES.length];
    const depInfo = DEMO_AIRPORTS[depCode];
    const arrInfo = DEMO_AIRPORTS[arrCode];

    const now = new Date();
    // Spread demo flights across a window so the dashboard shows a mix of statuses.
    const offsetMinutes = ((seed % 9) - 3) * 60;
    const depTime = new Date(now.getTime() + offsetMinutes * 60_000);
    const durationMinutes = 90 + (seed % 240);
    const arrTime = new Date(depTime.getTime() + durationMinutes * 60_000);

    const hasDeparted = depTime.getTime() <= now.getTime();
    const hasLanded = arrTime.getTime() <= now.getTime();

    return {
      airline: request.normalized.airlineName ?? 'Demo Airlines',
      airlineIata: request.normalized.iataCode,
      airlineIcao: request.normalized.icaoCode,
      flightNumber: request.normalized.number,
      flightIata: request.normalized.iataFlightNumber,
      flightIcao: request.normalized.icaoFlightNumber,
      aircraftType: 'A320',
      aircraftRegistration: `N${100 + (seed % 900)}DM`,
      flightDate: request.flightDate,
      status: hasLanded ? 'Landed' : hasDeparted ? 'In Flight' : 'Scheduled',
      departure: {
        ...buildAirport(depCode, depTime.toISOString(), depInfo.tz),
        actual: hasDeparted ? depTime.toISOString() : null,
      },
      arrival: {
        ...buildAirport(arrCode, arrTime.toISOString(), arrInfo.tz),
        actual: hasLanded ? arrTime.toISOString() : null,
      },
      live:
        hasDeparted && !hasLanded
          ? {
              latitude: 39.5,
              longitude: -98.35,
              altitudeFt: 34000,
              groundSpeedKt: 460,
              headingDeg: 90,
              verticalRateFtMin: seed % 2 === 0 ? 0 : (seed % 4 === 0 ? 1200 : -800),
              icao24: (seed.toString(16).padStart(6, '0')).slice(0, 6),
              categoryCode: 3, // "Large" per the ADS-B emitter category scale
              onGround: false,
              source: 'opensky',
              observedAt: now.toISOString(),
            }
          : null,
      providerName: this.displayName,
      fetchedAt: now.toISOString(),
    };
  }
}
