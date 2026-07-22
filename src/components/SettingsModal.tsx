import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import type { ThemePreference } from '../types/settings';
import type { ProviderManager } from '../providers/ProviderManager';
import { ProviderOrderList } from './ProviderOrderList';
import { estimateSessionDuration } from '../services/requestEstimate';
import { formatDurationMinutes } from '../utils/dateTimeUtils';

// Used only if the browser doesn't support Intl.supportedValuesOf('timeZone').
const FALLBACK_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  providerManager: ProviderManager;
  /** Flights that would actually be hit by an auto-refresh cycle right now, used for the time estimate. */
  activeFlightCount: number;
  /** Shared with the dashboard's own Restart control (App.tsx) so both reflect the reset immediately, rather than each tracking its own disconnected re-render state. */
  onRestartSession: () => void;
}

export function SettingsModal({ open, onClose, providerManager, activeFlightCount, onRestartSession }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const [aviationStackKey, setAviationStackKey] = useState(settings.credentials.aviationStackApiKey);

  useEffect(() => {
    if (open) {
      setAviationStackKey(settings.credentials.aviationStackApiKey);
    }
  }, [open, settings.credentials]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const ianaTimezones = useMemo(() => {
    try {
      return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_TIMEZONES;
    } catch {
      return FALLBACK_TIMEZONES;
    }
  }, []);

  if (!open) return null;

  function handleSave() {
    updateSettings({
      credentials: {
        aviationStackApiKey: aviationStackKey.trim(),
      },
    });
    onClose();
  }

  const aviationStackBudget = providerManager.aviationStack.budget;
  const sessionGovernor = providerManager.sessionGovernor;

  const estimate = estimateSessionDuration(
    settings.sessionRequestLimit,
    activeFlightCount,
    settings.refreshIntervalMinutes,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-xl font-bold">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[44px] min-w-[44px] rounded-lg text-2xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            &times;
          </button>
        </div>

        <section className="mt-4">
          <h3 className="font-semibold">Data providers</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            AviationStack's key is stored only in this browser's local storage and sent directly to
            their API. FlightAware and OpenSky are called through this app's own server-side proxy
            instead (details below) — neither supports being called directly from a browser.
          </p>

          <div className="mt-4">
            <ProviderOrderList
              providers={providerManager.reorderableProviders()}
              pinnedProviders={providerManager.pinnedLastProviders()}
              preferences={settings.providerPreferences}
              onChange={(providerPreferences) => updateSettings({ providerPreferences })}
            />
          </div>

          <label htmlFor="aviationstack-key" className="mt-4 block text-sm font-medium">
            AviationStack API key
          </label>
          <input
            id="aviationstack-key"
            type="password"
            value={aviationStackKey}
            onChange={(e) => setAviationStackKey(e.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Free tier: {aviationStackBudget.limit} requests/month. Used this month: {aviationStackBudget.used}/
            {aviationStackBudget.limit}.
          </p>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              FlightAware (AeroAPI Personal)
            </span>{' '}
            has no key field here — AeroAPI sends no CORS headers at all, so it can only be called
            through this app's own server-side proxy, never directly from the browser. Set{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">FLIGHTAWARE_API_KEY</code>{' '}
            as an environment variable where the app runs (see README) — the key never touches the
            browser. Billed per request (no fixed monthly quota), rate-limited to 10 requests/minute;
            the session request limit below is the main guard against runaway cost.
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">OpenSky Network</span>{' '}
            also has no fields here — its client-credentials auth doesn't expose CORS headers for
            real clients, and there's no per-client "Web Origins" setting in their portal to fix it,
            so it's proxied the same way as FlightAware. Set{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">OPENSKY_CLIENT_ID</code>{' '}
            and{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">OPENSKY_CLIENT_SECRET</code>{' '}
            as environment variables where the app runs (see README). Used as a live-position
            fallback/enrichment source only — OpenSky can't provide gates, terminals, or schedules,
            just current position for airborne aircraft.
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.demoMode}
              onChange={(e) => updateSettings({ demoMode: e.target.checked })}
              className="h-5 w-5 rounded"
            />
            Demo mode (use offline sample data, no API calls)
          </label>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold">Session request limit</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A hard cap on real API requests for this browser session, on top of each provider's own
            monthly quota — a safety net in case auto-refresh keeps running after you've stepped
            away. Resets automatically on reload; use Restart to reset without one.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="session-limit" className="sr-only">
              Total requests to allow this session
            </label>
            <input
              id="session-limit"
              type="number"
              min={1}
              value={settings.sessionRequestLimit}
              onChange={(e) => {
                const parsed = Math.floor(Number(e.target.value));
                updateSettings({ sessionRequestLimit: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
              }}
              className="min-h-[44px] w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={onRestartSession}
              className="min-h-[44px] rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Restart
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Used this session: {sessionGovernor.used}/{settings.sessionRequestLimit}.
          </p>

          {!sessionGovernor.hasRemaining() && (
            <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              Limit reached — no further requests will be made until you click Restart.
            </p>
          )}

          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {settings.refreshIntervalMinutes === 0
              ? 'Auto-refresh is off, so this only limits manual refreshes.'
              : activeFlightCount === 0
                ? 'Add flights to estimate how long this will last at the current refresh interval.'
                : estimate
                  ? `At ${activeFlightCount} flight${activeFlightCount === 1 ? '' : 's'} every ${settings.refreshIntervalMinutes} min, this covers about ${formatDurationMinutes(estimate.minutes)} of auto-refresh (~${estimate.cycles} cycle${estimate.cycles === 1 ? '' : 's'}). Best-case — a provider fallback can use more than one request per flight.`
                  : "Not enough budget for even one refresh cycle at this flight count."}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold">Time display</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            By default each leg shows its own airport's local time (e.g. departure in Eastern,
            arrival in Pacific). Override to show every card in one consistent zone instead.
          </p>
          <select
            value={settings.displayTimezone}
            onChange={(e) => updateSettings({ displayTimezone: e.target.value })}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="airport-local">Airport local time (default)</option>
            <option value="device">My device's timezone</option>
            <optgroup label="Specific timezone">
              {ianaTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </optgroup>
          </select>
        </section>

        <section className="mt-6">
          <h3 className="font-semibold">Appearance</h3>
          <div className="mt-2 flex gap-2">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => updateSettings({ theme })}
                aria-pressed={settings.theme === theme}
                className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                  settings.theme === theme
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
