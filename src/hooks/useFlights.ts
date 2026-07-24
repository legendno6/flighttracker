import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrackedFlight } from '../types/flight';
import { loadFlightOrder, loadTrackedFlights, saveFlightOrder, saveTrackedFlights } from '../storage/localStorage';
import { canonicalFlightId, InvalidFlightInputError, normalizeFlightInput } from '../services/flightNormalizer';
import {
  applyManualOrder,
  createPendingFlight,
  describeProviderError,
  diffFlightForNotifications,
  finalizeLookupResult,
  isActivelyRefreshable,
  isDueForAutoRefresh,
  isFarOutFlightDate,
  sortTrackedFlights,
} from '../services/flightService';
import { getNotificationPermission, notifyFlightChange } from '../services/notificationService';
import type { ProviderManager } from '../providers/ProviderManager';
import { useSettings } from '../contexts/SettingsContext';

export interface AddFlightResult {
  ok: boolean;
  /** Set when the flight already existed, so the UI can flash/highlight it. */
  duplicateId?: string;
  error?: string;
}

/**
 * `manager` must be the single app-wide ProviderManager instance from
 * App.tsx's own `useProviderManager()` call, passed in rather than fetched
 * here — calling `useProviderManager()` a second time would allocate a
 * second `useRef` slot (hooks are keyed by call site, not shared globally),
 * producing a completely separate ProviderManager with its own session
 * governor/cache that silently diverges from the one Settings/Restart act on.
 */
export function useFlights(manager: ProviderManager) {
  const { settings, updateSettings } = useSettings();
  const [flights, setFlights] = useState<TrackedFlight[]>(() => loadTrackedFlights());
  const [manualOrder, setManualOrder] = useState<string[]>(() => loadFlightOrder());
  const [duplicateFlashId, setDuplicateFlashId] = useState<string | null>(null);
  const flightsRef = useRef(flights);
  flightsRef.current = flights;

  // Whether the user has confirmed paid (beyond free-tier) API access for
  // far-out flights this session — a ref (not just state) so addFlight reads
  // the up-to-date answer immediately after the user responds, without
  // waiting on a re-render. Resets on reload by design (session-only).
  const farOutAccessRef = useRef<'unset' | 'paid' | 'free'>('unset');
  const [farOutPrompt, setFarOutPrompt] = useState<{ resolve: (isPaid: boolean) => void } | null>(null);

  const confirmFarOutAccess = useCallback((): Promise<'paid' | 'free'> => {
    if (farOutAccessRef.current !== 'unset') return Promise.resolve(farOutAccessRef.current);
    return new Promise<'paid' | 'free'>((resolve) => {
      setFarOutPrompt({
        resolve: (isPaid: boolean) => {
          const result = isPaid ? 'paid' : 'free';
          farOutAccessRef.current = result;
          setFarOutPrompt(null);
          resolve(result);
        },
      });
    });
  }, []);

  useEffect(() => {
    saveTrackedFlights(flights);
  }, [flights]);

  useEffect(() => {
    // Drop ids for flights that no longer exist, so the stored order doesn't grow unbounded.
    const liveIds = new Set(flights.map((f) => f.id));
    saveFlightOrder(manualOrder.filter((id) => liveIds.has(id)));
  }, [manualOrder, flights]);

  const runLookup = useCallback(
    async (id: string, rawInput: string, flightDate: string, bypassCache: boolean) => {
      setFlights((prev) =>
        prev.map((f) => (f.id === id ? { ...f, isLoading: true, lastAttemptedAt: new Date().toISOString() } : f)),
      );
      try {
        const normalized = normalizeFlightInput(rawInput);
        const raw = await manager.lookupFlight({ normalized, flightDate }, { bypassCache });
        const result = finalizeLookupResult(raw);
        setFlights((prev) =>
          prev.map((f) => {
            if (f.id !== id) return f;
            if (settings.notificationsEnabled && getNotificationPermission() === 'granted') {
              const changes = diffFlightForNotifications(f.data, result);
              if (changes.length > 0) {
                notifyFlightChange(`${result.airline ?? f.input} ${result.flightNumber}`.trim(), changes);
              }
            }
            return { ...f, data: result, isLoading: false, lastError: null, lastRefreshedAt: new Date().toISOString() };
          }),
        );
      } catch (err) {
        setFlights((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, isLoading: false, lastError: describeProviderError(err) } : f,
          ),
        );
      }
    },
    [manager, settings.notificationsEnabled],
  );

  const addFlight = useCallback(
    async (rawInput: string, flightDate: string): Promise<AddFlightResult> => {
      let normalized;
      try {
        normalized = normalizeFlightInput(rawInput);
      } catch (err) {
        return { ok: false, error: err instanceof InvalidFlightInputError ? err.message : 'Invalid flight number.' };
      }

      const id = canonicalFlightId(normalized, flightDate);
      const existing = flightsRef.current.find((f) => f.id === id);
      if (existing) {
        setDuplicateFlashId(id);
        window.setTimeout(() => setDuplicateFlashId((current) => (current === id ? null : current)), 2000);
        return { ok: true, duplicateId: id };
      }

      let farOutDeferred = false;
      if (isFarOutFlightDate(flightDate)) {
        const access = await confirmFarOutAccess();
        farOutDeferred = access === 'free';
      }

      const pending = createPendingFlight(rawInput, flightDate, farOutDeferred);
      setFlights((prev) => [...prev, pending]);
      if (!farOutDeferred) {
        void runLookup(pending.id, pending.input, flightDate, true);
      }
      return { ok: true };
    },
    [runLookup, confirmFarOutAccess],
  );

  const removeFlight = useCallback((id: string) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFlights([]);
  }, []);

  const refreshFlight = useCallback(
    (id: string) => {
      const flight = flightsRef.current.find((f) => f.id === id);
      if (!flight) return;
      void runLookup(flight.id, flight.input, flight.flightDate, true);
    },
    [runLookup],
  );

  const refreshAll = useCallback(
    (options?: { onlyActive?: boolean; respectTier?: boolean }) => {
      const onlyActive = options?.onlyActive ?? true;
      const respectTier = options?.respectTier ?? false;
      const now = new Date();
      for (const flight of flightsRef.current) {
        if (onlyActive && !isActivelyRefreshable(flight)) continue;
        if (respectTier && !isDueForAutoRefresh(flight, settings.refreshIntervalMinutes, now)) continue;
        void runLookup(flight.id, flight.input, flight.flightDate, true);
      }
    },
    [runLookup, settings.refreshIntervalMinutes],
  );

  const displayedFlights = useMemo(() => {
    const effectiveOrder = manualOrder.length > 0 ? manualOrder : flights.map((f) => f.id);
    return settings.flightSortMode === 'manual' ? applyManualOrder(flights, effectiveOrder) : sortTrackedFlights(flights);
  }, [flights, manualOrder, settings.flightSortMode]);

  // Kept in sync so reorderFlights can seed manualOrder from whatever order is
  // actually on screen right now (auto-sorted, until the user's first drag).
  const displayedFlightsRef = useRef(displayedFlights);
  displayedFlightsRef.current = displayedFlights;

  /** Drag-and-drop reorder: moves `activeId` to `overId`'s position and switches to manual sort mode. */
  const reorderFlights = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;
      setManualOrder((prevOrder) => {
        // Seed from the currently *displayed* order (not raw insertion order) so a
        // first-ever drag rearranges relative to what the user actually sees and dragged.
        const currentOrder = prevOrder.length > 0 ? prevOrder : displayedFlightsRef.current.map((f) => f.id);
        const fromIndex = currentOrder.indexOf(activeId);
        const toIndex = currentOrder.indexOf(overId);
        if (fromIndex === -1 || toIndex === -1) return prevOrder;
        return arrayMove(currentOrder, fromIndex, toIndex);
      });
      if (settings.flightSortMode !== 'manual') {
        updateSettings({ flightSortMode: 'manual' });
      }
    },
    [settings.flightSortMode, updateSettings],
  );

  const resetToAutoSort = useCallback(() => {
    updateSettings({ flightSortMode: 'auto' });
  }, [updateSettings]);

  return {
    flights: displayedFlights,
    addFlight,
    removeFlight,
    clearAll,
    refreshFlight,
    refreshAll,
    duplicateFlashId,
    sortMode: settings.flightSortMode,
    reorderFlights,
    resetToAutoSort,
    farOutPrompt,
  };
}
