import type { RefreshIntervalMinutes } from '../types/settings';

/** `fast` entries are only shown when the user has opted in via AppSettings.allowFastRefresh (see RefreshControls.tsx) — a 1-5 min cadence can exhaust a free-tier API budget in minutes. */
export const REFRESH_INTERVAL_OPTIONS: { value: RefreshIntervalMinutes; label: string; fast?: boolean }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 minute', fast: true },
  { value: 5, label: '5 minutes', fast: true },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

/** How often the UI re-renders elapsed/remaining time without hitting the network. */
export const CLOCK_TICK_MS = 60_000;
