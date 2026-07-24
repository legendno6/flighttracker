import { HelpIcon } from './icons/HelpIcon';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  flightCount: number;
}

function openBroadcastBoard() {
  const url = `${window.location.origin}${window.location.pathname}?broadcast=1`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function Header({ onOpenSettings, onOpenHelp, flightCount }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">PlaneStatus</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {flightCount === 0 ? 'No flights tracked' : `Tracking ${flightCount} flight${flightCount === 1 ? '' : 's'}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openBroadcastBoard}
          className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <span className="hidden sm:inline">Broadcast</span>
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="Open help"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <HelpIcon />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
