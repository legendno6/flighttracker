import type { FlightLookupResult } from '../types/flight';
import { minutesBetween, parseIso } from '../utils/dateTimeUtils';

export interface FlightProgress {
  elapsedMinutes: number;
  remainingMinutes: number;
  totalMinutes: number;
  percent: number; // 0-100
}

/**
 * Computes in-flight progress purely from scheduling timestamps, so it works
 * even without live position data, and can tick forward client-side every
 * minute without another network request.
 */
export function calculateFlightProgress(
  result: Pick<FlightLookupResult, 'departure' | 'arrival'>,
  now: Date = new Date(),
): FlightProgress | null {
  // Prefer the actual departure time, but fall back to estimated/scheduled
  // when it's missing — providers (AviationStack's free tier especially)
  // often lag on populating `actual`, and the caller only invokes this once
  // the flight's status already indicates it's genuinely airborne, so this
  // fallback doesn't leak into still-scheduled flights.
  const depMoment =
    parseIso(result.departure.actual) ?? parseIso(result.departure.estimated) ?? parseIso(result.departure.scheduled);
  const arrEstimated =
    parseIso(result.arrival.estimated) ?? parseIso(result.arrival.scheduled) ?? parseIso(result.arrival.actual);

  if (!depMoment || !arrEstimated) return null;

  const totalMinutes = minutesBetween(depMoment, arrEstimated);
  if (totalMinutes <= 0) return null;

  const elapsedMinutes = Math.min(totalMinutes, Math.max(0, minutesBetween(depMoment, now)));
  const remainingMinutes = Math.max(0, totalMinutes - elapsedMinutes);
  const percent = Math.min(100, Math.max(0, Math.round((elapsedMinutes / totalMinutes) * 100)));

  return { elapsedMinutes, remainingMinutes, totalMinutes, percent };
}
