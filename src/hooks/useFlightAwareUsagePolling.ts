import { useEffect } from 'react';
import type { ProviderManager } from '../providers/ProviderManager';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches FlightAware's account usage once when the app starts, then every
 * hour for as long as this tab stays open. `providerManager.flightAware.usage`
 * is a plain mutable object outside React state, so `onUpdate` is used to
 * force a re-render (see App.tsx's `forceRerender`) whenever fresh data
 * arrives — the same pattern already used for the session-request-governor
 * "Restart" button.
 */
export function useFlightAwareUsagePolling(manager: ProviderManager, demoMode: boolean, onUpdate: () => void) {
  useEffect(() => {
    // Demo mode means "no real API calls" — this hits FlightAware's real
    // account, so it has to be skipped here too, not just in the provider chain.
    if (demoMode) return;

    let cancelled = false;
    const tick = async () => {
      await manager.flightAware.usage.refresh();
      if (!cancelled) onUpdate();
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
