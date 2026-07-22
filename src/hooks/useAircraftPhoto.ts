import { useEffect, useRef, useState } from 'react';
import { loadAircraftPhotoCache, saveAircraftPhotoCache, type CachedAircraftPhoto } from '../storage/localStorage';

export interface AircraftPhoto {
  photoUrl: string;
  thumbnailUrl: string | null;
  /** Photographer name, for required attribution. */
  credit: string | null;
  /** planespotters.net permalink for the photo. */
  creditLink: string | null;
}

interface PlanespottersPhoto {
  thumbnail?: { src?: string };
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

interface PlanespottersResponse {
  photos?: PlanespottersPhoto[];
}

function toAircraftPhoto(cached: CachedAircraftPhoto): AircraftPhoto | null {
  if (!cached.photoUrl) return null;
  return {
    photoUrl: cached.photoUrl,
    thumbnailUrl: cached.thumbnailUrl,
    credit: cached.credit,
    creditLink: cached.creditLink,
  };
}

/**
 * Fetches a real photo of the tracked aircraft by ICAO24 hex, sourced from
 * planespotters.net via this app's own proxy (`/api/aircraftPhoto` — see
 * `server/aircraftPhotoCore.ts`). Deliberately independent of
 * `ProviderManager`: a photo is static airframe metadata, not flight data,
 * so it shouldn't compete with the session-request-governor budget or the
 * 60s flight-lookup cache — it's cached indefinitely in localStorage instead
 * (a plane's photo doesn't change), keyed by icao24 alone rather than by
 * flight/date.
 */
export function useAircraftPhoto(icao24: string | null): { photo: AircraftPhoto | null; isLoading: boolean } {
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestIcao24 = useRef<string | null>(null);

  useEffect(() => {
    latestIcao24.current = icao24;

    if (!icao24) {
      setPhoto(null);
      setIsLoading(false);
      return;
    }

    const cached = loadAircraftPhotoCache()[icao24];
    if (cached) {
      setPhoto(toAircraftPhoto(cached));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPhoto(null);

    (async () => {
      let result: CachedAircraftPhoto;
      try {
        const response = await fetch(`/api/aircraftPhoto?icao24=${encodeURIComponent(icao24)}`);
        const body: PlanespottersResponse = await response.json();
        const first = body.photos?.[0];
        result = {
          photoUrl: first?.thumbnail_large?.src ?? first?.thumbnail?.src ?? null,
          thumbnailUrl: first?.thumbnail?.src ?? null,
          credit: first?.photographer ?? null,
          creditLink: first?.link ?? null,
          cachedAt: new Date().toISOString(),
        };
      } catch {
        // Network failure — don't cache a negative result, so a later render can retry.
        if (latestIcao24.current === icao24) setIsLoading(false);
        return;
      }

      const cache = loadAircraftPhotoCache();
      cache[icao24] = result;
      saveAircraftPhotoCache(cache);

      if (latestIcao24.current !== icao24) return; // a newer icao24 has since superseded this request
      setPhoto(toAircraftPhoto(result));
      setIsLoading(false);
    })();
  }, [icao24]);

  return { photo, isLoading };
}
