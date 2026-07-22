import { useAircraftPhoto } from '../hooks/useAircraftPhoto';

interface AircraftPhotoProps {
  icao24: string | null;
}

/** Shows a real photo of the tracked aircraft, sourced from planespotters.net. Renders nothing when there's no ICAO24 yet or no photo is on file. */
export function AircraftPhoto({ icao24 }: AircraftPhotoProps) {
  const { photo, isLoading } = useAircraftPhoto(icao24);

  if (!icao24) return null;

  if (isLoading) {
    return <div className="h-32 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  if (!photo) return null;

  return (
    <div>
      <img
        src={photo.thumbnailUrl ?? photo.photoUrl}
        alt="Photo of the tracked aircraft"
        loading="lazy"
        className="w-full rounded-lg object-cover"
      />
      {photo.credit && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Photo:{' '}
          {photo.creditLink ? (
            <a href={photo.creditLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {photo.credit}
            </a>
          ) : (
            photo.credit
          )}{' '}
          via planespotters.net
        </p>
      )}
    </div>
  );
}
