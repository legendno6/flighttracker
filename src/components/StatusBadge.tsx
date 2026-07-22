import type { FlightStatus, StatusCategory } from '../types/flight';
import { statusCategory } from '../services/statusResolver';
import { cn } from '../utils/classNames';

const CATEGORY_STYLES: Record<StatusCategory, string> = {
  ontime: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  delayed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  inflight: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  scheduled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const CATEGORY_DOT: Record<StatusCategory, string> = {
  ontime: 'bg-emerald-500',
  delayed: 'bg-amber-500',
  inflight: 'bg-blue-500',
  scheduled: 'bg-slate-400',
  cancelled: 'bg-red-500',
};

export function StatusBadge({ status }: { status: FlightStatus }) {
  const category = statusCategory(status);
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
        CATEGORY_STYLES[category],
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', CATEGORY_DOT[category])} aria-hidden="true" />
      {status}
    </span>
  );
}
