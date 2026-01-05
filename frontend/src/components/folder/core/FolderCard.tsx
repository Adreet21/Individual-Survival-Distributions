/**
 * ----------------------------------------------------------------------------------
 * FolderCard
 * ----------------------------------------------------------------------------------
 * - Shows a folder, its metadata, and optionally its contents.
 * - Click on the card:
 *    - selects the folder,
 *    - shows the bubble action buttons (Edit / Share / Delete / Pin).
 * - Click the wide "Show/Hide items" button to expand/collapse the contents.
 * - Description:
 *    - collapsed: single line with ellipsis,
 *    - expanded: full multi-line text.
 * - Styled/animated to feel like DatasetCard:
 *    - hover lift + shadow
 *    - selected outline
 *    - bubble buttons with staggered animation.
 * ----------------------------------------------------------------------------------
 */

import { useState } from "react";
import DroppableFolder from "./DroppableFolder";
import FolderItemList from "./FolderItemList";
import PrivacyBadge from "../../PrivacyBadge";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Users,
  Pencil,
  Trash2,
  Share,
} from "lucide-react";
import type { DragItem } from "../../../types/dragDrop";

export interface FolderCardProps {
  folder: any;
  expanded: boolean;
  onToggleExpand: (folderId: string) => void;

  onItemSelect?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onItemEdit?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onItemDelete?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onItemView?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;
  onRemoveFromFolder?: (
    itemId: string,
    itemType: "predictor" | "dataset"
  ) => void;

  onEdit?: (folderId: string) => void;
  onDelete?: (folderId: string) => void;
  onShare?: (folderId: string) => void;
  onDrop?: (item: DragItem, targetFolderId?: string) => void;
  selectedItems?: Set<string>;
  currentUserId?: string | number | undefined;
  canEdit: boolean;
  isLoading?: boolean;

  selected?: boolean;
  onToggleSelect?: (folderId: string) => void;

  showPin?: boolean;
  isPinned?: boolean;
  onTogglePin?: (folderId: string, nextPinned?: boolean) => void;
  /** If true, show a highlight animation for newly created folders. */
  isNew?: boolean;
}

export default function FolderCard({
  folder,
  expanded,
  onToggleExpand,
  onItemSelect,
  onItemEdit,
  onItemDelete,
  onItemView,
  onRemoveFromFolder,
  onEdit,
  onDelete,
  onShare,
  onDrop,
  selectedItems,
  currentUserId,
  canEdit,
  isLoading,
  selected,
  onToggleSelect,
  showPin = false,
  isPinned: isPinnedProp,
  onTogglePin,
  isNew = false,
}: FolderCardProps) {
  const isOwner =
    currentUserId && folder?.owner?.id
      ? String(folder.owner.id) === String(currentUserId)
      : false;

  const items = Array.isArray(folder.items) ? folder.items : [];
  const totalCount = folder.item_count ?? items.length ?? 0;

  // Distinguish predictors vs datasets
  const predictorCount = items.filter((it: any) => {
    const t = (it.type ?? it.item_type ?? "").toString().toLowerCase();
    return t === "predictor";
  }).length;

  const datasetCount = items.filter((it: any) => {
    const t = (it.type ?? it.item_type ?? "").toString().toLowerCase();
    return t === "dataset";
  }).length;

  const countsLabel =
    predictorCount || datasetCount
      ? [
          predictorCount
            ? `${predictorCount} predictor${predictorCount !== 1 ? "s" : ""}`
            : null,
          datasetCount
            ? `${datasetCount} dataset${datasetCount !== 1 ? "s" : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" • ")
      : `${totalCount} item${totalCount !== 1 ? "s" : ""}`;

  const canManage = canEdit && (isOwner || folder.can_manage);
  const isPinned = typeof isPinnedProp === "boolean" ? isPinnedProp : false;

  // Controlled vs uncontrolled selection
  const isControlled = typeof selected === "boolean" && !!onToggleSelect;
  const [internalSelected, setInternalSelected] = useState(false);
  const isSelected = isControlled ? Boolean(selected) : internalSelected;

  const actionsVisible = canManage && isSelected;
  const editDelay = 0;
  const pinDelay = 60;
  const shareDelay = showPin ? 120 : 60;
  const deleteDelay = showPin ? 180 : 120;
  const expandDelay = 0;

  const handleToggleExpand = () => {
    onToggleExpand(folder.folder_id);
  };

  const handleSelectCard = () => {
    // Controlled mode: parent owns selected/expanded. We just request toggles.
    if (isControlled) {
      if (!onToggleSelect) return;

      // If already selected + expanded, clicking again should collapse then deselect.
      if (selected && expanded) {
        onToggleExpand(folder.folder_id);
      }

      onToggleSelect(folder.folder_id);
      return;
    }

    // Uncontrolled mode: FolderCard manages its own "selected".
    setInternalSelected((prev) => {
      const next = !prev;
      // If we are deselecting while expanded, collapse.
      if (prev && expanded) {
        onToggleExpand(folder.folder_id);
      }
      return next;
    });
  };

  const rawDescription =
    typeof folder.description === "string"
      ? folder.description.trim()
      : "";

  const hasDescription = rawDescription.length > 0;

  const displayUpdated = getDisplayDate(
    folder.updated_at_raw ?? folder.updated_at ?? folder.updated
  );
  const updatedLabel = displayUpdated ? `Updated ${displayUpdated}` : null;

  const shellClassName = [
    "rounded-xl border bg-white shadow-sm",
    "transition-all duration-150",
    "hover:-translate-y-[1px] hover:shadow-md hover:border-black",
    isSelected
      ? "border-neutral-900 ring-1 ring-neutral-900/60"
      : "border-black/10",
    isLoading ? "opacity-60" : "",
  ].join(" ");

  return (
    <div
      className={
        isNew
          ? "animate-highlight-new rounded-xl ring-2 ring-emerald-500 ring-offset-2"
          : ""
      }
    >
      <DroppableFolder
        folder={folder}
        isLoading={(_itemId: string) => Boolean(isLoading)}
        onDrop={onDrop}
        className={shellClassName}
      >
      {/* Clicking anywhere in the card (except buttons) selects it */}
      <div className="p-5" onClick={handleSelectCard}>
        {/* Top row: title left, actions right */}
        <div className="flex items-start justify-between gap-3">
          {/* Left: icon + title */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FolderOpen className="h-5 w-5 shrink-0 text-neutral-700" />
            <span className="truncate text-sm font-semibold text-neutral-900">
              {folder.name}
            </span>
            {isNew && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 animate-pulse">
                NEW
              </span>
            )}
          </div>

          {/* Right: action bubbles (Edit / Share / Pin / Delete) */}
          {canManage && (
            <div
              className="flex flex-wrap items-center justify-end gap-1 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {onEdit && (
                <button
                  type="button"
                  className={bubbleButtonClass(actionsVisible)}
                  style={bubbleDelayStyle(actionsVisible, editDelay)}
                  onClick={() => onEdit(folder.folder_id)}
                  title="Edit folder"
                  aria-label="Edit folder"
                >
                  <Pencil className="h-5 w-3" />
                </button>
              )}

              {showPin && onTogglePin && (
                <button
                  type="button"
                  className={[
                    bubbleButtonClass(actionsVisible),
                    isPinned ? "bg-neutral-200 hover:bg-neutral-300" : "",
                  ].join(" ")}
                  style={bubbleDelayStyle(actionsVisible, pinDelay)}
                  onClick={() => onTogglePin(folder.folder_id, !isPinned)}
                  title={isPinned ? "Unpin folder" : "Pin folder"}
                  aria-label={isPinned ? "Unpin folder" : "Pin folder"}
                >
                  <span className="text-sm" aria-hidden="true">
                    {isPinned ? "★" : "☆"}
                  </span>
                </button>
              )}

              {onShare && (
                <button
                  type="button"
                  className={bubbleButtonClass(actionsVisible)}
                  style={bubbleDelayStyle(actionsVisible, shareDelay)}
                  onClick={() => onShare(folder.folder_id)}
                  title="Share folder"
                  aria-label="Share folder"
                >
                  <Share className="h-5 w-3" />
                </button>
              )}

              {onDelete && (
                <button
                  type="button"
                  className={bubbleDeleteButtonClass(actionsVisible)}
                  style={bubbleDelayStyle(actionsVisible, deleteDelay)}
                  onClick={() => onDelete(folder.folder_id)}
                  title="Delete folder"
                  aria-label="Delete folder"
                >
                  <Trash2 className="h-5 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-1 flex justify-end pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand();
              }}
              className={[bubbleButtonClass(isSelected), "px-5"].join(" ")}
              style={bubbleDelayStyle(isSelected, expandDelay)}
            >
              <span className="mr-1 text-[11px] font-medium">
                {expanded ? "Hide items" : "Show items"}
              </span>
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        )}

        <div className="mt-1 text-xs text-neutral-600">{countsLabel}</div>

        {hasDescription && (
          <div className="mt-2 rounded-md bg-neutral-200 px-3 py-2 text-[11px] leading-snug text-neutral-700">
            <span
              className={
                expanded
                  ? "block whitespace-pre-wrap"
                  : "block overflow-hidden text-ellipsis whitespace-nowrap"
              }
            >
              {rawDescription}
            </span>
          </div>
        )}

        {/* Base row: updated/owner/sharing left, privacy pill right */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {updatedLabel && <span>{updatedLabel}</span>}

            {!isOwner && folder?.owner?.username && (
              <span>by {folder.owner.username}</span>
            )}

            {Array.isArray(folder.permissions) &&
              folder.permissions.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-neutral-400" />
                  <span>
                    shared with {folder.permissions.length} user
                    {folder.permissions.length !== 1 ? "s" : ""}
                  </span>
                </span>
              )}
          </div>

          <div>
            <PrivacyBadge isPublic={!folder.is_private} />
          </div>
        </div>

        {/* Small inline loading indicator only */}
        {isLoading && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
            <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-neutral-700" />
            <span>Working...</span>
          </div>
        )}
      </div>

      {/* Expanded contents */}
      {expanded && (
        <div className="border-t border-black/10 p-3">
          {items.length === 0 ? (
            <div className="py-4 text-center text-sm text-neutral-500">
              {isLoading ? "Loading items..." : "No items in this folder"}
            </div>
          ) : (
            <FolderItemList
              items={items}
              selectedItems={selectedItems}
              onSelectItem={onItemSelect}
              onEditItem={onItemEdit}
              onDeleteItem={onItemDelete}
              onViewItem={onItemView}
              onRemoveFromFolder={onRemoveFromFolder}
            />
          )}
        </div>
      )}
      </DroppableFolder>
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

function getDisplayDate(source?: string): string | undefined {
  if (!source) return undefined;

  const millis = Date.parse(source);
  if (Number.isNaN(millis)) {
    return source;
  }

  return new Date(millis).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
