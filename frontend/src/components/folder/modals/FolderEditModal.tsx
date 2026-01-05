/**
 * ----------------------------------------------------------------------------------
 * FolderEditModal
 * ----------------------------------------------------------------------------------
 * Modal for editing folder name and description
 * Provides form validation and error handling
 */

import { useState, useEffect } from "react";
import type { Folder } from "../../../lib/folders";
import { updateFolder } from "../../../lib/folders";
import {
  X,
  AlertCircle,
  Loader2,
  Lock,
  Globe,
} from "lucide-react";

export interface FolderEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder;
  onFolderUpdated: (updatedFolder: Folder) => void;
}

export default function FolderEditModal({
  isOpen,
  onClose,
  folder,
  onFolderUpdated,
}: FolderEditModalProps) {
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description || "");
  const [isPrivate, setIsPrivate] = useState(folder.is_private);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when folder changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(folder.name);
      setDescription(folder.description || "");
      setIsPrivate(folder.is_private);
      setError(null);
    }
  }, [isOpen, folder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }

    if (name.trim().length > 100) {
      setError("Folder name cannot exceed 100 characters");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const updatedFolder = await updateFolder(folder.folder_id, {
        name: name.trim(),
        description: description.trim(),
        is_private: isPrivate,
      });

      onFolderUpdated(updatedFolder);
      onClose();
    } catch (err: any) {
        console.error("Failed to update folder:", err);

        if (err.status === 400 && err.details?.name) {
          setError("You already have a folder with this name");
        } else if (err.status === 403) {
          setError("You don't have permission to edit this folder");
        } else {
          setError("Failed to update folder. Please try again.");
        }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Edit Folder</h2>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Folder Name */}
            <div>
              <label
                htmlFor="folder-name"
                className="mb-1 block text-sm font-medium text-gray-900"
              >
                Folder Name *
              </label>
              <input
                id="folder-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border border-black/10 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Enter folder name"
                maxLength={100}
                required
              />
              <div className="mt-1 text-xs text-gray-600">
                {name.length}/100 characters
              </div>
            </div>

            {/* Folder Description */}
            <div>
              <label
                htmlFor="folder-description"
                className="mb-1 block text-sm font-medium text-gray-900"
              >
                Description
              </label>
              <textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border border-black/10 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Optional description for this folder"
                rows={3}
                maxLength={500}
              />
              <div className="mt-1 text-xs text-gray-600">
                {description.length}/500 characters
              </div>
            </div>

            {/* Privacy Setting */}
            <div>
              <label className="flex items-center text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  disabled={isLoading}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 disabled:opacity-50"
                />
                <span className="ml-2 flex items-center gap-1 text-gray-700">
                  {isPrivate ? (
                    <>
                      <Lock className="h-4 w-4 text-gray-600" />
                      <span>Private</span>
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 text-gray-600" />
                      <span>Public</span>
                    </>
                  )}
                </span>
              </label>
              <p className="mt-1 text-xs text-gray-600">
                Private folders are only visible to you and people you share
                them with
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                  <p className="ml-2 text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !name.trim()}
                className="inline-flex items-center rounded-md bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}