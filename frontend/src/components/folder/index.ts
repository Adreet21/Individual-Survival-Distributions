/**
 * Folder Components Index
 *
 * Organized folder-related components for easy importing
 * Usage: import { FolderCard, FolderCreationModal } from '../components/folder'
 */

// Core Components
export { default as FolderCard } from "./core/FolderCard";
export { default as FolderItemList } from "./core/FolderItemList";
export { default as FolderSelector } from "./core/FolderSelector";
export { default as FolderSidebar } from "./core/FolderSidebar";
export { default as DroppableFolder } from "./core/DroppableFolder";

// Modal Components
export { default as FolderCreationModal } from "./modals/FolderCreationModal";
export { default as FolderEditModal } from "./modals/FolderEditModal";
export { default as FolderDuplicateModal } from "./modals/FolderDuplicateModal";
export { default as FolderSharingModal } from "./modals/FolderSharingModal";

// Navigation Components
export { default as FolderBreadcrumb } from "./navigation/FolderBreadcrumb";
export { default as FolderContentSearch } from "./navigation/FolderContentSearch";
export { default as FolderNavigationToolbar } from "./navigation/FolderNavigationToolbar";
export { default as FolderSortMenu } from "./navigation/FolderSortMenu";
export { default as FolderTypeFilter } from "./navigation/FolderTypeFilter";
export { default as RecentFolders } from "./navigation/RecentFolders";

// UI Components
export { default as FolderSectionHeader } from "./ui/FolderSectionHeader";
export { default as FolderPrivacyToggle } from "./ui/FolderPrivacyToggle";
export { default as FolderPermissionManager } from "./ui/FolderPermissionManager";

// Type exports
export type { FolderSortOption } from "./navigation/FolderSortMenu";
export type { FolderType } from "./navigation/FolderTypeFilter";
