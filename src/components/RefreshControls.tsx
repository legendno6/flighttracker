import { useState } from 'react';
import { REFRESH_INTERVAL_OPTIONS } from '../utils/constants';
import type { RefreshIntervalMinutes } from '../types/settings';
import { ConfirmDialog } from './ConfirmDialog';

interface RefreshControlsProps {
  refreshIntervalMinutes: RefreshIntervalMinutes;
  onChangeInterval: (minutes: RefreshIntervalMinutes) => void;
  lastUpdatedAt: Date | null;
  nextRefreshAt: Date | null;
  onRefreshAll: () => void;
  onClearAll: () => void;
  hasFlights: boolean;
  sessionLimitReached: boolean;
  onRestartSession: () => void;
}

function formatClock(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function RefreshControls({
  refreshIntervalMinutes,
  onChangeInterval,
  lastUpdatedAt,
  nextRefreshAt,
  onRefreshAll,
  onClearAll,
  hasFlights,
  sessionLimitReached,
  onRestartSession,
}: RefreshControlsProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <div>
      {sessionLimitReached && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <span>Session request limit reached — no further lookups will run until you restart it.</span>
          <button
            type="button"
            onClick={onRestartSession}
            className="min-h-[36px] rounded-md px-2 font-semibold underline-offset-2 hover:underline"
          >
            Restart
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="refresh-interval" className="font-medium">
            Auto-refresh
          </label>
          <select
            id="refresh-interval"
            value={refreshIntervalMinutes}
            onChange={(e) => onChangeInterval(Number(e.target.value) as RefreshIntervalMinutes)}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
          >
            {REFRESH_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-slate-500 dark:text-slate-400">
          <span className="mr-3">Last updated: {formatClock(lastUpdatedAt)}</span>
          <span>Next refresh: {refreshIntervalMinutes === 0 ? 'Off' : formatClock(nextRefreshAt)}</span>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={!hasFlights}
            className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh All
          </button>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={!hasFlights}
            className="min-h-[44px] rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Clear All
          </button>
        </div>

        <ConfirmDialog
          open={confirmingClear}
          title="Clear all flights?"
          message="This removes every tracked flight from your dashboard. This can't be undone."
          confirmLabel="Clear All"
          onConfirm={() => {
            onClearAll();
            setConfirmingClear(false);
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      </div>
    </div>
  );
}
