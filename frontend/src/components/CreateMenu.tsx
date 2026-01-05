/**
 * ----------------------------------------------------------------------------------
 * CreateMenu
 * ----------------------------------------------------------------------------------
 * - Popover menu for creating new resources (Predictor / Dataset / Folder).
 * - Uses a ref + mousedown listener to close when clicking outside.
 * - Emits typed callbacks; parent decides what to do (add to state, navigate, etc.).
 *
 * React/TS notes:
 * - useRef holds the menu DOM node; click-away logic compares event targets.
 * - useEffect sets up and cleans a document-level listener.
 * - z-50 ensures the menu sits above cards (no stacking issues).
 * 
 * 
 * TO DO:
 * - probably add coloring - adjust position and make it 'pop' more
 */

import { useEffect, useRef, useState } from "react";

interface CreateMenuProps {
  onCreatePredictor: () => void;
  onCreateDataset: () => void;
  onCreateFolder?: () => void;
}

export default function CreateMenu({
  onCreatePredictor,
  onCreateDataset,
  onCreateFolder,
}: CreateMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 shrink-0 items-center gap-2 justify-center rounded-md bg-black px-4 text-sm font-medium text-white whitespace-nowrap leading-none hover:bg-black/90"
      >
        <span className="-mt-px">+</span>
        <span>Create</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-md border border-black/10 bg-white shadow-md"
        >
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => { setOpen(false); onCreatePredictor(); }}
          >
            Predictor
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => { setOpen(false); onCreateDataset(); }} 
          >
            Dataset
          </button>
          {onCreateFolder && (
            <button
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => { setOpen(false); onCreateFolder(); }} 
            >
              Folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
