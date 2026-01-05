/**
 * ----------------------------------------------------------------------------------
 * PredictorCard (thin)
 * ----------------------------------------------------------------------------------
 * - Composes CardShell to render a predictor, styled to match Browse cards.
 * - Shows owner tag in the eyebrow row and status/visibility chips in the footer.
 * - Owner sees View / Edit / Delete; viewer sees View only.
 * - Buttons appear with a staggered, “bubbly” animation when the card is selected.
 * - Supports drag and drop functionality for folder organization.
 * - Can optionally show a pin button (for Browse) and hide owner actions.
 * - Supports draft predictors: if ml_training_status === "not_trained",
 *   the Edit action can be routed to a dedicated draft editor via onDraftEdit.
 * ----------------------------------------------------------------------------------
 */

import CardShell from "./CardShell";
import DraggableCard from "./DraggableCard";
import UsernameTag from "./UsernameTag";
import type { DragItem } from "../types/dragDrop";
import { Eye, Pencil, Trash2 } from "lucide-react";

export interface PredictorItem {
  id: string;
  title: string;
  status?: "DRAFT" | "PUBLISHED";
  updatedAt?: string;
  updatedAtRaw?: string;
  owner?: boolean;
  ownerName?: string | null;
  notes?: string;
  dataset?: {
    id: string;
    title: string;
    time_unit: string;
    original_filename?: string;
  };
  isPublic?: boolean;
  pinned?: boolean;
  folderId?: string;
  folderName?: string;
  ml_selected_features?: string[] | string;
  ml_training_status?: string;
  ml_trained_at?: string;
  model_metadata?: {
    model_type?: string;
    n_features?: number;
  };
  // Additional model configuration fields
  model?: string;
  post_process?: string;
  time_bins?: number;
  activation?: string;
  neurons?: number[];
}

type PredictorCardProps = {
  item: PredictorItem;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  /** Called instead of onEdit when ml_training_status === "not_trained". */
  onDraftEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  onDrop?: (item: DragItem, folderId?: string) => void;
  isLoading?: boolean;

  /** If false, hide owner-only Edit/Delete (used by Browse). Defaults to true. */
  showOwnerActions?: boolean;
  /** If true, show the pin star button (for Browse). Defaults to false. */
  showPin?: boolean;
  /** Optional explicit pinned state; falls back to item.pinned if omitted. */
  isPinned?: boolean;
  /** Called when the pin star is toggled. */
  onTogglePin?: (id: string, nextPinned?: boolean) => void;
  /** If true, show a highlight animation for newly created predictors. */
  isNew?: boolean;
};

export default function PredictorCard({
  item,
  selected = false,
  onToggleSelect,
  onEdit,
  onDraftEdit,
  onDelete,
  onView,
  onDoubleClick,
  onDrop,
  isLoading = false,
  showOwnerActions = true,
  showPin = false,
  isPinned: isPinnedProp,
  onTogglePin,
  isNew = false,
}: PredictorCardProps) {
  const dragItem: DragItem = {
    id: item.id,
    type: "predictor",
    title: item.title,
    owner: Boolean(item.owner),
    folderId: item.folderId,
  };

  const ownerLabel =
    item.ownerName ?? (item.owner ? "You" : "Owner unknown");

  const visibilityLabel =
    typeof item.isPublic === "boolean"
      ? item.isPublic
        ? "Public"
        : "Private"
      : undefined;

  const isPinned =
    typeof isPinnedProp === "boolean" ? isPinnedProp : !!item.pinned;

  // Delays: keep Dashboard behaviour the same (no pin),
  // and when showPin=true just insert the pin between View and Edit.
  const viewDelay = 0;
  const pinDelay = 60;
  const editDelay = showPin ? 120 : 60;
  const deleteDelay = showPin ? 180 : 120;

  const displayUpdated = getDisplayDate(item.updatedAt, item.updatedAtRaw);

  const handleEditClick = () => {
    if (item.ml_training_status === "not_trained") {
      if (onDraftEdit) {
        onDraftEdit(item.id);
        return;
      }
    }
    onEdit?.(item.id);
  };

  const hasNotes = Boolean(item.notes && item.notes.trim().length > 0);

  return (
    <div
      className={
        isNew
          ? "animate-highlight-new rounded-lg ring-2 ring-emerald-500 ring-offset-2"
          : ""
      }
    >
      <DraggableCard item={dragItem} onDrop={onDrop} isLoading={isLoading}>
        <CardShell
          eyebrowLeft={
            <div className="inline-flex items-center gap-2 text-xs font-medium text-neutral-800">
              <UsernameTag name={ownerLabel} />
              {isNew && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 animate-pulse">
                  NEW
                </span>
              )}
            </div>
          }
          title={
            <div
              className={[
                "pt-1 text-sm font-semibold text-neutral-900",
                selected ? "line-clamp-2" : "truncate",
              ].join(" ")}
            >
              {item.title}
            </div>
          }
          description={
            hasNotes ? (
              <div
                className={[
                  "mt-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600",
                  selected ? "" : "line-clamp-4",
                ].join(" ")}
              >
                {item.notes}
              </div>
            ) : (
              <div className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-xs italic text-neutral-400">
                No description provided.
              </div>
            )
          }
          footerLeft={
            displayUpdated ? (
              <span className="text-[11px] text-neutral-500">
                Updated {displayUpdated}
              </span>
            ) : null
          }
          footerRight={
            <div className="flex flex-col items-end gap-1 text-[11px] text-neutral-600">
              {visibilityLabel && (
                <span
                  className={`rounded-full border px-2 py-[2px] text-[10px] ${
                    item.isPublic
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-neutral-900 bg-neutral-900 text-white"
                  }`}
                >
                  {visibilityLabel}
                </span>
              )}
              {item.status && (
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-[2px] text-[10px] tracking-wide">
                  {item.status}
                </span>
              )}
            </div>
          }
          selected={selected}
          onSelect={() => onToggleSelect?.(item.id)}
          onDoubleClick={() => onDoubleClick?.(item.id)}
          onActionAreaClick={(e) => {
            e.stopPropagation();
          }}
          actionVisibility="always"
        >
          <div className="flex w-full justify-end">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:gap-2">
              {/* View button (everyone) */}
              <button
                type="button"
                onClick={() => onView?.(item.id)}
                className={bubbleButtonClass(selected)}
                style={bubbleDelayStyle(selected, viewDelay)}
              >
                <Eye className="h-5 w-3" />
              </button>

              {/* Pin button (Browse, etc.) */}
              {showPin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !isPinned;
                    onTogglePin?.(item.id, next);
                  }}
                  className={[
                    bubbleButtonClass(selected),
                    isPinned ? "bg-neutral-200 hover:bg-neutral-300" : "",
                  ].join(" ")}
                  style={bubbleDelayStyle(selected, pinDelay)}
                  title={isPinned ? "Unpin" : "Pin"}
                  aria-label={isPinned ? "Unpin predictor" : "Pin predictor"}
                >
                  <span className="text-sm" aria-hidden="true">
                    {isPinned ? "★" : "☆"}
                  </span>
                </button>
              )}

              {/* Owner-only actions */}
              {item.owner && showOwnerActions && (
                <>
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className={bubbleButtonClass(selected)}
                    style={bubbleDelayStyle(selected, editDelay)}
                  >
                    <Pencil className="h-5 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete?.(item.id)}
                    className={bubbleDeleteButtonClass(selected)}
                    style={bubbleDelayStyle(selected, deleteDelay)}
                  >
                    <Trash2 className="h-5 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        </CardShell>
      </DraggableCard>
    </div>
  );
}

function bubbleButtonClass(selected: boolean) {
  return [
    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1",
    "text-[11px] font-medium text-neutral-700 bg-white shadow-sm hover:bg-neutral-200",
    "transform-gpu origin-left transition-all duration-200 ease-out",
    selected
      ? "opacity-100 translate-y-0 scale-100"
      : "pointer-events-none opacity-0 -translate-y-1 scale-90",
  ].join(" ");
}

function bubbleDeleteButtonClass(selected: boolean) {
  return [
    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1",
    "text-[11px] font-medium text-red-700 bg-red-50 border-red-200 shadow-sm",
    "hover:bg-red-100 hover:border-red-300 hover:text-red-800",
    "transform-gpu origin-left transition-all duration-200 ease-out",
    selected
      ? "opacity-100 translate-y-0 scale-100"
      : "pointer-events-none opacity-0 -translate-y-1 scale-90",
  ].join(" ");
}

function bubbleDelayStyle(selected: boolean, delayMs: number) {
  return selected
    ? { transitionDelay: `${delayMs}ms` }
    : { transitionDelay: "0ms" };
}

/**
 * Use raw ISO if available, otherwise fall back to updatedAt.
 * Always try to format as `Jan 1, 2025` when parseable.
 */
function getDisplayDate(
  updatedAt?: string,
  updatedAtRaw?: string
): string | undefined {
  const source = updatedAtRaw ?? updatedAt;
  if (!source) return undefined;

  const millis = Date.parse(source);
  if (Number.isNaN(millis)) {
    return updatedAt;
  }

  return new Date(millis).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
