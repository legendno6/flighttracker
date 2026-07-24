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
import { HelpModal } from './components/HelpModal';
import { ConfirmDialog } from './components/ConfirmDialog';
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
    farOutPrompt,
  } = useFlights(providerManager);
  const { lastUpdatedAt, nextRefreshAt, markManualRefresh } = useAutoRefresh(
    settings.refreshIntervalMinutes,
    refreshAll,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        flightCount={flights.length}
      />

      <main className="mt-6 space-y-4">
        <AddFlightForm onAdd={addFlight} />

        <RefreshControls
          refreshIntervalMinutes={settings.refreshIntervalMinutes}
          onChangeInterval={(minutes) => updateSettings({ refreshIntervalMinutes: minutes })}
          allowFastRefresh={settings.allowFastRefresh}
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

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <ConfirmDialog
        open={farOutPrompt !== null}
        title="Flight is more than a day out"
        message="Free-tier flight-data plans typically only return results for today and tomorrow. Do you have paid access with one of your providers that supports looking up flights further out?"
        cancelLabel="No, use free tier"
        confirmLabel="Yes, I have paid access"
        confirmVariant="primary"
        defaultFocus="cancel"
        onConfirm={() => farOutPrompt?.resolve(true)}
        onCancel={() => farOutPrompt?.resolve(false)}
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
