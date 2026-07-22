import {
  AllProvidersFailedError,
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '../providers/FlightProvider';
import type { FlightLookupResult, TrackedFlight } from '../types/flight';
import { canonicalFlightId, normalizeFlightInput } from './flightNormalizer';
import { resolveDisplayStatus, statusSortPriority } from './statusResolver';
import { parseIso } from '../utils/dateTimeUtils';

export function createPendingFlight(rawInput: string, flightDate: string): TrackedFlight {
  const normalized = normalizeFlightInput(rawInput);
  const id = canonicalFlightId(normalized, flightDate);
  const displayInput = normalized.icaoFlightNumber ?? normalized.iataFlightNumber ?? normalized.raw;

  return {
    id,
    input: displayInput,
    flightDate,
    data: null,
    lastError: null,
    isLoading: true,
    lastRefreshedAt: null,
    addedAt: new Date().toISOString(),
  };
}

export function findExistingFlight(flights: TrackedFlight[], rawInput: string, flightDate: string): TrackedFlight | undefined {
  try {
    const normalized = normalizeFlightInput(rawInput);
    const id = canonicalFlightId(normalized, flightDate);
    return flights.find((f) => f.id === id);
  } catch {
    return undefined;
  }
}

/** Applies the shared status-resolution heuristic to a raw provider result. */
export function finalizeLookupResult(result: FlightLookupResult): FlightLookupResult {
  return { ...result, status: resolveDisplayStatus(result) };
}

/** Converts thrown provider errors into a short, user-facing message. */
export function describeProviderError(err: unknown): string {
  if (err instanceof AllProvidersFailedError) {
    if (err.attempts.length === 0) return 'No provider was available to try.';
    const allNotFound = err.attempts.every((a) => a.message === 'no matching flight');
    const header = allNotFound
      ? 'No flight found for that number and date across every configured provider:'
      : 'Could not look up this flight:';
    return [header, ...err.attempts.map((a) => `• ${a.providerName}: ${a.message}`)].join('\n');
  }
  if (err instanceof FlightNotFoundError) {
    return 'No flight found for that number and date. Double-check the flight number, or try again closer to departure.';
  }
  if (err instanceof ProviderRateLimitError) {
    return err.message;
  }
  if (err instanceof ProviderUnavailableError) {
    return err.message;
  }
  if (err instanceof ProviderNetworkError) {
    return `${err.message} Check your connection and try refreshing again.`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Something went wrong looking up this flight.';
}

/** Dashboard sort order: boarding > in flight > delayed > scheduled > landed > cancelled. */
export function sortTrackedFlights(flights: TrackedFlight[]): TrackedFlight[] {
  return [...flights].sort((a, b) => {
    const aPriority = a.data ? statusSortPriority(a.data.status) : 6;
    const bPriority = b.data ? statusSortPriority(b.data.status) : 6;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aTime = parseIso(a.data?.departure.scheduled)?.getTime() ?? 0;
    const bTime = parseIso(b.data?.departure.scheduled)?.getTime() ?? 0;
    return aTime - bTime;
  });
}

/** Manual drag order: flights not yet in `order` (just added) sort to the end, stably. */
export function applyManualOrder(flights: TrackedFlight[], order: string[]): TrackedFlight[] {
  const indexOf = new Map(order.map((id, i) => [id, i]));
  return [...flights].sort((a, b) => {
    const aIndex = indexOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = indexOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

/** Landed and cancelled flights never need another lookup — nothing about them changes anymore. */
export function isActivelyRefreshable(flight: TrackedFlight): boolean {
  if (!flight.data) return true;
  return flight.data.status !== 'Cancelled' && flight.data.status !== 'Landed';
}
