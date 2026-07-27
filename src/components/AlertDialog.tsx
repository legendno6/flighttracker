import { useEffect, useRef } from 'react';

interface AlertDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

/** A single-button "OK" modal for informational warnings the user must acknowledge — unlike ConfirmDialog, there's no backdrop-click dismiss, so the only way out is the OK button (or Escape). */
export function AlertDialog({ open, title, message, onClose }: AlertDialogProps) {
  const okButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) okButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-message"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <h2 id="alert-dialog-title" className="text-lg font-bold">
          {title}
        </h2>
        <p id="alert-dialog-message" className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {message}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={okButtonRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
