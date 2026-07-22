import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { TrackedFlight } from '../types/flight';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { LiveInfo } from './LiveInfo';
import { AircraftPhoto } from './AircraftPhoto';
import { GripIcon } from './icons/GripIcon';
import { calculateFlightProgress } from '../services/progressCalculator';
import { formatDurationCompact, formatDurationMinutes, formatTimeInZone, resolveDisplayTimezone } from '../utils/dateTimeUtils';
import { statusCategory } from '../services/statusResolver';
import { cn } from '../utils/classNames';
import { useClockTick } from '../hooks/useClockTick';
import { useSettings } from '../contexts/SettingsContext';

interface FlightCardProps {
  flight: TrackedFlight;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  isDuplicateFlash?: boolean;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
}

export function FlightCard({ flight, onRefresh, onRemove, isDuplicateFlash, dragHandleProps }: FlightCardProps) {
  // Re-render every minute so elapsed/remaining/percent tick forward without a network call.
  useClockTick();
  const { settings } = useSettings();
  const tzOverrideActive = settings.displayTimezone !== 'airport-local';

  const { data, lastError, isLoading } = flight;
  const category = data ? statusCategory(data.status) : 'scheduled';
  const progress = data && category === 'inflight' ? calculateFlightProgress(data) : null;
  const flightAwareIdent = data?.flightIcao ?? data?.flightIata ?? null;
  const flightAwareUrl = flightAwareIdent ? `https://www.flightaware.com/live/flight/${flightAwareIdent}` : null;

  const borderColor: Record<string, string> = {
    ontime: 'border-l-emerald-500',
    delayed: 'border-l-amber-500',
    inflight: 'border-l-blue-500',
    scheduled: 'border-l-slate-400',
    cancelled: 'border-l-red-500',
  };

  return (
    <article
      className={cn(
        'rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5',
        borderColor[category],
        isDuplicateFlash && 'ring-2 ring-blue-500 animate-pulse-slow',
      )}
      aria-label={`Flight ${flight.input} on ${flight.flightDate}`}
    >
      <header className="flex items-start gap-1">
        {dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            aria-label={`Drag to reorder flight ${flight.input}`}
            className="-ml-1 flex min-h-[44px] min-w-[32px] shrink-0 cursor-grab items-center justify-center text-slate-300 active:cursor-grabbing dark:text-slate-600"
          >
            <GripIcon />
          </button>
        )}
        <div>
          {flightAwareUrl ? (
            <a
              href={flightAwareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-block"
              aria-label={`View ${data?.airline ?? flight.input} ${data?.flightNumber ?? ''} on FlightAware`}
            >
              <h3 className="text-lg font-bold group-hover:underline">
                {data?.airline ?? flight.input} {data?.flightNumber ?? ''}
              </h3>
            </a>
          ) : (
            <h3 className="text-lg font-bold">
              {data?.airline ?? flight.input} {data?.flightNumber ?? ''}
            </h3>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {flight.input} &middot; {flight.flightDate}
            {data?.aircraftType ? ` · ${data.aircraftType}` : ''}
          </p>
          {/* Always on its own line below the airline info — a shared flex row with
              the header text wrapped inconsistently depending on airline-name length. */}
          {data && (
            <div className="mt-1.5">
              <StatusBadge status={data.status} />
            </div>
          )}
        </div>
      </header>

      {isLoading && (
        <p className="mt-4 animate-pulse text-sm text-slate-500 dark:text-slate-400">Looking up flight&hellip;</p>
      )}

      {!isLoading && lastError && (
        <div
          role="alert"
          className="mt-4 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {lastError}
        </div>
      )}

      {!isLoading && data && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between text-center">
            <RouteEndpoint label="Departure" info={data.departure} displayTimezone={settings.displayTimezone} />
            <span className="mx-2 shrink-0 text-slate-400" aria-hidden="true">
              &rarr;
            </span>
            <RouteEndpoint label="Arrival" info={data.arrival} displayTimezone={settings.displayTimezone} align="right" />
          </div>

          {progress && (
            <div>
              <ProgressBar percent={progress.percent} label={`${formatDurationCompact(progress.elapsedMinutes)} elapsed`} />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatDurationMinutes(progress.remainingMinutes)} remaining
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Field label="Gate" value={data.departure.gate} />
            <Field label="Terminal" value={data.departure.terminal} />
            <Field label="Arr. Gate" value={data.arrival.gate} />
            <Field label="Baggage" value={data.arrival.baggageClaim} />
          </div>

          {data.live && category === 'inflight' && <AircraftPhoto icao24={data.live.icao24} />}

          {data.live && category === 'inflight' && <LiveInfo live={data.live} />}

          {(data.departure.adsbConfirmed || data.arrival.adsbConfirmed) && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              ADS-B confirmed:
              {data.departure.adsbConfirmed &&
                ` departed ${formatTimeInZone(data.departure.adsbConfirmed, resolveDisplayTimezone(settings.displayTimezone, data.departure.timezone), tzOverrideActive)}`}
              {data.departure.adsbConfirmed && data.arrival.adsbConfirmed && ' ·'}
              {data.arrival.adsbConfirmed &&
                ` arrived ${formatTimeInZone(data.arrival.adsbConfirmed, resolveDisplayTimezone(settings.displayTimezone, data.arrival.timezone), tzOverrideActive)}`}
            </p>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Source: {data.providerName}
            {flight.lastRefreshedAt &&
              ` · Updated ${formatTimeInZone(flight.lastRefreshedAt, resolveDisplayTimezone(settings.displayTimezone, null), tzOverrideActive)}`}
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {data?.status !== 'Landed' && (
          <button
            type="button"
            onClick={() => onRefresh(flight.id)}
            disabled={isLoading}
            className="min-h-[44px] flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Refresh
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(flight.id)}
          className="min-h-[44px] flex-1 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function RouteEndpoint({
  label,
  info,
  displayTimezone,
  align = 'left',
}: {
  label: string;
  info: { code: string | null; city: string | null; scheduled: string | null; estimated: string | null; actual: string | null; timezone: string | null };
  displayTimezone: string;
  align?: 'left' | 'right';
}) {
  const time = info.actual ?? info.estimated ?? info.scheduled;
  const effectiveZone = resolveDisplayTimezone(displayTimezone, info.timezone);
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <p className="text-2xl font-bold">{info.code ?? '–'}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{info.city ?? label}</p>
      <p className="text-sm font-medium">
        {formatTimeInZone(time, effectiveZone, displayTimezone !== 'airport-local') ?? '–'}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
