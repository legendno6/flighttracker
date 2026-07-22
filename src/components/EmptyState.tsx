export function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <p className="text-lg font-semibold">No flights tracked yet</p>
      <p className="mt-1 text-sm">Add a flight number above to start monitoring its live status.</p>
    </div>
  );
}
