import { useEffect, useState } from 'react';
import type { LegChoicePrompt } from '../hooks/useFlights';
import { StatusBadge } from './StatusBadge';
import { formatTimeInZone } from '../utils/dateTimeUtils';

interface LegChoiceModalProps {
  prompt: LegChoicePrompt | null;
  onConfirm: (selectedLegKeys: string[]) => void;
  onCancel: () => void;
}

export function LegChoiceModal({ prompt, onConfirm, onCancel }: LegChoiceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-seed the checklist (default leg pre-checked) every time a new prompt opens.
  useEffect(() => {
    if (prompt) setSelected(new Set([prompt.defaultLegKey]));
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prompt, onCancel]);

  if (!prompt) return null;

  function toggle(legKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(legKey)) next.delete(legKey);
      else next.add(legKey);
      return next;
    });
  }

  const allSelected = selected.size === prompt.candidates.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leg-choice-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="leg-choice-title" className="text-xl font-bold">
            Multiple flights found
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-lg text-2xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            &times;
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          <strong>{prompt.rawInput}</strong> on {prompt.flightDate} matches more than one flight — some flight
          numbers cover a same-day out-and-back rotation. Choose which to track:
        </p>

        <button
          type="button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(prompt.candidates.map((c) => c.legKey)))}
          className="mt-3 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>

        <ul className="mt-2 space-y-2">
          {prompt.candidates.map((candidate) => (
            <li key={candidate.legKey}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded"
                  checked={selected.has(candidate.legKey)}
                  onChange={() => toggle(candidate.legKey)}
                />
                <span className="flex-1 text-sm">
                  <span className="font-semibold">
                    {candidate.departureCode ?? '?'} &rarr; {candidate.arrivalCode ?? '?'}
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    Departs {formatTimeInZone(candidate.scheduledDeparture, null) ?? 'unknown time'}
                  </span>
                </span>
                <StatusBadge status={candidate.status} />
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Each leg you track becomes its own card. Tracking a leg other than the one already shown spends an
          additional API request to fetch its details.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
            className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Track Selected
          </button>
        </div>
      </div>
    </div>
  );
}
