/** Parses an ISO 8601 timestamp, returning null instead of throwing/NaN on bad input. */
export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}

export function minutesUntil(target: Date | null, now: Date = new Date()): number | null {
  if (!target) return null;
  return minutesBetween(now, target);
}

/** Formats a duration in minutes as "1 hr 42 min" (or "42 min" under an hour). */
export function formatDurationMinutes(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/** Formats a duration as "1:21" (h:mm), used for compact card display. */
export function formatDurationCompact(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Renders a text progress bar like "██████████░░░░░░░░". */
export function renderTextProgressBar(percent: number, width = 20): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Formats a time-of-day in a given IANA timezone, e.g. "7:18 PM" (or "7:18 PM EDT" with `includeZoneName`). */
export function formatTimeInZone(iso: string | null, timeZone: string | null, includeZoneName = false): string | null {
  const date = parseIso(iso);
  if (!date) return null;
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(includeZoneName ? { timeZoneName: 'short' as const } : {}),
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...baseOptions, timeZone: timeZone ?? undefined }).format(date);
  } catch {
    // Invalid/unknown IANA zone name — fall back to local time rather than throwing.
    return new Intl.DateTimeFormat('en-US', baseOptions).format(date);
  }
}

/** Resolves the effective timezone to display: the setting, or the airport's own zone when set to 'airport-local'. */
export function resolveDisplayTimezone(setting: string, airportTimezone: string | null): string | null {
  if (setting === 'airport-local') return airportTimezone;
  if (setting === 'device') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return airportTimezone;
    }
  }
  return setting;
}

/** Formats a full date+time in a given timezone, e.g. "Jul 21, 7:18 PM EDT". */
export function formatDateTimeInZone(iso: string | null, timeZone: string | null): string | null {
  const date = parseIso(iso);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      timeZone: timeZone ?? undefined,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Formats how long ago a timestamp was, e.g. "12s ago" / "3m ago". */
export function formatTimeAgo(iso: string | null, now: Date = new Date()): string | null {
  const date = parseIso(iso);
  if (!date) return null;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/** How far `date` (an actual instant) sits from UTC in the given zone, in minutes — negative for zones behind UTC (e.g. -300 for EST). Uses the JS engine's own IANA data via Intl, so DST is handled automatically. */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/**
 * AviationStack's scheduled/estimated/actual timestamps are the airport's
 * own local wall-clock time, but mislabeled with a literal "+00:00" suffix
 * as if they were true UTC (a known data-quality quirk, confirmed directly:
 * a flight with a real 12:56 PM local departure came back as
 * "...T12:56:00+00:00" — the digits are already correct local time, not
 * UTC). Re-encodes those wall-clock digits as a properly UTC-anchored ISO
 * string for the given IANA zone, so the rest of the app's timezone
 * handling — which assumes correctly-anchored timestamps, including the
 * timezone-override display setting — works correctly downstream.
 */
export function reinterpretAsLocalWallClock(iso: string | null, timeZone: string | null): string | null {
  if (!iso || !timeZone) return iso;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, mo, d, h, mi, s] = match;
  const guessUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  try {
    const offsetMinutes = zoneOffsetMinutes(new Date(guessUtcMs), timeZone);
    return new Date(guessUtcMs - offsetMinutes * 60_000).toISOString();
  } catch {
    // Unknown/invalid IANA zone name — fall back to the original value untouched.
    return iso;
  }
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
