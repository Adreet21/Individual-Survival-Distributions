/**
 * ----------------------------------------------------------------------------------
 * FolderCreationModal
 * ----------------------------------------------------------------------------------
 * - Modal for creating new folders with item selection
 * - Allows users to name the folder, set privacy, and select initial items
 * - Supports both predictor and dataset selection
 * - Provides search and filtering for item selection
 * - Validates folder name and handles creation errors
 */

import { useState, useEffect, useMemo } from "react";
import type { CreateFolderRequest } from "../../../lib/folders";
import type { PredictorItem } from "../../PredictorCard";
import type { DatasetItem } from "../../DatasetCard";
import { X, BrainCircuit, Table, Loader2 } from "lucide-react";

export interface FolderCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFolder: (data: CreateFolderRequest) => Promise<void>;
  availablePredictors?: PredictorItem[];
  availableDatasets?: DatasetItem[];
  preselectedItems?: Array<{
    id: string;
    type: "predictor" | "dataset";
  }>;
  isLoading?: boolean;
  error?: string | null;
}

interface SelectedItem {
  id: string;
  type: "predictor" | "dataset";
  title: string;
}

export default function FolderCreationModal({
  isOpen,
  onClose,
  onCreateFolder,
  availablePredictors = [],
  availableDatasets = [],
  preselectedItems = [],
  isLoading = false,
  error = null,
}: FolderCreationModalProps) {
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"predictors" | "datasets">(
    "predictors"
  );
  const [nameError, setNameError] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFolderName("");
      setFolderDescription("");
      setIsPrivate(false);
      setSearchQuery("");
      setNameError("");

      const preselectedIds = new Set(preselectedItems.map((item) => item.id));
      setSelectedItems(preselectedIds);
    }
  }, [isOpen]);

  // Validate folder name
  useEffect(() => {
    if (folderName.length > 100) {
      setNameError("Folder name must be 100 characters or less");
    } else if (folderName.trim() && folderName.trim().length < 1) {
      setNameError("Folder name cannot be empty");
    } else {
      setNameError("");
    }
  }, [folderName]);

  // Filter items based on search query
  const filteredPredictors = useMemo(() => {
    if (!searchQuery) return availablePredictors;
    const query = searchQuery.toLowerCase();
    return availablePredictors.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
    );
  }, [availablePredictors, searchQuery]);

  const filteredDatasets = useMemo(() => {
    if (!searchQuery) return availableDatasets;
    const query = searchQuery.toLowerCase();
    return availableDatasets.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
    );
  }, [availableDatasets, searchQuery]);

  // Get selected items with details for display
  const selectedItemsWithDetails = useMemo(() => {
    const items: SelectedItem[] = [];

    selectedItems.forEach((id) => {
      const predictor = availablePredictors.find((p) => p.id === id);
      if (predictor) {
        items.push({ id, type: "predictor", title: predictor.title });
        return;
      }

      const dataset = availableDatasets.find((d) => d.id === id);
      if (dataset) {
        items.push({ id, type: "dataset", title: dataset.title });
      }
    });

    return items;
  }, [selectedItems, availablePredictors, availableDatasets]);

  const handleItemToggle = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setSelectedItems(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!folderName.trim() || nameError || isLoading) {
      return;
    }

    const initialItems = selectedItemsWithDetails.map((item) => ({
      item_type: item.type,
      item_id: item.id,
    }));

    const createData: CreateFolderRequest = {
      name: folderName.trim(),
      description: folderDescription.trim() || undefined,
      is_private: isPrivate,
      initial_items: initialItems.length > 0 ? initialItems : undefined,
    };

    try {
      await onCreateFolder(createData);
      onClose();
    } catch {
      /* parent handles error */
    }
  };

  const renderTypeIcon = (itemType: "predictor" | "dataset") => {
    if (itemType === "predictor") {
      return <BrainCircuit className="h-4 w-4 text-neutral-500" />;
    }
    return <Table className="h-4 w-4 text-neutral-500" />;
  };

  const renderItemList = (
    items: (PredictorItem | DatasetItem)[],
    itemType: "predictor" | "dataset"
  ) => {
    if (items.length === 0) {
      return (
        <div className="py-4 text-center text-sm text-neutral-500">
          No {itemType}s available
        </div>
      );
    }

    return (
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {items.map((item) => {
          const isSelected = selectedItems.has(item.id);
          return (
            <div
              key={item.id}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                isSelected
                  ? "border-neutral-900 bg-neutral-900/5"
                  : "border-neutral-200 hover:bg-neutral-50"
              }`}
              onClick={() => handleItemToggle(item.id)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleItemToggle(item.id)}
                className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">
                  {item.title}
                </div>
                {item.notes && (
                  <div className="truncate text-xs text-neutral-500">
                    {item.notes}
                  </div>
                )}
              </div>
              <div className="flex items-center">{renderTypeIcon(itemType)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            Create New Folder
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {/* Error Display */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Folder Name */}
            <div>
              <label
                htmlFor="folderName"
                className="mb-2 block text-sm font-medium text-neutral-900"
              >
                Folder Name *
              </label>
              <input
                id="folderName"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Enter folder name"
                maxLength={100}
                className={`w-full rounded-md border px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 ${
                  nameError ? "border-red-300" : "border-neutral-300"
                }`}
                disabled={isLoading}
              />
              {nameError && (
                <div className="mt-1 text-sm text-red-600">{nameError}</div>
              )}
              <div className="mt-1 text-xs text-neutral-500">
                {folderName.length}/100 characters
              </div>
            </div>

            {/* Folder Description */}
            <div>
              <label
                htmlFor="folderDescription"
                className="mb-2 block text-sm font-medium text-neutral-900"
              >
                Description (optional)
              </label>
              <textarea
                id="folderDescription"
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                placeholder="Describe what this folder contains"
                rows={3}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                disabled={isLoading}
              />
            </div>

            {/* Privacy Setting */}
            <div>
              <label className="mb-3 block text-sm font-medium text-neutral-900">
                Visibility
              </label>

              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={!isPrivate}
                  onChange={(e) => setIsPrivate(!e.target.checked)}
                  disabled={isLoading}
                  className="h-4 w-4 accent-neutral-900 disabled:opacity-50"
                />
                <span className="text-xs font-medium text-neutral-800">
                  Make folder public
                </span>
              </div>

              <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-200 p-2 text-xs text-neutral-700">
                When checked, all users will be able to discover this folder.
                Leave unchecked to keep it and its contents private to you
                (and the users you share with).
              </div>
            </div>


            {/* Item Selection */}
            <div>
              <label className="mb-3 block text-sm font-medium text-neutral-900">
                Add Items to Folder (optional)
              </label>

              {/* Selected Items Summary */}
              {selectedItemsWithDetails.length > 0 && (
                <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                  <div className="mb-2 text-sm font-medium text-neutral-900">
                    Selected Items ({selectedItemsWithDetails.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedItemsWithDetails.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900"
                      >
                        {item.type === "predictor" ? (
                          <BrainCircuit className="h-3.5 w-3.5 text-neutral-500" />
                        ) : (
                          <Table className="h-3.5 w-3.5 text-neutral-500" />
                        )}
                        {item.title}
                        <button
                          type="button"
                          onClick={() => handleItemToggle(item.id)}
                          className="ml-1 text-neutral-400 hover:text-neutral-600"
                          aria-label={`Remove ${item.title}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  disabled={isLoading}
                />
              </div>

              {/* Item Type Tabs */}
              <div className="mb-4 flex border-b border-neutral-200 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab("predictors")}
                  className={`px-4 py-2 border-b-2 transition-colors ${
                    activeTab === "predictors"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                  disabled={isLoading}
                >
                  Predictors ({filteredPredictors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("datasets")}
                  className={`px-4 py-2 border-b-2 transition-colors ${
                    activeTab === "datasets"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                  disabled={isLoading}
                >
                  Datasets ({filteredDatasets.length})
                </button>
              </div>

              {/* Item Lists */}
              {activeTab === "predictors" &&
                renderItemList(filteredPredictors, "predictor")}
              {activeTab === "datasets" &&
                renderItemList(filteredDatasets, "dataset")}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-neutral-200 bg-neutral-50 p-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderName.trim() || Boolean(nameError) || isLoading}
              className="inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Folder"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
