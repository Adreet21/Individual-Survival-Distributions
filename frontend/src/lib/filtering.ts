/**
 * -----------------------------------------------------------------------------
 * Advanced Filtering & Sorting Helpers
 * -----------------------------------------------------------------------------
 * - Pure functions for filtering and sorting predictors, datasets, and folders.
 * - Designed to be shared between Dashboard, Browse, and folder views.
 *
 * Usage pattern:
 *   const filtered = filterPredictors(allPredictors, predictorFilters);
 *   const sorted   = sortPredictors(filtered, predictorSort);
 *
 * Notes:
 * - Keyword matching is case-insensitive and AND-based (all keywords must match).
 * - Date range filters expect YYYY-MM-DD (compatible with <input type="date">).
 * - Visibility / ownership filters are best-effort and only apply when the
 *   underlying metadata is available for that entity.
 */

import type { PredictorItem } from "../components/PredictorCard";
import type { DatasetItem } from "../components/DatasetCard";
import type { Folder } from "./folders";
import { getFolderContentType } from "./folderUtils";

import type {
  PredictorFilterState,
  DatasetFilterState,
  FolderFilterState,
  SortOption,
  KeywordTarget,
} from "../types/flitering";

/* ============================================================================
 * Internal helpers
 * ==========================================================================*/

/**
 * Normalize a list of keywords:
 * - trims whitespace
 * - drops empty entries
 * - keeps the original casing (comparison is case-insensitive later)
 */
function normalizeKeywords(raw?: string[]): string[] {
  if (!raw) return [];
  return raw.map((k) => k.trim()).filter((k) => k.length > 0);
}

/**
 * Compare two date-like strings safely.
 * Returns:
 *  - negative if a < b
 *  - positive if a > b
 *  - 0 if equal or unparsable
 */
function compareDateStrings(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const da = new Date(a);
  const db = new Date(b);

  if (!Number.isFinite(da.getTime()) && !Number.isFinite(db.getTime())) return 0;
  if (!Number.isFinite(da.getTime())) return -1;
  if (!Number.isFinite(db.getTime())) return 1;

  return da.getTime() - db.getTime();
}

/**
 * Parse a YYYY-MM-DD into a Date object at the *start* of the given day.
 */
function parseFilterDateStart(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Parse a YYYY-MM-DD into a Date object at the *end* of the given day.
 */
function parseFilterDateEnd(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Keyword matching for an item with a "title" field and an optional "notes" field.
 *
 * Behavior:
 * - If no keywords are provided, always returns true.
 * - "title"  -> all keywords must appear in the title.
 * - "notes"  -> all keywords must appear in the notes/description.
 * - "both"   -> all keywords must appear either in the title OR in the notes.
 */
function matchesKeywordsForItem(
  title: string | undefined,
  notes: string | undefined,
  keywords: string[],
  target: KeywordTarget
): boolean {
  if (!keywords.length) return true;

  const titleText = (title ?? "").toLowerCase();
  const notesText = (notes ?? "").toLowerCase();
  const loweredKeywords = keywords.map((k) => k.toLowerCase());

  const titleMatches = loweredKeywords.every((kw) => titleText.includes(kw));
  const notesMatches = loweredKeywords.every((kw) => notesText.includes(kw));

  switch (target) {
    case "title":
      return titleMatches;
    case "notes":
      return notesMatches;
    case "both":
    default:
      // "both" means title OR notes can match
      return titleMatches || notesMatches;
  }
}

/* ============================================================================
 * Predictors
 * ==========================================================================*/

/**
 * Filter predictors using PredictorFilterState.
 *
 * Supported:
 * - keywords      -> title / notes / both
 * - dateFrom/To   -> uses updatedAtRaw (if present)
 * - ownership     -> owner / viewer (derived from item.owner boolean)
 * - visibility    -> only applied if item.isPublic is defined
 * - username      -> TODO: wire in ownerName on PredictorItem if needed
 */
export function filterPredictors(
  items: PredictorItem[],
  filter: PredictorFilterState
): PredictorItem[] {
  const keywords = normalizeKeywords(filter.keywords);
  const keywordTarget: KeywordTarget = filter.keywordTarget ?? "both";
  const fromDate = parseFilterDateStart(filter.dateFrom);
  const toDate = parseFilterDateEnd(filter.dateTo);

  return items.filter((item) => {
    // Ownership: treat viewer as "not owner"
    if (filter.ownership === "owner" && !item.owner) {
      return false;
    }
    if (filter.ownership === "viewer" && item.owner) {
      return false;
    }

    // Visibility: only apply if we know the public/private status
    if (filter.visibility && filter.visibility !== "all" && item.isPublic !== undefined) {
      if (filter.visibility === "public" && !item.isPublic) return false;
      if (filter.visibility === "private" && item.isPublic) return false;
    }

    // Username: for predictors, this requires ownerName on PredictorItem.
    // If you later add `ownerName?: string | null` to PredictorItem + mapper,
    // you can uncomment this block:
    //
    // if (username) {
    //   const ownerName = (item as any).ownerName as string | undefined;
    //   if (!ownerName || !ownerName.toLowerCase().includes(username)) {
    //     return false;
    //   }
    // }

    // Date range: use updatedAtRaw if available
    if ((fromDate || toDate) && (item as any).updatedAtRaw) {
      const raw = (item as any).updatedAtRaw as string;
      const d = new Date(raw);
      if (Number.isFinite(d.getTime())) {
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
    }

    // Keyword matching on title/notes
    if (!matchesKeywordsForItem(item.title, item.notes, keywords, keywordTarget)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort predictors using a SortOption.
 *
 * Supported SortField:
 * - "title"     -> by item.title
 * - "updatedAt" -> by updatedAtRaw (fallback to display updatedAt)
 */
export function sortPredictors(
  items: PredictorItem[],
  sort: SortOption
): PredictorItem[] {
  const { field, direction } = sort;
  const factor = direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let cmp = 0;

    switch (field) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "updatedAt": {
        const aRaw = (a as any).updatedAtRaw ?? a.updatedAt;
        const bRaw = (b as any).updatedAtRaw ?? b.updatedAt;
        cmp = compareDateStrings(aRaw, bRaw);
        break;
      }
      default:
        // Ignore unsupported fields for predictors
        return 0;
    }

    return cmp * factor;
  });
}

/* ============================================================================
 * Datasets
 * ==========================================================================*/

/**
 * Filter datasets using DatasetFilterState.
 *
 * Supported:
 * - keywords      -> title / notes / both
 * - dateFrom/To   -> uses updatedAtRaw (if present) or falls back to updatedAt
 * - ownership     -> owner / viewer (derived from item.owner boolean)
 * - visibility    -> uses item.__raw.is_public if available
 * - username      -> ownerName
 * - minSizeMB/maxSizeMB -> dataset size filter
 */
export function filterDatasets(
  items: DatasetItem[],
  filter: DatasetFilterState
): DatasetItem[] {
  const keywords = normalizeKeywords(filter.keywords);
  const keywordTarget: KeywordTarget = filter.keywordTarget ?? "both";
  const fromDate = parseFilterDateStart(filter.dateFrom);
  const toDate = parseFilterDateEnd(filter.dateTo);
  const username = filter.username?.toLowerCase().trim() || "";
  const { minSizeMB, maxSizeMB } = filter;

  return items.filter((item) => {
    // Ownership: treat viewer as "not owner"
    if (filter.ownership === "owner" && !item.owner) {
      return false;
    }
    if (filter.ownership === "viewer" && item.owner) {
      return false;
    }

    // Visibility: use is_public from __raw if present
    if (filter.visibility && filter.visibility !== "all" && item.__raw) {
      const isPublic = (item.__raw as any).is_public as boolean | undefined;
      if (typeof isPublic === "boolean") {
        if (filter.visibility === "public" && !isPublic) return false;
        if (filter.visibility === "private" && isPublic) return false;
      }
    }

    // Username: basic substring match on ownerName
    if (username) {
      const ownerName = item.ownerName ?? "";
      if (!ownerName.toLowerCase().includes(username)) {
        return false;
      }
    }

    // Size filter (in MB)
    if (typeof minSizeMB === "number" && typeof item.sizeMB === "number") {
      if (item.sizeMB < minSizeMB) return false;
    }
    if (typeof maxSizeMB === "number" && typeof item.sizeMB === "number") {
      if (item.sizeMB > maxSizeMB) return false;
    }

    // Date range: prefer updatedAtRaw if present, else fall back
    const rawDate =
      (item as any).updatedAtRaw ??
      item.updatedAt ??
      (item.__raw ? (item.__raw as any).uploaded_at : undefined);

    if ((fromDate || toDate) && rawDate) {
      const d = new Date(rawDate);
      if (Number.isFinite(d.getTime())) {
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
    }

    // Keyword matching on title/notes
    if (!matchesKeywordsForItem(item.title, item.notes, keywords, keywordTarget)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort datasets using SortOption.
 *
 * Supported SortField:
 * - "title"     -> by item.title
 * - "updatedAt" -> by updatedAtRaw / updatedAt / uploaded_at
 * - "sizeMB"    -> by sizeMB
 */
export function sortDatasets(
  items: DatasetItem[],
  sort: SortOption
): DatasetItem[] {
  const { field, direction } = sort;
  const factor = direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let cmp = 0;

    switch (field) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "updatedAt": {
        const aRaw =
          (a as any).updatedAtRaw ??
          a.updatedAt ??
          (a.__raw ? (a.__raw as any).uploaded_at : undefined);
        const bRaw =
          (b as any).updatedAtRaw ??
          b.updatedAt ??
          (b.__raw ? (b.__raw as any).uploaded_at : undefined);
        cmp = compareDateStrings(aRaw, bRaw);
        break;
      }
      case "sizeMB": {
        const aSize = typeof a.sizeMB === "number" ? a.sizeMB : 0;
        const bSize = typeof b.sizeMB === "number" ? b.sizeMB : 0;
        cmp = aSize - bSize;
        break;
      }
      default:
        // Ignore unsupported fields for datasets
        return 0;
    }

    return cmp * factor;
  });
}

/* ============================================================================
 * Folders
 * ==========================================================================*/

/**
 * Filter folders using FolderFilterState.
 *
 * Supported:
 * - keywords      -> folder name (title) and description/items (notes)
 * - dateFrom/To   -> based on folder.updated_at
 * - ownership     -> owner/viewer using folder.owner + folder.permissions
 * - visibility    -> is_private
 * - username      -> folder.owner.username
 * - minItemCount/maxItemCount
 * - folderType    -> all / predictor-only / dataset-only / mixed (via getFolderContentType)
 */
export function filterFolders(
  folders: Folder[],
  filter: FolderFilterState,
  currentUserId?: number
): Folder[] {
  const keywords = normalizeKeywords(filter.keywords);
  const keywordTarget: KeywordTarget = filter.keywordTarget ?? "both";
  const fromDate = parseFilterDateStart(filter.dateFrom);
  const toDate = parseFilterDateEnd(filter.dateTo);
  const username = filter.username?.toLowerCase().trim() || "";
  const { minItemCount, maxItemCount, folderType } = filter;

  return folders.filter((folder) => {
    const isOwner = currentUserId ? folder.owner.id === currentUserId : false;
    const sharedWithUser =
      currentUserId !== undefined && currentUserId !== null
        ? folder.permissions?.some((perm) => perm.user.id === currentUserId) ??
          false
        : false;

    // Ownership (only if currentUserId is provided)
    if (filter.ownership === "owner") {
      if (!currentUserId || !isOwner) {
        return false;
      }
    } else if (filter.ownership === "viewer") {
      if (!currentUserId) {
        return false;
      }
      // Viewer = has permission but is not the owner
      if (!sharedWithUser || isOwner) {
        return false;
      }
    }

    // Visibility: public vs private
    if (filter.visibility === "public" && folder.is_private) {
      return false;
    }
    if (filter.visibility === "private" && !folder.is_private) {
      return false;
    }

    // Username filter - owner username substring match
    if (username) {
      const ownerName = folder.owner.username ?? "";
      if (!ownerName.toLowerCase().includes(username)) {
        return false;
      }
    }

    // Item count filter
    if (typeof minItemCount === "number" && folder.item_count < minItemCount) {
      return false;
    }
    if (typeof maxItemCount === "number" && folder.item_count > maxItemCount) {
      return false;
    }

    // Date range filter: use folder.updated_at
    if (fromDate || toDate) {
      const d = new Date(folder.updated_at);
      if (Number.isFinite(d.getTime())) {
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
    }

    // Folder content type filter
    if (folderType && folderType !== "all") {
      const actualType = getFolderContentType(folder);
      if (actualType !== folderType && actualType !== "all") {
        return false;
      }
    }

    // Keyword match:
    // - "title"   -> folder.name only
    // - "notes"   -> description + item titles/notes
    // - "both"    -> name OR description/items
    const title = folder.name;
    const notesPieces: string[] = [];

    if (folder.description) {
      notesPieces.push(folder.description);
    }

    if (folder.items && folder.items.length > 0) {
      for (const item of folder.items) {
        if ((item as any).title) {
          notesPieces.push((item as any).title);
        }
        if ((item as any).notes) {
          notesPieces.push((item as any).notes);
        }
      }
    }

    const notes = notesPieces.join(" • ");

    if (!matchesKeywordsForItem(title, notes, keywords, keywordTarget)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort folders using SortOption.
 *
 * Supported SortField:
 * - "title"      -> by folder.name
 * - "updatedAt"  -> by updated_at
 * - "item_count" -> by item_count
 *
 * Note: This does NOT replace folderUtils.sortFolders (which uses a different
 * FolderSortOption type). Use this from the new unified "Order by" menu.
 */
export function sortFoldersBySortOption(
  folders: Folder[],
  sort: SortOption
): Folder[] {
  const { field, direction } = sort;
  const factor = direction === "asc" ? 1 : -1;

  return [...folders].sort((a, b) => {
    let cmp = 0;

    switch (field) {
      case "title":
        cmp = a.name.localeCompare(b.name);
        break;
      case "updatedAt":
        cmp = compareDateStrings(a.updated_at, b.updated_at);
        break;
      case "item_count":
        cmp = a.item_count - b.item_count;
        break;
      default:
        // Ignore unsupported fields for folders (e.g., "sizeMB")
        return 0;
    }

    return cmp * factor;
  });
}
