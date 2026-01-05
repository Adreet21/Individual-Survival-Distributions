/**
 * ----------------------------------------------------------------------------------
 * FolderTypeFilter
 * ----------------------------------------------------------------------------------
 * - Filter folders by content type (all, predictor-only, dataset-only, mixed)
 * - Provides visual indicators for folder content types
 */

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";

export type FolderType = "all" | "predictor-only" | "dataset-only" | "mixed";

interface FolderTypeFilterProps {
  value: FolderType;
  onChange: (type: FolderType) => void;
  className?: string;
}

const TYPE_OPTIONS: { value: FolderType; label: string; }[] = [
  { value: "all", label: "All Folders"},
  { value: "predictor-only", label: "Predictors Only"},
  { value: "dataset-only", label: "Datasets Only"},
  { value: "mixed", label: "Mixed Content" },
];

export default function FolderTypeFilter({
  value,
  onChange,
  className = "",
}: FolderTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const currentOption = TYPE_OPTIONS.find((opt) => opt.value === value) || TYPE_OPTIONS[0];

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm hover:bg-gray-50"
      >
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="hidden sm:inline">{currentOption.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg"
        >
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                value === option.value ? "bg-gray-100 font-medium" : ""
              }`}
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
            >
              <span className="text-lg"></span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}