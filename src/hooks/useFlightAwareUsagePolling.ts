import { useEffect, useRef } from 'react';
import type { ProviderManager } from '../providers/ProviderManager';
import { getNotificationPermission, notifyFlightAwareUsageThreshold } from '../services/notificationService';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Checked highest-first so a jump across more than one threshold in a single
// tick (e.g. the limit was just lowered) only fires the one notification for
// wherever usage actually landed, not one per threshold passed through.
const WARNING_THRESHOLDS = [0.99, 0.95, 0.9];

/**
 * Fetches FlightAware's account usage once when the app starts, then every
 * 10 minutes for as long as this tab stays open. `providerManager.flightAware.usage`
 * is a plain mutable object outside React state, so `onUpdate` is used to
 * force a re-render (see App.tsx's `forceRerender`) whenever fresh data
 * arrives — the same pattern already used for the session-request-governor
 * "Restart" button.
 *
 * Also watches the reported cost against `costLimit` and fires a browser
 * notification the first time each of 90%/95%/99% is crossed, so the limit
 * being hit (which silently skips FlightAware in the provider chain) doesn't
 * come as a surprise. `costLimitRef`/`notificationsEnabledRef` are read fresh
 * on every tick via refs rather than being effect dependencies, so changing
 * either setting doesn't tear down and restart the underlying interval.
 */
export function useFlightAwareUsagePolling(
  manager: ProviderManager,
  demoMode: boolean,
  costLimit: number,
  notificationsEnabled: boolean,
  onUpdate: () => void,
) {
  const costLimitRef = useRef(costLimit);
  costLimitRef.current = costLimit;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;
  // Highest threshold already notified for the current "over limit" stretch;
  // reset once usage drops back under the lowest threshold (limit raised, or
  // AeroAPI's own billing period rolled over) so a later climb re-warns.
  const notifiedThresholdRef = useRef(0);

  useEffect(() => {
    // Demo mode means "no real API calls" — this hits FlightAware's real
    // account, so it has to be skipped here too, not just in the provider chain.
    if (demoMode) return;

    let cancelled = false;
    const tick = async () => {
      await manager.flightAware.usage.refresh();
      if (cancelled) return;

      const snapshot = manager.flightAware.usage.current;
      const limit = costLimitRef.current;
      const ratio = snapshot && limit > 0 ? snapshot.totalCost / limit : 0;
      const crossed = WARNING_THRESHOLDS.find((t) => ratio >= t);

      if (crossed !== undefined && crossed > notifiedThresholdRef.current) {
        notifiedThresholdRef.current = crossed;
        if (notificationsEnabledRef.current && getNotificationPermission() === 'granted' && snapshot) {
          notifyFlightAwareUsageThreshold(crossed, snapshot.totalCost, limit);
        }
      } else if (ratio < WARNING_THRESHOLDS[WARNING_THRESHOLDS.length - 1]) {
        notifiedThresholdRef.current = 0;
      }

      onUpdate();
    };

    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, demoMode]);
}
