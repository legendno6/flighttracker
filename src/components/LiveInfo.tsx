import type { LivePosition } from '../types/flight';
import { degreesToCompass, describeAircraftCategory, formatVerticalRate } from '../utils/flightPositionUtils';
import { formatTimeAgo } from '../utils/dateTimeUtils';

interface LiveInfoProps {
  live: LivePosition;
}

/** Renders OpenSky's live-position fields on a flight card. Shown regardless of which provider supplied the rest of the flight data — this only depends on `live` being present. */
export function LiveInfo({ live }: LiveInfoProps) {
  const mapUrl = `https://www.google.com/maps?q=${live.latitude},${live.longitude}`;
  const verticalRate = formatVerticalRate(live.verticalRateFtMin);
  const category = describeAircraftCategory(live.categoryCode);
  const ago = formatTimeAgo(live.observedAt);

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <LiveField label="Altitude" value={live.altitudeFt != null ? `${live.altitudeFt.toLocaleString()} ft` : null} />
        <LiveField label="Speed" value={live.groundSpeedKt != null ? `${live.groundSpeedKt} kt` : null} />
        <LiveField
          label="Heading"
          value={live.headingDeg != null ? `${String(Math.round(live.headingDeg)).padStart(3, '0')}° (${degreesToCompass(live.headingDeg)})` : null}
        />
        <LiveField label="Vertical" value={verticalRate} />
        <LiveField label="ICAO24" value={live.icao24} />
        <LiveField label="Category" value={category} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          View on map
        </a>
        {ago && <span>Live position {ago}</span>}
      </div>
    </div>
  );
}

function LiveField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
