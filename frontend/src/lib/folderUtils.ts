/**
 * ----------------------------------------------------------------------------------
 * Folder Utilities
 * ----------------------------------------------------------------------------------
 * - Utility functions for folder sorting, filtering, and navigation
 * - Provides consistent folder organization logic across components
 */

import type { Folder } from "./folders";
import type { FolderSortOption } from "../components/folder/navigation/FolderSortMenu";
import type { FolderType } from "../components/folder/navigation/FolderTypeFilter";

/**
 * Sort folders based on the provided sort option
 */
export function sortFolders(folders: Folder[], sortOption: FolderSortOption): Folder[] {
  const { field, direction } = sortOption;
  
  return [...folders].sort((a, b) => {
    let comparison = 0;
    
    switch (field) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "date":
        comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
      case "item_count":
        comparison = a.item_count - b.item_count;
        break;
      default:
        return 0;
    }
    
    return direction === "asc" ? comparison : -comparison;
  });
}

/**
 * Determine the content type of a folder based on its items
 */
export function getFolderContentType(folder: Folder): FolderType {
  if (!folder.items || folder.items.length === 0) {
    return "all"; // Empty folders show in all categories
  }
  
  const hasPredictor = folder.items.some(item => 'status' in item);
  const hasDataset = folder.items.some(item => 'sizeMB' in item || 'hasFile' in item);
  
  if (hasPredictor && hasDataset) {
    return "mixed";
  } else if (hasPredictor) {
    return "predictor-only";
  } else if (hasDataset) {
    return "dataset-only";
  }
  
  return "all";
}

/**
 * Filter folders by content type
 */
export function filterFoldersByType(folders: Folder[], typeFilter: FolderType): Folder[] {
  if (typeFilter === "all") {
    return folders;
  }
  
  return folders.filter(folder => {
    const contentType = getFolderContentType(folder);
    return contentType === typeFilter || contentType === "all";
  });
}

/**
 * Search folders by name, description, and content
 */
export function searchFolders(folders: Folder[], query: string): Folder[] {
  if (!query.trim()) {
    return folders;
  }
  
  const searchTerm = query.toLowerCase().trim();
  
  return folders.filter(folder => {
    // Search in folder name
    if (folder.name.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Search in folder description
    if (folder.description && folder.description.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Search in folder contents
    if (folder.items) {
      return folder.items.some(item => {
        // Search item title
        if (item.title.toLowerCase().includes(searchTerm)) {
          return true;
        }
        
        // Search item notes
        if (item.notes && item.notes.toLowerCase().includes(searchTerm)) {
          return true;
        }
        
        // For datasets, search filename
        if ('originalFilename' in item && item.originalFilename) {
          if (item.originalFilename.toLowerCase().includes(searchTerm)) {
            return true;
          }
        }
        
        return false;
      });
    }
    
    return false;
  });
}

/**
 * Get folder statistics for display
 */
export function getFolderStats(folders: Folder[]) {
  const stats = {
    total: folders.length,
    private: 0,
    public: 0,
    empty: 0,
    predictorOnly: 0,
    datasetOnly: 0,
    mixed: 0,
    totalItems: 0,
  };
  
  folders.forEach(folder => {
    if (folder.is_private) {
      stats.private++;
    } else {
      stats.public++;
    }
    
    if (folder.item_count === 0) {
      stats.empty++;
    }
    
    stats.totalItems += folder.item_count;
    
    const contentType = getFolderContentType(folder);
    switch (contentType) {
      case "predictor-only":
        stats.predictorOnly++;
        break;
      case "dataset-only":
        stats.datasetOnly++;
        break;
      case "mixed":
        stats.mixed++;
        break;
    }
  });
  
  return stats;
}

/**
 * Generate breadcrumb path for folder navigation
 */
export function generateBreadcrumbPath(folderId?: string): string {
  if (!folderId) {
    return "/";
  }
  return `/folder/${folderId}`;
}

/**
 * Parse breadcrumb path to extract folder ID
 */
export function parseBreadcrumbPath(path: string): string | null {
  if (path === "/") {
    return null;
  }
  
  const match = path.match(/^\/folder\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Default sort option for folders
 */
export const DEFAULT_FOLDER_SORT: FolderSortOption = {
  field: "date",
  direction: "desc",
  label: "Recently Updated",
};

/**
 * Get display label for folder content type
 */
export function getFolderTypeLabel(type: FolderType): string {
  switch (type) {
    case "all":
      return "All Folders";
    case "predictor-only":
      return "Predictors Only";
    case "dataset-only":
      return "Datasets Only";
    case "mixed":
      return "Mixed Content";
    default:
      return "All Folders";
  }
}

/**
 * Get icon for folder content type
 */
export function getFolderTypeIcon(type: FolderType): string {
  switch (type) {
    case "all":
      return "📁";
    case "predictor-only":
      return "🔮";
    case "dataset-only":
      return "📊";
    case "mixed":
      return "📦";
    default:
      return "📁";
  }
}