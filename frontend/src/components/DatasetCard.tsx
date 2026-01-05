/**
 * ----------------------------------------------------------------------------------
 * DatasetCard (thin)
 * ----------------------------------------------------------------------------------
 * - Composes CardShell to render a dataset, styled to match Browse cards.
 * - Shows owner tag in the eyebrow row and rows/size/file icon in footer.
 * - Owner sees View / Edit / Download / Delete; viewer sees View / Download.
 * - Buttons appear with a staggered, “bubbly” animation when the card is selected.
 * - Supports drag and drop functionality for folder organization.
 * - Can optionally show a pin button (for Browse) and hide owner actions.
 * ----------------------------------------------------------------------------------
 */

import CardShell from "./CardShell";
import DraggableCard from "./DraggableCard";
import UsernameTag from "./UsernameTag";
import type { DragItem } from "../types/dragDrop";
import { Eye, Pencil, Trash2, Download as DownloadIcon } from "lucide-react";

export interface DatasetItem {
  id: string;
  title: string;
  owner: boolean;
  ownerId?: number | null;
  ownerName?: string | null;
  updatedAt?: string;
  updatedAtRaw?: string;
  notes?: string;
  rows?: number;
  sizeMB?: number;
  hasFile?: boolean;
  originalFilename?: string;
  folderId?: string;
  folderName?: string;
  allow_admin_access?: boolean;
  isPublic?: boolean;
  __raw?: any;
}

type DatasetCardProps = {
  item: DatasetItem;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
  onDownload?: (id: string, allowAdminAccess?: boolean) => void;
  onDrop?: (item: DragItem, folderId?: string) => void;
  isLoading?: boolean;

  /** If false, hide owner-only Edit/Delete (used by Browse). Defaults to true. */
  showOwnerActions?: boolean;
  /** If true, show the pin star button (used by Browse). Defaults to false. */
  showPin?: boolean;
  /** Optional explicit pinned state. */
  isPinned?: boolean;
  /** Called when the pin star is toggled. */
  onTogglePin?: (id: string, nextPinned?: boolean) => void;
  /** If true, show a highlight animation for newly created datasets. */
  isNew?: boolean;
};

export default function DatasetCard({
  item,
  selected = false,
  onToggleSelect,
  onEdit,
  onDelete,
  onView,
  onDownload,
  onDrop,
  isLoading = false,
  showOwnerActions = true,
  showPin = false,
  isPinned: isPinnedProp,
  onTogglePin,
  isNew = false,
}: DatasetCardProps) {
  const dragItem: DragItem = {
    id: item.id,
    type: "dataset",
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

  const isPinned = typeof isPinnedProp === "boolean" ? isPinnedProp : false;

  // Delays: keep Dashboard behaviour when showPin=false,
  // and insert pin between View and the other actions when showPin=true.
  const viewDelay = 0;
  const pinDelay = 60;
  const editDelay = showPin ? 120 : 60;

  // For download/delete we branch a bit depending on whether owner actions are shown.
  const ownerDownloadDelay = showPin
    ? showOwnerActions
      ? 180
      : 120
    : showOwnerActions
    ? 120
    : 60;

  const deleteDelay = showPin ? 240 : 180;

  const viewerDownloadDelay = showPin ? 120 : 60;

  const displayUpdated = getDisplayDate(item.updatedAt, item.updatedAtRaw);

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
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-900">
                {item.title}
              </div>
            </div>
          }
          description={
            item.notes ? (
              <div className="mt-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600 line-clamp-4">
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
              {typeof item.rows === "number" && (
                <span>{item.rows.toLocaleString()} rows</span>
              )}

              {item.hasFile && item.originalFilename && (
                <div className="flex flex-col items-end gap-1">
                  {typeof item.sizeMB === "number" && (
                    <span>{item.sizeMB} MB</span>
                  )}

                  <span
                    className="inline-flex max-w-[9rem] items-center rounded-md border bg-neutral-50 px-2 py-[1px]"
                    title={`File: ${item.originalFilename}`}
                  >
                    ▦
                    <span className="ml-1 truncate">
                      {item.originalFilename}
                    </span>
                  </span>

                  {visibilityLabel && (
                    <span
                      className={`mt-0.5 rounded-full border px-2 py-[2px] text-[10px] ${
                        item.isPublic
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-neutral-900 bg-neutral-900 text-white"
                      }`}
                    >
                      {visibilityLabel}
                    </span>
                  )}
                </div>
              )}

              {/* If there is no file, still show privacy underneath rows/date */}
              {!item.hasFile && visibilityLabel && (
                <span
                  className={`mt-0.5 rounded-full border px-2 py-[2px] text-[10px] ${
                    item.isPublic
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-neutral-900 bg-neutral-900 text-white"
                  }`}
                >
                  {visibilityLabel}
                </span>
              )}
            </div>
          }
          selected={selected}
          onSelect={() => onToggleSelect?.(item.id)}
          onActionAreaClick={(e) => {
            e.stopPropagation();
          }}
          // Keep header row space always reserved; buttons control their own visibility
          actionVisibility="always"
        >
          {/* View button (everyone) */}
          <button
            type="button"
            onClick={() => onView?.(item.id)}
            className={bubbleButtonClass(selected)}
            style={bubbleDelayStyle(selected, viewDelay)}
          >
            <Eye className="h-5 w-3" />
          </button>

          {/* Pin button (Browse etc.) */}
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
              aria-label={isPinned ? "Unpin dataset" : "Pin dataset"}
            >
              <span className="text-sm" aria-hidden="true">
                {isPinned ? "★" : "☆"}
              </span>
            </button>
          )}

          {/* Owner-only controls */}
          {item.owner && showOwnerActions && (
            <>
              <button
                type="button"
                onClick={() => onEdit?.(item.id)}
                className={bubbleButtonClass(selected)}
                style={bubbleDelayStyle(selected, editDelay)}
              >
                <Pencil className="h-5 w-3" />
              </button>

              {item.hasFile && onDownload && (
                <button
                  type="button"
                  onClick={() =>
                    onDownload(item.id, item.allow_admin_access ?? true)
                  }
                  className={bubbleButtonClass(selected)}
                  style={bubbleDelayStyle(selected, ownerDownloadDelay)}
                  title="Download file"
                >
                  <DownloadIcon className="h-5 w-3" />
                </button>
              )}

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

          {/* Viewer-only controls */}
          {!item.owner && item.hasFile && onDownload && (
            <button
              type="button"
              onClick={() =>
                onDownload(item.id, item.allow_admin_access ?? true)
              }
              className={bubbleButtonClass(selected)}
              style={bubbleDelayStyle(selected, viewerDownloadDelay)}
              title="Download file"
            >
              <DownloadIcon className="h-3 w-3" />
            </button>
          )}
        </CardShell>
      </DraggableCard>
    </div>
  );
}

function bubbleButtonClass(selected: boolean) {
  return [
    "inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-1",
    "text-[11px] font-medium text-neutral-700 bg-white shadow-sm hover:bg-neutral-200",
    // Let buttons wrap into a 2×2 grid when horizontal space is tight
    "shrink-0 basis-[48%] sm:basis-auto",
    "transform-gpu origin-right transition-all duration-200 ease-out",
    selected
      ? "opacity-100 translate-y-0 scale-100"
      : "pointer-events-none opacity-0 -translate-y-1 scale-90",
  ].join(" ");
}

function bubbleDeleteButtonClass(selected: boolean) {
  return [
    "inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-1",
    "text-[11px] font-medium text-red-700 bg-red-50 border-red-200 shadow-sm",
    "hover:bg-red-100 hover:border-red-300 hover:text-red-800",
    // Same wrapping behaviour as normal buttons
    "shrink-0 basis-[48%] sm:basis-auto",
    "transform-gpu origin-right transition-all duration-200 ease-out",
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
    // assume updatedAt is already user-facing text
    return updatedAt;
  }

  return new Date(millis).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
