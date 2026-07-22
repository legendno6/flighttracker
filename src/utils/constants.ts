import type { RefreshIntervalMinutes } from '../types/settings';

export const REFRESH_INTERVAL_OPTIONS: { value: RefreshIntervalMinutes; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

/** How often the UI re-renders elapsed/remaining time without hitting the network. */
export const CLOCK_TICK_MS = 60_000;
