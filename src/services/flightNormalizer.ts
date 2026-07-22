import { findAirlineByIata, findAirlineByIcao } from '../data/airlineCodes';
import type { NormalizedFlightNumber } from '../types/flight';

// ICAO codes are always 3 letters. IATA codes are 2 characters but several
// major carriers use an alphanumeric one (B6 JetBlue, F9 Frontier, G4
// Allegiant, U2 easyJet, 9E Endeavor, ...), so the 2-char branch accepts
// digits too — a later check rejects an all-digit "prefix" as ambiguous.
const FLIGHT_INPUT_PATTERN = /^([A-Za-z]{3}|[A-Za-z0-9]{2})\s*(\d{1,4}[A-Za-z]?)$/;

export class InvalidFlightInputError extends Error {
  constructor(input: string) {
    super(
      `"${input}" doesn't look like a flight number. Try formats like "DAL5111", "AA 123", or "UAL1234".`,
    );
    this.name = 'InvalidFlightInputError';
  }
}

/**
 * Parses free-form user input like "DAL 5111" or "aa123" into a normalized
 * flight identifier, resolving both IATA and ICAO airline codes where known.
 */
export function normalizeFlightInput(rawInput: string): NormalizedFlightNumber {
  const trimmed = rawInput.trim();
  const match = FLIGHT_INPUT_PATTERN.exec(trimmed);

  if (!match) {
    throw new InvalidFlightInputError(rawInput);
  }

  const [, prefixRaw, number] = match;
  const prefix = prefixRaw.toUpperCase();
  const normalizedNumber = number.toUpperCase();

  if (prefix.length === 2 && /^\d{2}$/.test(prefix)) {
    // Two bare digits isn't a real airline code — it's an ambiguous split of the number itself.
    throw new InvalidFlightInputError(rawInput);
  }

  let iataCode: string | null = null;
  let icaoCode: string | null = null;
  let airlineName: string | null = null;

  if (prefix.length === 2) {
    const airline = findAirlineByIata(prefix);
    iataCode = prefix;
    icaoCode = airline?.icao ?? null;
    airlineName = airline?.name ?? null;
  } else {
    const airline = findAirlineByIcao(prefix);
    icaoCode = prefix;
    iataCode = airline?.iata ?? null;
    airlineName = airline?.name ?? null;
  }

  return {
    raw: trimmed,
    iataCode,
    icaoCode,
    airlineName,
    number: normalizedNumber,
    iataFlightNumber: iataCode ? `${iataCode}${normalizedNumber}` : null,
    icaoFlightNumber: icaoCode ? `${icaoCode}${normalizedNumber}` : null,
  };
}

/** Canonical display identifier, preferring ICAO since that's what most trackers key on. */
export function canonicalFlightId(normalized: NormalizedFlightNumber, flightDate: string): string {
  const ident = normalized.icaoFlightNumber ?? normalized.iataFlightNumber ?? normalized.raw.replace(/\s+/g, '').toUpperCase();
  return `${ident}-${flightDate}`;
}
