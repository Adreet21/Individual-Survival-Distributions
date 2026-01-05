/**
 * ----------------------------------------------------------------------------------
 * FolderPrivacyToggle
 * ----------------------------------------------------------------------------------
 * - Standalone privacy toggle component for folders
 * - Can be used in folder cards, modals, or settings pages
 * - Provides clear visual indication of privacy state
 * - Includes confirmation for privacy changes that affect visibility
 */

import { useState } from "react";

export interface FolderPrivacyToggleProps {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showDescription?: boolean;
  confirmPublicChange?: boolean;
  publicItemCount?: number;
}

export default function FolderPrivacyToggle({
  isPrivate,
  onChange,
  disabled = false,
  size = 'md',
  showLabel = true,
  showDescription = false,
  confirmPublicChange = false,
  publicItemCount = 0,
}: FolderPrivacyToggleProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingChange, setPendingChange] = useState<boolean | null>(null);

  const sizeClasses = {
    sm: {
      toggle: "h-4 w-7",
      thumb: "h-3 w-3",
      text: "text-xs",
      spacing: "gap-2"
    },
    md: {
      toggle: "h-5 w-9",
      thumb: "h-4 w-4",
      text: "text-sm",
      spacing: "gap-3"
    },
    lg: {
      toggle: "h-6 w-11",
      thumb: "h-5 w-5",
      text: "text-base",
      spacing: "gap-4"
    }
  };

  const classes = sizeClasses[size];

  const handleToggle = () => {
    if (disabled) return;

    const newValue = !isPrivate;

    // If making public and we should confirm, show confirmation
    if (!newValue && confirmPublicChange && publicItemCount === 0) {
      setPendingChange(newValue);
      setShowConfirmation(true);
      return;
    }

    onChange(newValue);
  };

  const handleConfirm = () => {
    if (pendingChange !== null) {
      onChange(pendingChange);
    }
    setShowConfirmation(false);
    setPendingChange(null);
  };

  const handleCancel = () => {
    setShowConfirmation(false);
    setPendingChange(null);
  };

  return (
    <>
      <div className={`flex items-center ${classes.spacing}`}>
        {/* Toggle Switch */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`
            relative inline-flex ${classes.toggle} flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${isPrivate 
              ? 'bg-gray-300' 
              : 'bg-green-500'
            }
          `}
          role="switch"
          aria-checked={!isPrivate}
          aria-label={`Folder is ${isPrivate ? 'private' : 'public'}`}
        >
          <span
            className={`
              ${classes.thumb} pointer-events-none inline-block rounded-full bg-white shadow transform ring-0 
              transition duration-200 ease-in-out
              ${isPrivate ? 'translate-x-0' : 'translate-x-4'}
            `}
          />
        </button>

        {/* Label and Description */}
        {(showLabel || showDescription) && (
          <div className="flex-1">
            {showLabel && (
              <div className={`font-medium ${classes.text} ${isPrivate ? 'text-gray-700' : 'text-green-700'}`}>
                {isPrivate ? (
                  <span className="flex items-center gap-1">
                    Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    Public
                  </span>
                )}
              </div>
            )}
            {showDescription && (
              <div className={`${classes.text} text-gray-500 mt-1`}>
                {isPrivate 
                  ? "Only you and people you share with can see this folder"
                  : publicItemCount > 0
                    ? `Visible to everyone (${publicItemCount} public item${publicItemCount !== 1 ? 's' : ''})`
                    : "Will be hidden from public view (no public items)"
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Make Folder Public?</h3>
            <div className="text-sm text-gray-600 space-y-2 mb-4">
              <p>
                This folder will be visible to everyone, but it currently contains no public items.
              </p>
              <p>
                The folder will be automatically hidden from public view until you add public items or make existing items public.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
              >
                Make Public
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}