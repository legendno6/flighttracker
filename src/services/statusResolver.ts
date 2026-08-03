import type { FlightLookupResult, FlightStatus, StatusCategory } from '../types/flight';
import { minutesUntil, parseIso } from '../utils/dateTimeUtils';

const DELAY_THRESHOLD_MINUTES = 15;
const BOARDING_WINDOW_MINUTES = 10;
const GATE_OPEN_WINDOW_MINUTES = 30;
const DESCENDING_WINDOW_MINUTES = 20;
/** No real commercial flight is still airborne this long past its estimated arrival — past this, assume landed rather than trusting a provider status field that just hasn't caught up. */
const OVERDUE_LANDED_MINUTES = 60;
/**
 * How far before this leg's own scheduled/estimated departure a live ADS-B
 * match is still trusted as evidence of *this* leg being airborne. Some
 * flight numbers cover more than one same-day leg under one designator
 * (e.g. an out-and-back turn), and OpenSky can only match by callsign — if
 * the same callsign covers the whole day's rotation, a live match found
 * while this leg's own departure is still hours away almost certainly
 * belongs to a *different* leg of that rotation, not this one.
 */
const LIVE_TRUST_WINDOW_MINUTES = 60;

/** Whether a live ADS-B match would currently be trusted as evidence this leg is airborne (see `LIVE_TRUST_WINDOW_MINUTES`) — exposed so callers deciding whether to *fetch* a live-position match (ProviderManager's OpenSky enrichment) can skip a request that would just be discarded as implausible anyway. */
export function isDepartureImminentOrPast(
  result: Pick<FlightLookupResult, 'departure'>,
  now: Date = new Date(),
): boolean {
  const depScheduled = parseIso(result.departure.scheduled);
  const depEstimated = parseIso(result.departure.estimated) ?? depScheduled;
  const mins = minutesUntil(depEstimated, now);
  return mins === null || mins <= LIVE_TRUST_WINDOW_MINUTES;
}

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
  const minsToArrival = minutesUntil(arrEstimated, now);

  // Well past the estimated arrival with no live position actively
  // contradicting it (a real landed aircraft usually stops transmitting
  // ADS-B position, so `live` being absent here is itself a signal, not
  // just missing data) — checked unconditionally, before the isAirborne
  // branch below, because a provider fallback (e.g. AviationStack's free
  // tier once FlightAware's cost limit kicks in) can leave flight_status
  // stuck on plain "scheduled" for a flight that has actually already
  // landed. That raw value fails every isAirborne condition (no depActual,
  // not "In Flight"/"Taxiing", no live), so it used to fall straight through
  // to the "Delayed" bucket with no overdue-arrival check to catch it —
  // confirmed as the cause of a flight staying stuck at a non-terminal
  // status forever after genuinely landing, which kept isActivelyRefreshable
  // (flightService.ts) treating it as still needing automatic refreshes and
  // silently burning API calls on an already-completed flight.
  if (minsToArrival !== null && minsToArrival <= -OVERDUE_LANDED_MINUTES && !live) {
    return 'Landed';
  }

  // Providers often lag on populating `actual` departure time (especially
  // AviationStack's free tier) and can leave the coarse status field on
  // "scheduled" long after real-world departure — a live ADS-B position (any
  // position, not just airborne ones — the on-ground sub-case is handled
  // just below) is direct evidence the aircraft is already in its active
  // flight phase, and is trusted over a stale timestamp/status guess... but
  // only when this leg's own departure is at least imminent. Without that
  // guard, a live match found while departure is still hours away (a
  // same-day multi-leg flight number, where the callsign is airborne on a
  // *different* leg of the day's rotation) gets wrongly attributed here.
  const isAirborne =
    !!depActual ||
    result.status === 'In Flight' ||
    result.status === 'Taxiing' ||
    (live != null && isDepartureImminentOrPast(result, now));

  if (isAirborne) {
    // Already left the gate — somewhere in the air (or briefly on the
    // ground pre-takeoff). A live, currently-reported on-ground reading is
    // trusted immediately regardless of how overdue arrival looks — unlike
    // a raw status field, live position data doesn't get "stuck" the same way.
    if (live?.onGround) return 'Taxiing';

    // A provider that already distinguishes taxiing in its own raw status
    // (FlightAware does; AviationStack's free tier only has one coarse
    // "active" bucket for the whole airborne+taxiing period) is trusted
    // here too, once the overdue-landed guard above has had its say.
    if (result.status === 'Taxiing') return 'Taxiing';

    if (minsToArrival !== null && minsToArrival <= DESCENDING_WINDOW_MINUTES && minsToArrival > -OVERDUE_LANDED_MINUTES) {
      return 'Descending';
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
