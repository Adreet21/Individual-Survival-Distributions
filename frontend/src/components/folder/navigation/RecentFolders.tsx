/**
 * ----------------------------------------------------------------------------------
 * RecentFolders
 * ----------------------------------------------------------------------------------
 * - Quick access panel for recently accessed folders
 * - Stores recent folder access in localStorage
 * - Provides one-click navigation to recent folders
 * - Only shows the top 3 most recently accessed folders when expanded
 * - Stays collapsed by default; header/tab is always visible.
 * ----------------------------------------------------------------------------------
 */

import { useState, useEffect } from "react";
import {
  Clock,
  Folder as FolderIcon,
  Lock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Folder } from "../../../lib/folders";

interface RecentFolder {
  folder_id: string;
  name: string;
  is_private: boolean;
  last_accessed: string;
}

interface RecentFoldersProps {
  onFolderSelect: (folderId: string) => void;
  currentFolderId?: string;
  className?: string;
}

const RECENT_FOLDERS_KEY = "kiro_recent_folders";
const MAX_RECENT_FOLDERS = 5; // how many we store in localStorage (UI only shows 3)

export default function RecentFolders({
  onFolderSelect,
  currentFolderId,
  className = "",
}: RecentFoldersProps) {
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [isExpanded, setIsExpanded] = useState(false); // default: collapsed

  // Load recent folders from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_FOLDERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRecentFolders(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error("Failed to load recent folders:", error);
    }
  }, []);

  // Save recent folders to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(recentFolders));
    } catch (error) {
      console.error("Failed to save recent folders:", error);
    }
  }, [recentFolders]);

  // Function to add a folder to recent list
  const addToRecent = (folder: Folder) => {
    const recentFolder: RecentFolder = {
      folder_id: folder.folder_id,
      name: folder.name,
      is_private: folder.is_private,
      last_accessed: new Date().toISOString(),
    };

    setRecentFolders((prev) => {
      const filtered = prev.filter((f) => f.folder_id !== folder.folder_id);
      const updated = [recentFolder, ...filtered];
      return updated.slice(0, MAX_RECENT_FOLDERS);
    });
  };

  // Expose the addToRecent function globally so other components can use it
  useEffect(() => {
    (window as any).addFolderToRecent = addToRecent;
    return () => {
      delete (window as any).addFolderToRecent;
    };
  }, []);

  const handleFolderClick = (folderId: string) => {
    onFolderSelect(folderId);
  };

  if (recentFolders.length === 0) {
    // No header at all if we've literally never had a recent folder
    return null;
  }

  // Ensure we’re always showing the *most recent* ones, just in case order got weird
  const sortedByRecency = [...recentFolders].sort((a, b) => {
    const aTime = new Date(a.last_accessed).getTime();
    const bTime = new Date(b.last_accessed).getTime();
    return bTime - aTime;
  });

  // Only show the top 3 in the panel
  const visibleFolders = sortedByRecency.slice(0, 3);

  return (
    <div
      className={`bg-neutral-200 rounded-lg border border-gray-200 ${className}`}
    >
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 text-left hover:border hover:border-neutral-400 hover:bg-neutral-100 rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-700" />
          <span className="text-sm font-medium text-gray-900">
            Recent Folders
          </span>
          <span className="text-xs text-gray-600">
            ({visibleFolders.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-700" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-700" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-neutral-400">
          {visibleFolders.map((folder) => (
            <button
              key={folder.folder_id}
              onClick={() => handleFolderClick(folder.folder_id)}
              className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                currentFolderId === folder.folder_id
                  ? "bg-black/5 border-l-2 border-l-black"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <FolderIcon className="h-4 w-4 text-gray-700" />
                  {folder.is_private && (
                    <Lock className="h-3 w-3 text-gray-700" />
                  )}
                </div>
                <span className="text-sm text-gray-900 truncate">
                  {folder.name}
                </span>
              </div>
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {new Date(folder.last_accessed).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Export the function to add folders to recent list
export function addFolderToRecent(folder: Folder) {
  if ((window as any).addFolderToRecent) {
    (window as any).addFolderToRecent(folder);
  }
}
