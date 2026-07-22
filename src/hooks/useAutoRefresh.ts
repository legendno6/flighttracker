import { useCallback, useEffect, useState } from 'react';
import type { RefreshIntervalMinutes } from '../types/settings';

export function useAutoRefresh(refreshIntervalMinutes: RefreshIntervalMinutes, refreshAll: (options?: { onlyActive?: boolean }) => void) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);

  useEffect(() => {
    if (refreshIntervalMinutes === 0) {
      setNextRefreshAt(null);
      return;
    }

    const intervalMs = refreshIntervalMinutes * 60_000;
    setNextRefreshAt(new Date(Date.now() + intervalMs));

    const id = window.setInterval(() => {
      refreshAll({ onlyActive: true });
      setLastUpdatedAt(new Date());
      setNextRefreshAt(new Date(Date.now() + intervalMs));
    }, intervalMs);

    return () => window.clearInterval(id);
    // refreshAll is stable (memoized in useFlights); intervalMinutes fully drives re-scheduling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshIntervalMinutes]);

  const markManualRefresh = useCallback(() => {
    setLastUpdatedAt(new Date());
    if (refreshIntervalMinutes > 0) {
      setNextRefreshAt(new Date(Date.now() + refreshIntervalMinutes * 60_000));
    }
  }, [refreshIntervalMinutes]);

  return { lastUpdatedAt, nextRefreshAt, markManualRefresh };
}
