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

export function createPendingFlight(rawInput: string, flightDate: string, farOutDeferred = false): TrackedFlight {
  const normalized = normalizeFlightInput(rawInput);
  const id = canonicalFlightId(normalized, flightDate);
  const displayInput = normalized.icaoFlightNumber ?? normalized.iataFlightNumber ?? normalized.raw;

  return {
    id,
    input: displayInput,
    flightDate,
    data: null,
    lastError: null,
    // Far-out-deferred flights skip the immediate lookup entirely (see useFlights' addFlight), so there's nothing loading yet.
    isLoading: !farOutDeferred,
    lastRefreshedAt: null,
    lastAttemptedAt: null,
    addedAt: new Date().toISOString(),
    farOutDeferred,
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

/** Calendar-day difference between a yyyy-mm-dd flight date and `today` (local time), ignoring time-of-day. */
function daysUntilFlightDate(flightDate: string, today: Date): number {
  const [y, m, d] = flightDate.split('-').map(Number);
  const flightMidnight = new Date(y, m - 1, d).getTime();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((flightMidnight - todayMidnight) / 86_400_000);
}

/** Free-tier flight-data plans typically only return results for today and tomorrow — 2+ calendar days out needs the paid-access confirmation flow (see useFlights' addFlight/confirmFarOutAccess). */
export function isFarOutFlightDate(flightDate: string, today: Date = new Date()): boolean {
  return daysUntilFlightDate(flightDate, today) >= 2;
}

/** 23:59:59.999 local time on the given yyyy-mm-dd date — a stand-in "departure instant" for far-out-deferred flights before any real schedule data exists (all that's known pre-lookup is the calendar date the user picked, not a time). */
export function endOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

const FAR_TIER_THRESHOLD_MINUTES = 24 * 60;
const FAR_TIER_INTERVAL_MINUTES = 4 * 60;
const MID_TIER_THRESHOLD_MINUTES = 12 * 60;
const MID_TIER_INTERVAL_MINUTES = 60;

/** Far-out-deferred flights (TrackedFlight.farOutDeferred) get two extra, more extreme brackets on top of the normal three, since the free tier can't return anything at all this far out. */
const DEFERRED_DORMANT_THRESHOLD_MINUTES = 36 * 60;
const DEFERRED_BRIDGE_THRESHOLD_MINUTES = 30 * 60;
const DEFERRED_BRIDGE_INTERVAL_MINUTES = 6 * 60;

interface RefreshTier {
  intervalMinutes: number;
  /** True while a far-out-deferred flight is still more than 36h from its (possibly assumed) departure — no automatic checks at all, overriding the usual "never checked yet, so check now" default. */
  dormant: boolean;
}

/**
 * How many minutes should elapse between automatic refreshes of this
 * flight, and whether it's currently dormant (no checks at all). Gates/
 * terminals essentially never change more than a day out, so far-out
 * flights are checked far less often than the user's own base interval —
 * that base interval still applies once a flight is within 12h of
 * departure (or already departed/landed/etc., where minutes-to-departure
 * goes negative), which is when gate/status changes actually happen.
 *
 * Far-out-deferred flights (added 2+ days out by a user without paid API
 * access) get two extra brackets first: dormant beyond 36h out (an
 * immediate lookup would just fail against a free-tier plan, so don't
 * bother), then a single 6-hour-spaced check between 36h and 30h out,
 * before handing off to the same three brackets everything else uses.
 */
function computeRefreshTier(flight: TrackedFlight, baseIntervalMinutes: number, now: Date): RefreshTier {
  const realDeparture = flight.data
    ? (parseIso(flight.data.departure.estimated) ?? parseIso(flight.data.departure.scheduled))
    : null;

  if (!flight.farOutDeferred) {
    const minsToDeparture = minutesUntil(realDeparture, now);
    if (minsToDeparture === null) return { intervalMinutes: baseIntervalMinutes, dormant: false };
    if (minsToDeparture > FAR_TIER_THRESHOLD_MINUTES) return { intervalMinutes: FAR_TIER_INTERVAL_MINUTES, dormant: false };
    if (minsToDeparture > MID_TIER_THRESHOLD_MINUTES) return { intervalMinutes: MID_TIER_INTERVAL_MINUTES, dormant: false };
    return { intervalMinutes: baseIntervalMinutes, dormant: false };
  }

  // Far-out-deferred: use the real scheduled/estimated time once a lookup has succeeded, otherwise the assumed end-of-day instant.
  const referenceDeparture = realDeparture ?? endOfLocalDay(flight.flightDate);
  const minsToReference = minutesBetween(now, referenceDeparture);
  if (minsToReference > DEFERRED_DORMANT_THRESHOLD_MINUTES) return { intervalMinutes: Infinity, dormant: true };
  if (minsToReference > DEFERRED_BRIDGE_THRESHOLD_MINUTES) return { intervalMinutes: DEFERRED_BRIDGE_INTERVAL_MINUTES, dormant: false };
  if (minsToReference > FAR_TIER_THRESHOLD_MINUTES) return { intervalMinutes: FAR_TIER_INTERVAL_MINUTES, dormant: false };
  if (minsToReference > MID_TIER_THRESHOLD_MINUTES) return { intervalMinutes: MID_TIER_INTERVAL_MINUTES, dormant: false };
  return { intervalMinutes: baseIntervalMinutes, dormant: false };
}

/** Whether enough time has passed since this flight's last lookup *attempt*, per its own tiered interval (see `computeRefreshTier`). Used only to throttle the *automatic* refresh tick — manual refreshes always run immediately. Keyed off the last attempt rather than the last success so a repeatedly-failing lookup (e.g. a far-out flight still too early for the free tier) doesn't retry on every single tick. */
export function isDueForAutoRefresh(
  flight: TrackedFlight,
  baseIntervalMinutes: number,
  now: Date = new Date(),
): boolean {
  const tier = computeRefreshTier(flight, baseIntervalMinutes, now);
  if (tier.dormant) return false;
  const lastAttempted = parseIso(flight.lastAttemptedAt);
  if (!lastAttempted) return true;
  return minutesBetween(lastAttempted, now) >= tier.intervalMinutes;
}
