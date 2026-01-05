/**
 * FILTERING & SORTING TYPES
 * -----------------------------------------------------------------------------
 * Shared TypeScript models for search/filter/sort across predictors, datasets,
 * and folders.
 *
 * These are intentionally generic so they can be reused on:
 * - Dashboard (private workspace)
 * - Browse (public space)
 * - Folder views
 */

/**
 * Where keyword searches should look.
 * - "title": only the title/name field
 * - "notes": only the description/notes field
 * - "both": title OR notes
 */
export type KeywordTarget = "title" | "notes" | "both";

/**
 * Base filter state used by all entities.
 * Extend this for predictors/datasets/folders as needed.
 */
export interface BaseFilterState {
  /**
   * List of plain-text keywords.
   * UI can gather these from a text input (split on spaces) or a chips control.
   */
  keywords: string[];

  /** Where the keywords should be applied (title vs notes vs both). */
  keywordTarget: KeywordTarget;

  /**
   * Optional date range filters (inclusive).
   * Use YYYY-MM-DD strings for easier binding to <input type="date">.
   */
  dateFrom?: string;
  dateTo?: string;

  /**
   * Free-text username filter (e.g., owner username).
   * Backend/user lookup is handled separately; this is just the UI model.
   */
  username?: string;

  /**
   * Visibility filter for public/private items where applicable.
   * "all"   -> no visibility filtering
   * "public"  -> only non-private items
   * "private" -> only private items
   */
  visibility?: "all" | "public" | "private";

  /**
   * Ownership filter for logged-in views (Dashboard, etc.).
   * "all"    -> show everything you have access to
   * "owner"  -> only things you own
   * "viewer" -> things you can view but do not own
   */
  ownership?: "all" | "owner" | "viewer";
}

/**
 * Predictor-specific filters.
 * Currently no extra fields beyond BaseFilterState, but kept separate
 * for future expansion (e.g., model status, time_unit filters).
 */
export interface PredictorFilterState extends BaseFilterState {}

/**
 * Dataset-specific filters.
 * Adds size-related fields (in megabytes) for file-based filtering.
 */
export interface DatasetFilterState extends BaseFilterState {
  minSizeMB?: number;
  maxSizeMB?: number;
}

/**
 * Folder-specific filters.
 * Adds item-count and folder-type fields.
 */
export interface FolderFilterState extends BaseFilterState {
  /** Min/max number of items in the folder. */
  minItemCount?: number;
  maxItemCount?: number;

  /**
   * Basic content-type classifier for folders.
   * - "predictor-only": all items are predictors
   * - "dataset-only": all items are datasets
   * - "mixed": contains both
   */
  folderType?: "all" | "predictor-only" | "dataset-only" | "mixed";
}

/**
 * Sortable fields. Not every field will apply to every entity, but keeping
 * a shared union simplifies menus.
 *
 * - "title": alphabetical by display title/name
 * - "updatedAt": last updated / uploaded timestamp
 * - "item_count": number of items (folders)
 * - "sizeMB": dataset file size (MB)
 */
export type SortField = "title" | "updatedAt" | "item_count" | "sizeMB";

/** Sort direction for a given field. */
export type SortDirection = "asc" | "desc";

/**
 * Sort option used by sort menus and sorting helpers.
 * Example: { field: "updatedAt", direction: "desc" } -> Latest first.
 */
export interface SortOption {
  field: SortField;
  direction: SortDirection;
}
