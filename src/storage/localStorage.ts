import { DEFAULT_PROVIDER_ORDER, DEFAULT_SETTINGS, type AppSettings } from '../types/settings';
import type { TrackedFlight } from '../types/flight';

const FLIGHTS_KEY = 'planestatus:flights';
const SETTINGS_KEY = 'planestatus:settings';
const FLIGHT_ORDER_KEY = 'planestatus:flightOrder';
const AIRCRAFT_PHOTO_CACHE_KEY = 'planestatus:aircraftPhotos';

/** A photo is airframe metadata keyed by ICAO24 alone, not tied to any one flight/date — cached indefinitely since a plane's photo doesn't change. `photoUrl: null` records a confirmed "no photo available" result so it isn't re-fetched every render. */
export interface CachedAircraftPhoto {
  photoUrl: string | null;
  thumbnailUrl: string | null;
  credit: string | null;
  creditLink: string | null;
  cachedAt: string; // ISO 8601
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadTrackedFlights(): TrackedFlight[] {
  const flights = safeParse<TrackedFlight[]>(localStorage.getItem(FLIGHTS_KEY), []);
  // Reset transient fields that shouldn't survive a reload.
  return flights.map((f) => ({ ...f, isLoading: false }));
}

export function saveTrackedFlights(flights: TrackedFlight[]): void {
  try {
    localStorage.setItem(FLIGHTS_KEY, JSON.stringify(flights));
  } catch {
    // Storage full/unavailable — tracked flights simply won't persist this session.
  }
}

export function loadSettings(): AppSettings {
  const stored = safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {});
  const storedOrder = stored.providerPreferences?.order ?? [];
  // Any provider id missing from a saved order (e.g. one added after the user's last visit) is appended at the end, enabled by default.
  const mergedOrder = [...storedOrder, ...DEFAULT_PROVIDER_ORDER.filter((id) => !storedOrder.includes(id))];

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    credentials: {
      ...DEFAULT_SETTINGS.credentials,
      ...stored.credentials,
    },
    providerPreferences: {
      order: mergedOrder,
      enabled: {
        ...DEFAULT_SETTINGS.providerPreferences.enabled,
        ...stored.providerPreferences?.enabled,
      },
    },
  };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full/unavailable — settings simply won't persist this session.
  }
}

export function loadAircraftPhotoCache(): Record<string, CachedAircraftPhoto> {
  return safeParse<Record<string, CachedAircraftPhoto>>(localStorage.getItem(AIRCRAFT_PHOTO_CACHE_KEY), {});
}

export function saveAircraftPhotoCache(cache: Record<string, CachedAircraftPhoto>): void {
  try {
    localStorage.setItem(AIRCRAFT_PHOTO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable — photo cache simply won't persist this session.
  }
}

export function loadFlightOrder(): string[] {
  return safeParse<string[]>(localStorage.getItem(FLIGHT_ORDER_KEY), []);
}

export function saveFlightOrder(order: string[]): void {
  try {
    localStorage.setItem(FLIGHT_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full/unavailable — manual order simply won't persist this session.
  }
}
