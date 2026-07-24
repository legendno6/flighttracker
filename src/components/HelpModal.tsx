import { useEffect, useState, type ReactNode } from 'react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

interface HelpTab {
  id: string;
  label: string;
  content: ReactNode;
}

const HELP_TABS: HelpTab[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    content: (
      <>
        <p>
          Type a flight number into the Add Flight box (e.g. <code>DAL5111</code>, <code>AA 123</code>,
          or <code>UAL1234</code>) and pick a date, then click <strong>Add Flight(s)</strong>. IATA
          (<code>AA123</code>), ICAO (<code>AAL210</code>), and spaced (<code>AA 123</code>) formats
          all work, including airlines with alphanumeric IATA codes like <code>B6</code> (JetBlue) or{' '}
          <code>F9</code> (Frontier).
        </p>
        <p className="mt-3">
          You can add several flights at once by separating them with commas, semicolons, or plain
          spaces — e.g. <code>DAL5111, AA 123 UAL1234</code> — all applied to the same date. If one
          entry is invalid, the rest still get added; only the failed ones are left in the box with
          an error message so you can fix and resubmit.
        </p>
        <p className="mt-3">
          Adding the same flight number and date twice just highlights the existing card instead of
          creating a duplicate.
        </p>
      </>
    ),
  },
  {
    id: 'refresh',
    label: 'Auto-Refresh',
    content: (
      <>
        <p>
          The toolbar's <strong>Auto-refresh</strong> dropdown controls how often tracked flights are
          looked up automatically: Off, every 10/15/30 minutes, or every hour. <strong>Refresh All</strong>{' '}
          and each card's own Refresh button always run immediately, any time.
        </p>
        <p className="mt-3">
          Flights more than 24 hours from departure are checked only every 4 hours, and flights 12–24
          hours out only every hour, regardless of that setting — gates and terminals essentially never
          change that far in advance. Once a flight is within 12 hours of departure (or has already
          departed), it goes back to your selected interval. Landed and cancelled flights stop
          refreshing entirely.
        </p>
        <p className="mt-3">
          Adding a flight more than a day out prompts once per session asking whether you have paid
          API access that far ahead — free-tier plans usually only cover today and tomorrow.
          Answering no still adds the flight, but skips lookups until about 36 hours before
          departure to avoid wasting calls that would just fail; the card explains this and its
          Refresh button still works immediately if you want to check sooner.
        </p>
        <p className="mt-3">
          For paid API plans, Settings → Advanced has an option to unlock 1-minute and 5-minute
          intervals — selecting either pops a warning first, since that cadence can exhaust a
          free-tier budget in minutes.
        </p>
        <p className="mt-3">
          Settings also has a <strong>session request limit</strong> — a hard cap on total API requests
          for this browser session, independent of any provider's own monthly quota, as a safety net if
          auto-refresh runs unattended for a while.
        </p>
      </>
    ),
  },
  {
    id: 'providers',
    label: 'Data Providers',
    content: (
      <>
        <p>
          Flight data comes from a chain of providers, tried in order until one succeeds:{' '}
          <strong>AviationStack</strong> (schedule/gate/terminal/status; needs a free API key entered
          in Settings), <strong>FlightAware AeroAPI</strong> (richer data, pay-per-use, configured
          server-side), and <strong>OpenSky Network</strong> (free live position/ADS-B data, used as a
          last resort and to enrich any in-flight card with altitude, speed, heading, and a "View on
          map" link).
        </p>
        <p className="mt-3">
          In Settings, drag AviationStack and FlightAware to change which is tried first, or uncheck
          either to skip it. OpenSky always runs last since it can't supply gates or schedules on its
          own.
        </p>
        <p className="mt-3">
          <strong>Demo mode</strong> (Settings) switches to offline sample data with no real API calls
          — useful for trying the app out before adding any keys.
        </p>
      </>
    ),
  },
  {
    id: 'notifications-photos',
    label: 'Notifications & Photos',
    content: (
      <>
        <p>
          Settings → Notifications can enable a browser notification whenever a tracked flight's gate,
          terminal, or status changes, as long as this tab is open (even in the background) — nothing
          fires once the tab or browser is closed. It's opt-in and needs your browser's notification
          permission granted once.
        </p>
        <p className="mt-3">
          In-flight cards also show a real photo of the tracked aircraft, sourced from
          planespotters.net with photographer credit, once its ICAO24 address is known. This is on by
          default and can be turned off in Settings → Aircraft photos.
        </p>
      </>
    ),
  },
  {
    id: 'display',
    label: 'Display & Sorting',
    content: (
      <>
        <p>
          Cards auto-sort by status priority (boarding &gt; in flight &gt; delayed &gt; scheduled &gt;
          landed &gt; cancelled) by default. Drag any card's grip handle to switch to a custom order —
          a banner appears with a one-click way back to auto-sort. Works with mouse, touch, and
          keyboard (focus the grip handle, Space to pick up, arrow keys to move, Space to drop).
        </p>
        <p className="mt-3">
          By default each leg shows its own airport's local time. Settings → Time display can override
          this to show every card in one consistent zone — your device's timezone, or any specific
          zone you pick.
        </p>
        <p className="mt-3">Theme (light/dark/system) is also set in Settings.</p>
      </>
    ),
  },
  {
    id: 'broadcast',
    label: 'Broadcast Board',
    content: (
      <>
        <p>
          Click <strong>Broadcast</strong> (top right) to open a second, read-only view styled like a
          real airport split-flap departures board — mechanical flip-tile animation, a live clock, and
          color-coded status per flight — meant to be cast to a TV or second monitor.
        </p>
        <p className="mt-3">
          It never makes its own API calls; it only reads what the main tab has already looked up, and
          updates live as long as the main tab stays open somewhere (it can be in the background, just
          not closed).
        </p>
      </>
    ),
  },
];

export function HelpModal({ open, onClose }: HelpModalProps) {
  const [activeTabId, setActiveTabId] = useState(HELP_TABS[0].id);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeTab = HELP_TABS.find((tab) => tab.id === activeTabId) ?? HELP_TABS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="help-title" className="text-xl font-bold">
            Help
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="min-h-[44px] min-w-[44px] rounded-lg text-2xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            &times;
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Help topics"
          className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
        >
          {HELP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
              className={`min-h-[44px] rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab.id === activeTabId
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {activeTab.content}
        </div>
      </div>
    </div>
  );
}
