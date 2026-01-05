/**
 * ----------------------------------------------------------------------------------
 * FilterMenu
 * ----------------------------------------------------------------------------------
 * - Small popover to choose ownership filter: All / Owner / Viewer.
 * - Controlled via internal `open` state; closes on outside click.
 * - Emits the chosen value to parent via `onChange`.
 */

import { useEffect, useRef, useState } from "react";

export type Ownership = "all" | "owner" | "viewer";

interface FilterMenuProps {
  value: Ownership;
  onChange: (v: Ownership) => void;
}

export default function FilterMenu({ value, onChange }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm hover:bg-gray-50"
      >
        Filter
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-40 overflow-hidden rounded-md border border-black/10 bg-white shadow-md"
        >
          {(["all", "owner", "viewer"] as const).map((opt) => (
            <button
              key={opt}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 capitalize ${
                value === opt ? "bg-gray-100" : ""
              }`}
              onClick={() => {
                setOpen(false);
                onChange(opt);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
