import { useState, type FormEvent } from 'react';
import { todayIsoDate } from '../utils/dateTimeUtils';
import type { AddFlightResult } from '../hooks/useFlights';
import { splitFlightInputs } from '../services/flightNormalizer';

interface AddFlightFormProps {
  onAdd: (rawInput: string, flightDate: string) => Promise<AddFlightResult>;
}

export function AddFlightForm({ onAdd }: AddFlightFormProps) {
  const [flightInput, setFlightInput] = useState('');
  const [flightDate, setFlightDate] = useState(todayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!flightInput.trim()) return;

    // De-duplicated so typing the same flight twice in one submission (e.g.
    // "AA123, AA123") can't slip past useFlights' duplicate check, which only
    // catches flights already tracked *before* this submission started.
    const seen = new Set<string>();
    const tokens = splitFlightInputs(flightInput).filter((token) => {
      const key = token.toUpperCase().replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setSubmitting(true);
    setError(null);

    const failed: { token: string; error: string }[] = [];
    for (const token of tokens) {
      const result = await onAdd(token, flightDate);
      if (!result.ok) failed.push({ token, error: result.error ?? 'Could not add flight.' });
    }

    setSubmitting(false);

    if (failed.length === 0) {
      setFlightInput('');
      return;
    }
    // Leave only the failed entries in the box so the user can fix and resubmit without retyping everything that already worked.
    setFlightInput(failed.map((f) => f.token).join(', '));
    setError(
      failed.length === 1 && tokens.length === 1
        ? failed[0].error
        : failed.map((f) => `• ${f.token}: ${f.error}`).join('\n'),
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="flight-input" className="mb-1 block text-sm font-medium">
          Flight number(s)
        </label>
        <input
          id="flight-input"
          type="text"
          value={flightInput}
          onChange={(e) => setFlightInput(e.target.value)}
          placeholder="e.g. DAL5111, AA 123 UAL1234 — same date for all"
          autoComplete="off"
          className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base uppercase placeholder:normal-case dark:border-slate-700 dark:bg-slate-800"
          aria-invalid={!!error}
          aria-describedby={error ? 'flight-input-error' : undefined}
        />
      </div>

      <div>
        <label htmlFor="flight-date" className="mb-1 block text-sm font-medium">
          Flight date
        </label>
        <input
          id="flight-date"
          type="date"
          value={flightDate}
          onChange={(e) => setFlightDate(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 sm:w-auto"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !flightInput.trim()}
        className="min-h-[44px] rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add Flight(s)'}
      </button>

      {error && (
        <p
          id="flight-input-error"
          role="alert"
          className="w-full whitespace-pre-line text-sm text-red-600 dark:text-red-400 sm:basis-full"
        >
          {error}
        </p>
      )}
    </form>
  );
}
