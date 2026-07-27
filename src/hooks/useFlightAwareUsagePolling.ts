import { useEffect, useRef } from 'react';
import type { ProviderManager } from '../providers/ProviderManager';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Checked highest-first so a jump across more than one threshold in a single
// tick (e.g. the limit was just lowered) only fires the one warning for
// wherever usage actually landed, not one per threshold passed through.
const WARNING_THRESHOLDS = [0.99, 0.95, 0.9];

export interface FlightAwareUsageWarning {
  title: string;
  message: string;
}

/**
 * Fetches FlightAware's account usage once when the app starts, then every
 * 10 minutes for as long as this tab stays open. `providerManager.flightAware.usage`
 * is a plain mutable object outside React state, so `onUpdate` is used to
 * force a re-render (see App.tsx's `forceRerender`) whenever fresh data
 * arrives — the same pattern already used for the session-request-governor
 * "Restart" button.
 *
 * Also watches the reported cost against `costLimit` and calls
 * `onThresholdCrossed` the first time each of 90%/95%/99% is crossed, so the
 * limit being hit (which silently skips FlightAware in the provider chain)
 * doesn't come as a surprise — App.tsx surfaces this as an in-app modal the
 * user has to click OK on, rather than an OS notification, since it needs no
 * browser permission and shouldn't be missable the way a toast can be.
 * `costLimitRef` is read fresh on every tick via a ref rather than being an
 * effect dependency, so changing the limit doesn't tear down and restart the
 * underlying interval.
 */
export function useFlightAwareUsagePolling(
  manager: ProviderManager,
  demoMode: boolean,
  costLimit: number,
  onThresholdCrossed: (warning: FlightAwareUsageWarning) => void,
  onUpdate: () => void,
) {
  const costLimitRef = useRef(costLimit);
  costLimitRef.current = costLimit;
  // Highest threshold already surfaced for the current "over limit" stretch;
  // reset once usage drops back under the lowest threshold (limit raised, or
  // AeroAPI's own billing period rolled over) so a later climb warns again.
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
        if (snapshot) {
          onThresholdCrossed({
            title: 'FlightAware cost approaching limit',
            message: `${Math.round(crossed * 100)}% of your $${limit.toFixed(2)} limit reached — $${snapshot.totalCost.toFixed(2)} spent this period.`,
          });
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
