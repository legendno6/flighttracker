export type RefreshIntervalMinutes = 0 | 15 | 30 | 60;

export type ThemePreference = 'light' | 'dark' | 'system';

export type FlightSortMode = 'auto' | 'manual';

/** 'airport-local' shows each leg in its own airport's timezone (the original per-leg behavior); 'device' uses the browser's timezone; anything else is a specific IANA zone name the user picked. */
export type DisplayTimezoneSetting = 'airport-local' | 'device' | string;

export interface ProviderCredentials {
  aviationStackApiKey: string;
  // FlightAware and OpenSky's credentials are intentionally NOT here — both
  // live server-side only (FLIGHTAWARE_API_KEY / OPENSKY_CLIENT_ID /
  // OPENSKY_CLIENT_SECRET env vars read by their proxies), never in the browser.
}

/** Which real (non-demo) providers are tried, and in what order. */
export interface ProviderPreferences {
  order: string[]; // provider ids, priority order
  enabled: Record<string, boolean>;
}

export const DEFAULT_PROVIDER_ORDER = ['aviationstack', 'flightaware', 'opensky'];

export interface AppSettings {
  refreshIntervalMinutes: RefreshIntervalMinutes;
  theme: ThemePreference;
  credentials: ProviderCredentials;
  /** When true, use the offline MockProvider instead of real providers (no API calls). */
  demoMode: boolean;
  providerPreferences: ProviderPreferences;
  /** 'auto' sorts cards by status priority; 'manual' respects the user's drag order. */
  flightSortMode: FlightSortMode;
  /** Hard cap on real API requests for this browser session (see SessionRequestGovernor). */
  sessionRequestLimit: number;
  /** Overrides each leg's own airport timezone with one consistent zone across all cards, when not 'airport-local'. */
  displayTimezone: DisplayTimezoneSetting;
  /** Fires a browser Notification when a tracked flight's gate/terminal/status changes, as long as this tab is open. Requires the browser's Notification permission to actually be granted — see `notificationService.ts`. */
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  refreshIntervalMinutes: 30,
  theme: 'system',
  credentials: {
    aviationStackApiKey: '',
  },
  demoMode: false,
  providerPreferences: {
    order: DEFAULT_PROVIDER_ORDER,
    enabled: Object.fromEntries(DEFAULT_PROVIDER_ORDER.map((id) => [id, true])),
  },
  flightSortMode: 'auto',
  sessionRequestLimit: 100,
  displayTimezone: 'airport-local',
  notificationsEnabled: false,
};
