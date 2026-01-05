/**
 * ----------------------------------------------------------------------------------
 * FolderSectionHeader
 * ----------------------------------------------------------------------------------
 * - Header for the "My Folders" section with title, description, and create button
 * - Provides a dedicated space for folder-specific actions
 */

import { FolderPlus } from "lucide-react";

interface FolderSectionHeaderProps {
  onCreateFolder: () => void;
  folderCount?: number;
  className?: string;
}

export default function FolderSectionHeader({
  onCreateFolder,
  folderCount = 0,
  className = "",
}: FolderSectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          My Folders
          {folderCount > 0 && (
            <span className="ml-2 text-lg font-normal text-gray-500">
              ({folderCount})
            </span>
          )}
        </h2>
        <p className="text-gray-600">
          Organize your predictors and datasets into folders
        </p>
      </div>
      
      <button
        onClick={onCreateFolder}
        className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-black/90 transition-colors"
      >
        <FolderPlus className="h-4 w-4" />
        <span>New Folder</span>
      </button>
    </div>
  );
}