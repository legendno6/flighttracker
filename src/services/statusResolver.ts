import type { FlightLookupResult, FlightStatus, StatusCategory } from '../types/flight';
import { minutesUntil, parseIso } from '../utils/dateTimeUtils';

const DELAY_THRESHOLD_MINUTES = 15;
const BOARDING_WINDOW_MINUTES = 10;
const GATE_OPEN_WINDOW_MINUTES = 30;
const DESCENDING_WINDOW_MINUTES = 20;
/** No real commercial flight is still airborne this long past its estimated arrival — past this, assume landed rather than trusting a provider status field that just hasn't caught up. */
const OVERDUE_LANDED_MINUTES = 60;

/**
 * Providers only give coarse states (scheduled/active/landed/cancelled/...).
 * This derives the richer, display-friendly status the dashboard wants
 * (Boarding, Gate Open, Taxiing, Descending, ...) from timestamps and any
 * live position data, applied the same way regardless of which provider
 * produced the raw result.
 */
export function resolveDisplayStatus(
  result: Pick<FlightLookupResult, 'status' | 'departure' | 'arrival' | 'live'>,
  now: Date = new Date(),
): FlightStatus {
  // Terminal states pass through unchanged.
  if (result.status === 'Cancelled') return 'Cancelled';
  if (result.status === 'Diverted') return 'Diverted';
  if (result.status === 'Landed') return 'Landed';

  const { departure, arrival, live } = result;
  const depScheduled = parseIso(departure.scheduled);
  const depEstimated = parseIso(departure.estimated) ?? depScheduled;
  const depActual = parseIso(departure.actual);
  const arrEstimated = parseIso(arrival.estimated) ?? parseIso(arrival.scheduled);

  // Providers often lag on populating `actual` departure time (especially
  // AviationStack's free tier) and can leave the coarse status field on
  // "scheduled" long after real-world departure — a live ADS-B position (any
  // position, not just airborne ones — the on-ground sub-case is handled
  // just below) is direct evidence the aircraft is already in its active
  // flight phase, and is trusted over a stale timestamp/status guess.
  const isAirborne = !!depActual || result.status === 'In Flight' || live != null;

  if (isAirborne) {
    // Already left the gate — somewhere in the air (or briefly on the ground pre-takeoff).
    if (live?.onGround) return 'Taxiing';

    const minsToArrival = minutesUntil(arrEstimated, now);
    if (minsToArrival !== null && minsToArrival <= DESCENDING_WINDOW_MINUTES && minsToArrival > -OVERDUE_LANDED_MINUTES) {
      return 'Descending';
    }
    // Well past the estimated arrival with no live position actively
    // contradicting it (a real landed aircraft usually stops transmitting
    // ADS-B position, so `live` being absent here is itself a signal, not
    // just missing data) — the provider's own status field just hasn't
    // updated yet, so don't keep showing "In Flight" / 0 min remaining forever.
    if (minsToArrival !== null && minsToArrival <= -OVERDUE_LANDED_MINUTES && !live) {
      return 'Landed';
    }
    return 'In Flight';
  }

  const depDelayMinutes =
    depEstimated && depScheduled ? (depEstimated.getTime() - depScheduled.getTime()) / 60_000 : 0;
  const isDelayed = depDelayMinutes >= DELAY_THRESHOLD_MINUTES;
  if (isDelayed) return 'Delayed';

  const minsToDeparture = minutesUntil(depEstimated, now);
  if (minsToDeparture === null) return 'Unknown';
  if (minsToDeparture <= 0) return 'Delayed'; // past scheduled time, no actual departure or "active" signal yet
  if (minsToDeparture <= BOARDING_WINDOW_MINUTES) return 'Boarding';
  if (minsToDeparture <= GATE_OPEN_WINDOW_MINUTES) return 'Gate Open';
  return 'Scheduled';
}

const STATUS_CATEGORY: Record<FlightStatus, StatusCategory> = {
  Scheduled: 'scheduled',
  Boarding: 'scheduled',
  'Gate Open': 'scheduled',
  Delayed: 'delayed',
  Taxiing: 'inflight',
  Departed: 'inflight',
  'In Flight': 'inflight',
  Descending: 'inflight',
  Landed: 'ontime',
  Cancelled: 'cancelled',
  Diverted: 'cancelled',
  Unknown: 'scheduled',
};

export function statusCategory(status: FlightStatus): StatusCategory {
  return STATUS_CATEGORY[status];
}

/** Sort priority per the dashboard spec: boarding > in flight > delayed > scheduled > landed > cancelled. */
const SORT_PRIORITY: Record<FlightStatus, number> = {
  Boarding: 0,
  'Gate Open': 1,
  Taxiing: 2,
  Departed: 3,
  'In Flight': 4,
  Descending: 4,
  Delayed: 5,
  Scheduled: 6,
  Unknown: 7,
  Landed: 8,
  Cancelled: 9,
  Diverted: 9,
};

export function statusSortPriority(status: FlightStatus): number {
  return SORT_PRIORITY[status];
}
