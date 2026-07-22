import { useMemo, useState } from 'react';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { useFlights } from './hooks/useFlights';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useProviderManager } from './hooks/useProviderManager';
import { Header } from './components/Header';
import { AddFlightForm } from './components/AddFlightForm';
import { RefreshControls } from './components/RefreshControls';
import { Dashboard } from './components/Dashboard';
import { SettingsModal } from './components/SettingsModal';
import { isActivelyRefreshable } from './services/flightService';

function AppShell() {
  const { settings, updateSettings } = useSettings();
  const providerManager = useProviderManager();
  const {
    flights,
    addFlight,
    removeFlight,
    clearAll,
    refreshFlight,
    refreshAll,
    duplicateFlashId,
    sortMode,
    reorderFlights,
    resetToAutoSort,
  } = useFlights(providerManager);
  const { lastUpdatedAt, nextRefreshAt, markManualRefresh } = useAutoRefresh(
    settings.refreshIntervalMinutes,
    refreshAll,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, forceRerender] = useState(0);
  const activeFlightCount = useMemo(() => flights.filter((f) => isActivelyRefreshable(f)).length, [flights]);

  function handleRefreshAll() {
    refreshAll();
    markManualRefresh();
  }

  function handleRefreshOne(id: string) {
    refreshFlight(id);
    markManualRefresh();
  }

  function handleRestartSession() {
    providerManager.sessionGovernor.reset();
    forceRerender((t) => t + 1);
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Header onOpenSettings={() => setSettingsOpen(true)} flightCount={flights.length} />

      <main className="mt-6 space-y-4">
        <AddFlightForm onAdd={addFlight} />

        <RefreshControls
          refreshIntervalMinutes={settings.refreshIntervalMinutes}
          onChangeInterval={(minutes) => updateSettings({ refreshIntervalMinutes: minutes })}
          lastUpdatedAt={lastUpdatedAt}
          nextRefreshAt={nextRefreshAt}
          onRefreshAll={handleRefreshAll}
          onClearAll={clearAll}
          hasFlights={flights.length > 0}
          sessionLimitReached={!providerManager.sessionGovernor.hasRemaining()}
          onRestartSession={handleRestartSession}
        />

        <Dashboard
          flights={flights}
          duplicateFlashId={duplicateFlashId}
          sortMode={sortMode}
          onRefresh={handleRefreshOne}
          onRemove={removeFlight}
          onReorder={reorderFlights}
          onResetToAutoSort={resetToAutoSort}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providerManager={providerManager}
        activeFlightCount={activeFlightCount}
        onRestartSession={handleRestartSession}
      />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}
