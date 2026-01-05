/**
 * ----------------------------------------------------------------------------------
 * FolderSelector
 * ----------------------------------------------------------------------------------
 * - Dropdown component for selecting folders during upload/creation workflows
 * - Includes "Create New Folder" option that opens inline folder creation
 * - Supports loading states and error handling
 * - Remembers last selected folder for convenience
 */

import { useState, useEffect } from "react";
import {
  listMyFolders,
  listMyOwnedFolders,
  createFolder,
  type Folder,
  type CreateFolderRequest,
} from "../../../lib/folders";
import FolderCreationModal from "../modals/FolderCreationModal";
import type { PredictorItem } from "../../PredictorCard";
import type { DatasetItem } from "../../DatasetCard";

export interface FolderSelectorProps {
  selectedFolderId?: string | null;
  onFolderSelect: (folderId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  // For inline folder creation
  availablePredictors?: PredictorItem[];
  availableDatasets?: DatasetItem[];
  // Only show folders owned by the user (for operations that require ownership)
  ownedOnly?: boolean;
}

export default function FolderSelector({
  selectedFolderId,
  onFolderSelect,
  disabled = false,
  placeholder = "Select a folder (optional)",
  className = "",
  availablePredictors = [],
  availableDatasets = [],
  ownedOnly = false,
}: FolderSelectorProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Load user's folders
  useEffect(() => {
    loadFolders();
  }, [ownedOnly]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      setError(null);
      const userFolders = ownedOnly ? await listMyOwnedFolders() : await listMyFolders();
      setFolders(userFolders);
    } catch (err: any) {
      console.error("Failed to load folders:", err);
      setError("Failed to load folders");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async (data: CreateFolderRequest) => {
    try {
      setCreatingFolder(true);
      setCreateError(null);

      const newFolder = await createFolder(data);

      // Add to local state
      setFolders((prev) => [newFolder, ...prev]);

      // Auto-select the newly created folder
      onFolderSelect(newFolder.folder_id);

      // Close modal
      setShowCreateModal(false);
    } catch (err: any) {
      console.error("Failed to create folder:", err);
      setCreateError(err.message || "Failed to create folder");
      throw err; // Re-throw so modal can handle it
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (value === "CREATE_NEW") {
      setShowCreateModal(true);
      return;
    }

    onFolderSelect(value || null);
  };

  const selectedFolder = folders.find((f) => f.folder_id === selectedFolderId);

  return (
    <>
      <div className='space-y-2'>
        <select
          value={selectedFolderId || ""}
          onChange={handleSelectChange}
          disabled={disabled || loading}
          className={`w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
          <option value=''>
            {loading ? "Loading folders..." : placeholder}
          </option>

          {!loading && folders.length > 0 && (
            <>
              {folders.map((folder) => (
                <option key={folder.folder_id} value={folder.folder_id}>
                  🗀 {folder.name} ({folder.item_count} items)
                  {folder.is_private ? "Private" : ""}
                </option>
              ))}
              <option disabled>──────────</option>
            </>
          )}

          <option value='CREATE_NEW'>＋ Create New Folder</option>
        </select>

        {/* Error display */}
        {error && (
          <div className='text-xs text-red-600'>
            {error}
            <button
              onClick={loadFolders}
              className='ml-2 underline hover:no-underline'
              disabled={loading}
            >
              Retry
            </button>
          </div>
        )}

        {/* Selected folder info */}
        {selectedFolder && (
          <div className='text-xs text-gray-600'>
            Selected: <strong>{selectedFolder.name}</strong>
            {selectedFolder.description && (
              <span className='block text-gray-500 mt-1'>
                {selectedFolder.description}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Folder Creation Modal */}
      <FolderCreationModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateError(null);
        }}
        onCreateFolder={handleCreateFolder}
        availablePredictors={availablePredictors}
        availableDatasets={availableDatasets}
        isLoading={creatingFolder}
        error={createError}
      />
    </>
  );
}
