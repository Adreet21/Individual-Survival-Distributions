/**
 * FOLDERS API HELPERS
 * -----------------------------------------------------------------------------
 * Server routes (backend folder endpoints):
 *   GET  /api/folders/                    -> list user's accessible folders
 *   POST /api/folders/                    -> create new folder
 *   GET  /api/folders/{id}/               -> get folder details
 *   PATCH /api/folders/{id}/              -> update folder (name, privacy)
 *   DELETE /api/folders/{id}/             -> delete folder
 *   GET  /api/folders/{id}/items/         -> list folder contents
 *   POST /api/folders/{id}/items/         -> add item to folder
 *   DELETE /api/folders/{id}/items/{item}/ -> remove item from folder
 *   GET  /api/folders/public/             -> list public folders
 *   GET  /api/folders/{id}/public/        -> get public folder contents
 *   GET  /api/folders/{id}/permissions/   -> list folder permissions
 *   POST /api/folders/{id}/permissions/   -> grant folder access
 *   DELETE /api/folders/{id}/permissions/{user}/ -> revoke access
 *   GET  /api/folders/pins/               -> list pinned folders
 *   POST /api/folders/pins/               -> pin a folder
 *   DELETE /api/folders/pins/{id}/        -> unpin a folder
 *
 * Auth: JWT (Authorization: Bearer <access>), handled by apiClient automatically.
 */

import { api, publicApi } from "./apiClient";
import type { PredictorItem } from "../components/PredictorCard";
import type { DatasetItem } from "../components/DatasetCard";

// Core folder data types based on the design document
export interface User {
  id: number;
  username: string;
  email?: string;
}

export interface Folder {
  folder_id: string;
  name: string;
  description?: string;
  owner: User;
  is_private: boolean;
  item_count: number;
  public_item_count: number;
  created_at: string;
  updated_at: string;
  items?: Array<PredictorItem | DatasetItem>;
  permissions?: FolderPermission[];
}

export interface FolderItem {
  folder_id: string;
  item_type: 'predictor' | 'dataset';
  item_id: string;
  added_at: string;
  added_by: User;
}

export interface FolderPermission {
  folder: string; // folder_id
  user: User;
  permission_type: 'view';
  granted_at: string;
  granted_by: User;
}

// Request/Response types for API operations
export interface CreateFolderRequest {
  name: string;
  description?: string;
  is_private?: boolean;
  initial_items?: Array<{
    item_type: 'predictor' | 'dataset';
    item_id: string;
  }>;
}

export interface UpdateFolderRequest {
  name?: string;
  description?: string;
  is_private?: boolean;
}

export interface AddItemToFolderRequest {
  item_type: 'predictor' | 'dataset';
  item_id: string;
}

/**
 * Response from adding an item to a folder
 * The backend should return the updated folder counts to avoid additional API calls
 */
export interface AddItemToFolderResponse {
  message: string;
  folder_id: string;
  item_count: number;
  public_item_count: number;
  was_duplicate?: boolean; // True if item was already in folder
}

/**
 * Response from removing an item from a folder
 * The backend should return the updated folder counts to avoid additional API calls
 */
export interface RemoveItemFromFolderResponse {
  message: string;
  folder_id: string;
  item_count: number;
  public_item_count: number;
}

export interface GrantFolderPermissionRequest {
  user_id: number;
  permission_type: 'view';
}

// Error types for folder-specific operations
export const FolderErrorCodes = {
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  DUPLICATE_FOLDER_NAME: 'DUPLICATE_FOLDER_NAME',
  ITEM_ALREADY_IN_FOLDER: 'ITEM_ALREADY_IN_FOLDER',
  INVALID_DROP_TARGET: 'INVALID_DROP_TARGET',
  FOLDER_LIMIT_EXCEEDED: 'FOLDER_LIMIT_EXCEEDED'
} as const;

export type FolderErrorCode = typeof FolderErrorCodes[keyof typeof FolderErrorCodes];

export interface FolderError {
  code: FolderErrorCode;
  message: string;
  details?: any;
}

// Folder CRUD operations
export async function listMyFolders(): Promise<Folder[]> {
  return api.get<Folder[]>("/api/folders/");
}

export async function listMyOwnedFolders(): Promise<Folder[]> {
  return api.get<Folder[]>("/api/folders/?owned_only=true");
}

export async function createFolder(request: CreateFolderRequest): Promise<Folder> {
  return api.post<Folder>("/api/folders/", request);
}

export async function getFolder(folderId: string): Promise<Folder> {
  return api.get<Folder>(`/api/folders/${folderId}/`);
}

export async function updateFolder(folderId: string, request: UpdateFolderRequest): Promise<Folder> {
  return api.patch<Folder>(`/api/folders/${folderId}/`, request);
}

export async function deleteFolder(folderId: string): Promise<void> {
  return api.del(`/api/folders/${folderId}/`);
}

// Folder content management
export async function getFolderItems(folderId: string): Promise<Array<PredictorItem | DatasetItem>> {
  return api.get<Array<PredictorItem | DatasetItem>>(`/api/folders/${folderId}/items/`);
}

export async function addItemToFolder(folderId: string, request: AddItemToFolderRequest): Promise<void> {
  return api.post(`/api/folders/${folderId}/items/`, request);
}

export async function removeItemFromFolder(folderId: string, itemType: 'predictor' | 'dataset', itemId: string): Promise<void> {
  return api.del(`/api/folders/${folderId}/items/remove/`, {
    item_type: itemType,
    item_id: itemId
  });
}

// Public folder operations (no authentication required)
export async function listPublicFolders(): Promise<Folder[]> {
  return publicApi.get<Folder[]>("/api/folders/public/");
}

export async function getPublicFolderContents(folderId: string): Promise<Array<PredictorItem | DatasetItem>> {
  return publicApi.get<Array<PredictorItem | DatasetItem>>(`/api/folders/${folderId}/public/`);
}

// Folder permission management
export async function getFolderPermissions(folderId: string): Promise<FolderPermission[]> {
  return api.get<FolderPermission[]>(`/api/folders/${folderId}/permissions/`);
}

export async function grantFolderPermission(folderId: string, request: GrantFolderPermissionRequest): Promise<FolderPermission> {
  return api.post<FolderPermission>(`/api/folders/${folderId}/permissions/grant/`, request);
}

export async function revokeFolderPermission(folderId: string, userId: number): Promise<void> {
  return api.post(`/api/folders/${folderId}/permissions/revoke/`, { user_id: userId });
}

// Utility functions for error handling
export function isFolderError(error: any): error is FolderError {
  return error && typeof error.code === 'string' && Object.values(FolderErrorCodes).includes(error.code);
}

export function createFolderError(code: FolderErrorCode, message: string, details?: any): FolderError {
  return { code, message, details };
}

// Helper function to handle API errors and convert them to FolderError
export function handleFolderApiError(error: any): FolderError {
  if (error.status === 404) {
    return createFolderError(FolderErrorCodes.FOLDER_NOT_FOUND, 'Folder not found', error.details);
  }
  if (error.status === 403) {
    return createFolderError(FolderErrorCodes.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions', error.details);
  }
  if (error.status === 400 && error.details?.name) {
    return createFolderError(FolderErrorCodes.DUPLICATE_FOLDER_NAME, 'Folder name already exists', error.details);
  }
  if (error.status === 400 && error.details?.item) {
    return createFolderError(FolderErrorCodes.ITEM_ALREADY_IN_FOLDER, 'Item already in folder', error.details);
  }

  // Generic error fallback
  return createFolderError(
    FolderErrorCodes.FOLDER_NOT_FOUND,
    error.statusText || 'Unknown folder operation error',
    error.details
  );
}

/**
 * Convert folder item from API format to UI format
 */
function mapFolderItemToUi(folderItem: any): any {
  const itemType = folderItem.item_type;
  const baseItem = {
    id: String(folderItem.item_id ?? ""),
    title: folderItem.item_name ?? "Untitled",
    owner: folderItem.item_owner === folderItem.added_by_name, // Assume owner if names match
    notes: "", // Not available in folder item serializer
    updatedAt: folderItem.item_updated_at,
    folderId: String(folderItem.folder ?? ""),
  };

  if (itemType === 'predictor') {
    return {
      ...baseItem,
      status: folderItem.item_privacy ? "DRAFT" : "PUBLISHED", // Rough mapping
    };
  } else if (itemType === 'dataset') {
    return {
      ...baseItem,
      sizeMB: undefined, // Not available in folder item serializer
      hasFile: true, // Assume datasets have files
    };
  }

  return baseItem;
}

/**
 * Mapper function from API Folder to UI Folder
 * Ensures consistent data structure for frontend components
 */
export function mapApiFolderToUi(item: any): Folder {
  // Map folder items to the expected UI format
  const mappedItems = (item.items ?? []).map(mapFolderItemToUi);

  return {
    folder_id: String(item.folder_id ?? item.id ?? ""),
    name: item.name ?? "Untitled Folder",
    description: item.description ?? "",
    owner: {
      id: item.owner?.id ?? item.owner_id ?? item.owner ?? 0,
      username: item.owner?.username ?? item.owner_name ?? "Unknown",
      email: item.owner?.email
    },
    is_private: Boolean(item.is_private ?? false),
    item_count: item.item_count ?? 0,
    public_item_count: item.public_item_count ?? 0,
    created_at: item.created_at ?? new Date().toISOString(),
    updated_at: item.updated_at ?? new Date().toISOString(),
    items: mappedItems,
    permissions: item.permissions ?? []
  };
}

/**
 * Type guard to check if an item is a folder
 */
export function isFolder(item: any): item is Folder {
  return item && typeof item.folder_id === 'string' && typeof item.name === 'string';
}

/**
 * Helper to determine if current user owns a folder
 */
export function isOwner(folder: Folder, currentUserId?: number): boolean {
  if (!currentUserId) return false;
  return folder.owner.id === currentUserId;
}

/**
 * Helper to determine if a folder should be visible to public users
 */
export function isVisibleToPublic(folder: Folder): boolean {
  return !folder.is_private && folder.public_item_count > 0;
}

/**
 * Helper to determine if current user can access a folder
 */
export function canAccessFolder(folder: Folder, currentUserId?: number): boolean {
  if (!currentUserId) {
    // Anonymous users can only see public folders with public content
    return isVisibleToPublic(folder);
  }

  // Owner can always access
  if (folder.owner.id === currentUserId) {
    return true;
  }

  // Check if user has explicit permission
  if (folder.permissions?.some(p => p.user.id === currentUserId)) {
    return true;
  }

  // Authenticated users can see public folders with public content
  return isVisibleToPublic(folder);
}

/**
 * Helper to determine if current user can manage a folder (edit, delete, share)
 */
export function canManageFolder(folder: Folder, currentUserId?: number): boolean {
  return currentUserId ? folder.owner.id === currentUserId : false;
}

/**
 * Helper to determine if the folder is owned by the user or explicitly shared with them.
 * This excludes purely public visibility so Dashboard views don't pull in public folders.
 */
export function isOwnedOrSharedFolder(
  folder: Folder,
  currentUserId?: number
): boolean {
  if (!currentUserId) return false;
  if (folder.owner.id === currentUserId) return true;

  return (
    folder.permissions?.some((perm) => perm.user.id === currentUserId) ?? false
  );
}

/**
 * Helper to get the appropriate item count for display based on user permissions
 */
export function getVisibleItemCount(folder: Folder, _currentUserId?: number): number {
  // The backend now correctly returns only the items the user can see in the items array
  // So we can simply return the length of the items array
  return folder.items?.length ?? 0;
}

// Folder management operations
export interface DuplicateFolderRequest {
  name: string;
  description?: string;
  is_private?: boolean;
}

export interface BulkMoveItemsRequest {
  source_folder_id?: string;
  target_folder_id?: string;
  items: Array<{
    item_type: 'predictor' | 'dataset';
    item_id: string;
  }>;
}

export interface BulkMoveItemsResponse {
  message: string;
  moved_items: Array<{
    item_type: 'predictor' | 'dataset';
    item_id: string;
    status: string;
  }>;
  errors: Array<{
    item: any;
    error: string;
  }>;
  total_processed: number;
  successful: number;
  failed: number;
}

/**
 * Duplicate an existing folder with all its items
 */
export interface DuplicateFolderResponse {
  message: string;
  folder: Folder;
  items_copied: number;
  items_skipped: number;
  total_items: number;
}

export async function duplicateFolder(folderId: string, request: DuplicateFolderRequest): Promise<DuplicateFolderResponse> {
  const response = await api.post<{
    message: string;
    folder: any;
    items_copied: number;
    items_skipped: number;
    total_items: number;
  }>(`/api/folders/${folderId}/duplicate/`, request);

  return {
    message: response.message,
    folder: mapApiFolderToUi(response.folder),
    items_copied: response.items_copied,
    items_skipped: response.items_skipped,
    total_items: response.total_items,
  };
}

/**
 * Move multiple items between folders or to main collection
 */
export async function bulkMoveItems(request: BulkMoveItemsRequest): Promise<BulkMoveItemsResponse> {
  return api.post<BulkMoveItemsResponse>("/api/folders/bulk-move-items/", request);
}

/**
 * Rename a folder (convenience function for updating just the name)
 */
export async function renameFolder(folderId: string, newName: string): Promise<Folder> {
  return updateFolder(folderId, { name: newName });
}

/**
 * Update folder description (convenience function for updating just the description)
 */
export async function updateFolderDescription(folderId: string, description: string): Promise<Folder> {
  return updateFolder(folderId, { description });
}

// ----------------------------
// Folder Pinning Operations
// ----------------------------
export interface PinnedFolder {
  id: number;
  folder: Folder;
  folder_id: string;
  name: string;
  user: User;
  pinned_at: string;
}

/**
 * List all folders pinned by the current user
 */
export async function listPinnedFolders(): Promise<PinnedFolder[]> {
  return api.get<PinnedFolder[]>("/api/folders/pins/");
}

/**
 * Pin a folder for quick access
 */
export async function pinFolder(folderId: string): Promise<PinnedFolder> {
  return api.post<PinnedFolder>("/api/folders/pins/", { folder_id: folderId });
}

/**
 * Unpin a folder
 */
export async function unpinFolder(pinnedFolderId: string): Promise<void> {
  return api.del(`/api/folders/pins/${pinnedFolderId}/`);
}
