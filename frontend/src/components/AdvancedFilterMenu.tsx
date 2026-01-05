/**
 * ----------------------------------------------------------------------------------
 * AdvancedFilterMenu
 * ----------------------------------------------------------------------------------
 * - Unified filter popover for:
 *   - Visibility: all / public / private
 *   - Keyword scope: title / notes / both
 *
 * Usage:
 * - Parent owns both `visibility` and `keywordTarget` state and handlers.
 * - This component just renders the UI and wires up callbacks.
 * ----------------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";

export type Visibility = "all" | "public" | "private";
export type KeywordTarget = "title" | "notes" | "both";

export interface AdvancedFilterMenuProps {
  visibility: Visibility;
  onVisibilityChange: (value: Visibility) => void;

  keywordTarget: KeywordTarget;
  onKeywordTargetChange: (value: KeywordTarget) => void;
}

export default function AdvancedFilterMenu({
  visibility,
  onVisibilityChange,
  keywordTarget,
  onKeywordTargetChange,
}: AdvancedFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const visibilityOptions: { value: Visibility; label: string }[] = [
    { value: "all", label: "All" },
    { value: "public", label: "Public" },
    { value: "private", label: "Private" },
  ];

  const keywordOptions: { value: KeywordTarget; label: string }[] = [
    { value: "title", label: "Title only" },
    { value: "notes", label: "Notes only" },
    { value: "both", label: "Title + notes" },
  ];

  const triggerLabel =
    visibility === "all"
      ? "Filters"
      : `Filters · ${visibility[0].toUpperCase()}${visibility.slice(1)}`;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span>{triggerLabel}</span>
        <span className="text-xs text-neutral-500">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-black/10 bg-white p-3 text-xs shadow-lg"
        >
          {/* Visibility section */}
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Visibility
            </div>
            <div className="grid grid-cols-3 gap-1">
              {visibilityOptions.map((opt) => {
                const selected = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onVisibilityChange(opt.value)}
                    className={
                      "h-8 w-full rounded-md border px-2.5 text-[11px] font-medium transition " +
                      (selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="my-2 h-px bg-neutral-100" />

          {/* Keyword scope section */}
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Search in
            </div>
            <div className="grid grid-cols-3 gap-1">
              {keywordOptions.map((opt) => {
                const selected = keywordTarget === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onKeywordTargetChange(opt.value)}
                    className={
                      "h-8 w-full rounded-md border px-2.5 text-[11px] font-medium transition " +
                      (selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtle hint line if you want to extend later */}
          <div className="mt-3 text-[10px] text-neutral-400">
            You can extend this menu with more filters (date, owner, size, etc.)
            without changing the API.
          </div>
        </div>
      )}
    </div>
  );
}
