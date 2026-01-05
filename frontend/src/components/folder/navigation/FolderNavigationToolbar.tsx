/**
 * ----------------------------------------------------------------------------------
 * FolderNavigationToolbar
 * ----------------------------------------------------------------------------------
 * - Enhanced toolbar for folder navigation and management
 * - Combines breadcrumb navigation, search, sorting, and filtering
 * - Provides comprehensive folder organization controls
 */

import { useState } from "react";
import FolderBreadcrumb from "./FolderBreadcrumb";
import FolderSortMenu, { type FolderSortOption } from "./FolderSortMenu";
import FolderTypeFilter, { type FolderType } from "./FolderTypeFilter";
import SearchBar from "../../SearchBar";
import { Settings } from "lucide-react";

interface FolderNavigationToolbarProps {
  // Breadcrumb navigation
  currentFolder?: {
    folder_id: string;
    name: string;
  };
  onNavigate: (path: string) => void;

  // Search functionality
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // Sorting options
  sortOption: FolderSortOption;
  onSortChange: (option: FolderSortOption) => void;

  // Type filtering
  typeFilter: FolderType;
  onTypeFilterChange: (type: FolderType) => void;

  // Additional controls
  onSettingsClick?: () => void;
  className?: string;
}

export default function FolderNavigationToolbar({
  currentFolder,
  onNavigate,
  searchQuery,
  onSearchChange,
  sortOption,
  onSortChange,
  typeFilter,
  onTypeFilterChange,
  onSettingsClick,
  className = "",
}: FolderNavigationToolbarProps) {
  const [isCompact, setIsCompact] = useState(false);

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 space-y-4 ${className}`}>
      {/* Top row: Breadcrumb navigation */}
      <div className="flex items-center justify-between">
        <FolderBreadcrumb
          currentFolder={currentFolder}
          onNavigate={onNavigate}
          className="flex-1"
        />
        
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Folder settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Bottom row: Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Left side: Search */}
        <div className="flex-1 max-w-md">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search folders..."
            onClear={() => onSearchChange("")}
          />
        </div>

        {/* Right side: Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <FolderTypeFilter
            value={typeFilter}
            onChange={onTypeFilterChange}
          />
          
          <FolderSortMenu
            value={sortOption}
            onChange={onSortChange}
          />

          {/* Compact view toggle */}
          <button
            onClick={() => setIsCompact(!isCompact)}
            className={`p-2 rounded-md border border-gray-300 transition-colors ${
              isCompact 
                ? "bg-gray-100 text-gray-700" 
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
            title={isCompact ? "Expand view" : "Compact view"}
          >
            <div className="flex flex-col gap-0.5">
              <div className="w-3 h-0.5 bg-current"></div>
              <div className="w-3 h-0.5 bg-current"></div>
              <div className="w-3 h-0.5 bg-current"></div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}