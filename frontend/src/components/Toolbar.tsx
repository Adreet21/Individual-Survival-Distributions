import { useState, useEffect, useRef, type FC, type ReactNode } from "react";
import SearchBar from "./SearchBar";

type Tab = "predictors" | "datasets" | "folders";

interface ToolbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onCreatePredictor: () => void;
  onCreateDataset: () => void;
  onCreateFolder: () => void;
  /** Rendered to the right of the search bar, left of Create (e.g. Filters menu) */
  filterControl: ReactNode;
}

/**
 * Toolbar
 *
 * Layout:
 * - Left cluster: tab buttons + search bar
 * - Right cluster: filter control + Create dropdown
 *
 * Filter UI is passed in via `filterControl` so Dashboard can decide
 * whether to show AdvancedFilterMenu or FolderAdvancedFilterMenu.
 */
const Toolbar: FC<ToolbarProps> = ({
  activeTab,
  onTabChange,
  query,
  onQueryChange,
  onCreatePredictor,
  onCreateDataset,
  onCreateFolder,
  filterControl,
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const createContainerRef = useRef<HTMLDivElement | null>(null);

  // Close the Create menu when clicking anywhere outside of it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!createOpen) return;
      if (
        createContainerRef.current &&
        !createContainerRef.current.contains(event.target as Node)
      ) {
        setCreateOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [createOpen]);

  return (
    <div className="mx-auto max-w-6xl px-2">
      <div className="flex flex-col gap-2 rounded-md md:flex-row md:items-center md:justify-between">
        {/* Left: tabs + search */}
        <div className="flex w-full items-center gap-2">
          {/* Tabs */}
          <div className="inline-flex h-9 overflow-hidden rounded-md border bg-white">
            <ToolbarTabButton
              isActive={activeTab === "predictors"}
              onClick={() => onTabChange("predictors")}
            >
              Predictors
            </ToolbarTabButton>
            <ToolbarTabButton
              isActive={activeTab === "datasets"}
              onClick={() => onTabChange("datasets")}
            >
              Datasets
            </ToolbarTabButton>
            <ToolbarTabButton
              isActive={activeTab === "folders"}
              onClick={() => onTabChange("folders")}
            >
              Folders
            </ToolbarTabButton>
          </div>

          {/* Search bar (to the right of tabs, still on the left side overall) */}
          <div className="flex-1 md:max-w-md">
            <SearchBar
              value={query}
              onChange={onQueryChange}
              onClear={() => onQueryChange("")}
              placeholder={
                activeTab === "predictors"
                  ? "Search your predictors…"
                  : activeTab === "datasets"
                  ? "Search your datasets…"
                  : "Search your folders…"
              }
            />
          </div>
        </div>

        {/* Right: filters + Create */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Filters (passed from Dashboard) */}
          {filterControl}

          {/* Create dropdown (rightmost) with outside-click close + animation */}
          <div
            ref={createContainerRef}
            className="relative inline-block text-left"
          >
            <button
              type="button"
              className="inline-flex h-9.5 cursor-pointer select-none items-center gap-1 rounded-md border bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-700"
              onClick={(e) => {
                e.stopPropagation();
                setCreateOpen((prev) => !prev);
              }}
              aria-expanded={createOpen}
            >
              Create
              <span
                className={`text-[20px] text-neutral-200 transition-transform ${
                  createOpen ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>

            <div
              className={`absolute right-0 z-30 mt-1 w-40 origin-top-right transform rounded-md border bg-white py-1 text-sm shadow-lg transition-all duration-150 ease-out ${
                createOpen
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none -translate-y-1 scale-95 opacity-0"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-neutral-800 hover:bg-neutral-50"
                onClick={() => {
                  setCreateOpen(false);
                  onCreatePredictor();
                }}
              >
                New predictor
              </button>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-neutral-800 hover:bg-neutral-50"
                onClick={() => {
                  setCreateOpen(false);
                  onCreateDataset();
                }}
              >
                New dataset
              </button>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-neutral-800 hover:bg-neutral-50"
                onClick={() => {
                  setCreateOpen(false);
                  onCreateFolder();
                }}
              >
                New folder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function ToolbarTabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 text-xs ${
        isActive
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

export default Toolbar;
