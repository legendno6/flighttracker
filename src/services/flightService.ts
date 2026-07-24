import {
  AllProvidersFailedError,
  FlightNotFoundError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '../providers/FlightProvider';
import type { FlightLookupResult, FlightStatus, TrackedFlight } from '../types/flight';
import { canonicalFlightId, normalizeFlightInput } from './flightNormalizer';
import { resolveDisplayStatus, statusSortPriority } from './statusResolver';
import { minutesBetween, parseIso, minutesUntil } from '../utils/dateTimeUtils';

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

/** Status transitions worth a notification. Excludes `Departed`/`Descending`/`Unknown` — low-value, high-frequency states for an airborne flight refreshing repeatedly. */
const NOTIFY_ON_STATUSES = new Set<FlightStatus>([
  'Scheduled',
  'Boarding',
  'Gate Open',
  'Delayed',
  'Taxiing',
  'In Flight',
  'Cancelled',
  'Diverted',
  'Landed',
]);

/** Human-readable descriptions of notification-worthy changes between two lookups of the same tracked flight, or [] if nothing qualifies. The very first lookup (`oldData === null`) never notifies — there's nothing to compare against. */
export function diffFlightForNotifications(oldData: FlightLookupResult | null, newData: FlightLookupResult): string[] {
  if (!oldData) return [];

  const changes: string[] = [];
  if (oldData.status !== newData.status && NOTIFY_ON_STATUSES.has(newData.status)) {
    changes.push(`Status changed to ${newData.status}`);
  }
  if (oldData.departure.gate !== newData.departure.gate && newData.departure.gate) {
    changes.push(`Departure gate changed to ${newData.departure.gate}`);
  }
  if (oldData.departure.terminal !== newData.departure.terminal && newData.departure.terminal) {
    changes.push(`Departure terminal changed to ${newData.departure.terminal}`);
  }
  if (oldData.arrival.gate !== newData.arrival.gate && newData.arrival.gate) {
    changes.push(`Arrival gate changed to ${newData.arrival.gate}`);
  }
  if (oldData.arrival.terminal !== newData.arrival.terminal && newData.arrival.terminal) {
    changes.push(`Arrival terminal changed to ${newData.arrival.terminal}`);
  }
  return changes;
}

/** Landed and cancelled flights never need another lookup — nothing about them changes anymore. */
export function isActivelyRefreshable(flight: TrackedFlight): boolean {
  if (!flight.data) return true;
  return flight.data.status !== 'Cancelled' && flight.data.status !== 'Landed';
}

const FAR_TIER_THRESHOLD_MINUTES = 24 * 60;
const FAR_TIER_INTERVAL_MINUTES = 4 * 60;
const MID_TIER_THRESHOLD_MINUTES = 12 * 60;
const MID_TIER_INTERVAL_MINUTES = 60;

/**
 * How many minutes should elapse between automatic refreshes of this flight.
 * Gates/terminals essentially never change more than a day out, so far-out
 * flights are checked far less often than the user's own base interval —
 * that base interval still applies once a flight is within 12h of
 * departure (or already departed/landed/etc., where minutes-to-departure
 * goes negative), which is when gate/status changes actually happen.
 */
export function refreshIntervalForFlight(
  flight: TrackedFlight,
  baseIntervalMinutes: number,
  now: Date = new Date(),
): number {
  const departure = flight.data
    ? (parseIso(flight.data.departure.estimated) ?? parseIso(flight.data.departure.scheduled))
    : null;
  const minsToDeparture = minutesUntil(departure, now);
  if (minsToDeparture === null) return baseIntervalMinutes;
  if (minsToDeparture > FAR_TIER_THRESHOLD_MINUTES) return FAR_TIER_INTERVAL_MINUTES;
  if (minsToDeparture > MID_TIER_THRESHOLD_MINUTES) return MID_TIER_INTERVAL_MINUTES;
  return baseIntervalMinutes;
}

/** Whether enough time has passed since this flight's last lookup, per its own tiered interval (see `refreshIntervalForFlight`). Used only to throttle the *automatic* refresh tick — manual refreshes always run immediately. */
export function isDueForAutoRefresh(
  flight: TrackedFlight,
  baseIntervalMinutes: number,
  now: Date = new Date(),
): boolean {
  const lastRefreshed = parseIso(flight.lastRefreshedAt);
  if (!lastRefreshed) return true;
  const tierIntervalMinutes = refreshIntervalForFlight(flight, baseIntervalMinutes, now);
  return minutesBetween(lastRefreshed, now) >= tierIntervalMinutes;
}
