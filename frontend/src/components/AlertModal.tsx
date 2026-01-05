/* ----------------------------------------------------------------------------------
 * AlertModal
 * ----------------------------------------------------------------------------------
 * - Simple, reusable “OK-only” dialog for inline alerts.
 * - Visually consistent with DeleteConfirmation.
 * - Controlled by `open`; when false, renders nothing.
 */
import type { ReactNode } from "react";

export interface AlertModalProps {
  open: boolean;
  title?: string;
  message?: ReactNode;
  onClose: () => void;
  primaryLabel?: string;
}

export function AlertModal({
  open,
  title = "Something went wrong",
  message,
  onClose,
  primaryLabel = "OK",
}: AlertModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <h3 className="text-base font-semibold">{title}</h3>

        {message && (
          <p className="mt-1 text-sm text-neutral-600">{message}</p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
