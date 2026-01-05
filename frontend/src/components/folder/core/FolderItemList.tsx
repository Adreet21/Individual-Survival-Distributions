/**
 * ----------------------------------------------------------------------------------
 * FolderItemList
 * ----------------------------------------------------------------------------------
 * - Renders predictor and dataset items inside a folder.
 * - Shows per-item metadata and actions (View / Edit / Delete / Remove).
 * - Highlights selected items.
 *
 * Visual / accessibility cleanup:
 * - Replaces emoji icons with lucide-react icons.
 * - Uses higher-contrast text (gray-900 / gray-600) for readability.
 * - Normalizes chip/badge styles and action button styles.
 */

import { BrainCircuit, BarChart3 } from "lucide-react";

export interface BasicFolderItem {
  id: string;
  title: string;
  notes?: string;
  updatedAt?: string;
  status?: string;
  owner?: boolean;
  rows?: number;
  sizeMB?: number;
  itemType?: "predictor" | "dataset";
  type?: "predictor" | "dataset";
}

export interface FolderItemListProps {
  items: BasicFolderItem[];
  selectedItems?: Set<string>;

  onSelectItem?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onEditItem?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onDeleteItem?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onViewItem?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onRemoveFromFolder?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
}

export default function FolderItemList({
  items,
  selectedItems,
  onSelectItem,
  onRemoveFromFolder,
}: FolderItemListProps) {
  function effectiveType(
    it: BasicFolderItem
  ): "predictor" | "dataset" {
    if (it.itemType === "predictor" || it.type === "predictor")
      return "predictor";
    return "dataset";
  }

  const predictors = items.filter(
    (it) => effectiveType(it) === "predictor"
  );
  const datasets = items.filter(
    (it) => effectiveType(it) === "dataset"
  );

  function metaChips(
    it: BasicFolderItem,
    t: "predictor" | "dataset"
  ) {
    const chips: string[] = [];

    if (t === "predictor" && it.status) {
      chips.push(it.status);
    }

    if (t === "dataset") {
      if (typeof it.rows === "number") {
        chips.push(
          `${it.rows} row${it.rows === 1 ? "" : "s"}`
        );
      }
      if (typeof it.sizeMB === "number") {
        chips.push(`${it.sizeMB} MB`);
      }
    }

    if (it.updatedAt) {
      chips.push(it.updatedAt);
    }

    return chips;
  }

  function renderRow(it: BasicFolderItem) {
    const t = effectiveType(it);
    const isSelected = selectedItems?.has(it.id) ?? false;
    const chips = metaChips(it, t);

    return (
      <div
        key={it.id}
        className={`group rounded-lg border border-black/10 bg-white p-3 text-sm transition-colors ${
          isSelected
            ? "ring-2 ring-cobalt-500"
            : "hover:bg-gray-50"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectItem?.(it.id, t);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="flex-shrink-0 pt-0.5">
              {t === "predictor" ? (
                <BrainCircuit className="h-4 w-4 text-gray-600" />
              ) : (
                <BarChart3 className="h-4 w-4 text-gray-600" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900">
                {it.title}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-gray-600">
                {chips.map((piece, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                  >
                    {piece}
                  </span>
                ))}
              </div>

              {it.notes ? (
                <div className="mt-2 line-clamp-2 text-xs text-gray-600">
                  {it.notes}
                </div>
              ) : null}
            </div>
          </div>

          {isSelected && (
            <div className="flex flex-col items-end gap-2 text-xs">

              {onRemoveFromFolder && (
                <button
                  className="inline-flex items-center rounded-md border border-neutral-600 bg-neutral-100 px-2.5 py-1 text-black hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromFolder(it.id, t);
                  }}
                >
                  -
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {predictors.length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-700">
            Predictors ({predictors.length})
          </h5>
          <div className="space-y-2">
            {predictors.map((p) => renderRow(p))}
          </div>
        </div>
      )}

      {datasets.length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-700">
            Datasets ({datasets.length})
          </h5>
          <div className="space-y-2">
            {datasets.map((d) => renderRow(d))}
          </div>
        </div>
      )}
    </div>
  );
}
