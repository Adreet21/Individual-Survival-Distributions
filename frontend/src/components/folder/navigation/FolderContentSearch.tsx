/**
 * ----------------------------------------------------------------------------------
 * FolderContentSearch
 * ----------------------------------------------------------------------------------
 * - Search within folder contents (items)
 * - Filters both predictors and datasets within a folder
 * - Provides real-time search results
 */

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import type { PredictorItem } from "../../PredictorCard";
import type { DatasetItem } from "../../DatasetCard";

interface FolderContentSearchProps {
  items: Array<PredictorItem | DatasetItem>;
  onFilteredItemsChange: (filteredItems: Array<PredictorItem | DatasetItem>) => void;
  placeholder?: string;
  className?: string;
}

export default function FolderContentSearch({
  items,
  onFilteredItemsChange,
  placeholder = "Search folder contents...",
  className = "",
}: FolderContentSearchProps) {
  const [query, setQuery] = useState("");

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return items;
    }

    const searchTerm = query.toLowerCase().trim();
    return items.filter((item) => {
      // Search in title
      if (item.title.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in notes/description
      if (item.notes && item.notes.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // For datasets, search in filename
      if ('originalFilename' in item && item.originalFilename) {
        if (item.originalFilename.toLowerCase().includes(searchTerm)) {
          return true;
        }
      }

      return false;
    });
  }, [items, query]);

  // Notify parent of filtered items whenever they change
  useMemo(() => {
    onFilteredItemsChange(filteredItems);
  }, [filteredItems, onFilteredItemsChange]);

  const handleClear = () => {
    setQuery("");
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
            title="Clear search"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Search results summary */}
      {query && (
        <div className="mt-2 text-xs text-gray-600">
          {filteredItems.length === 0 ? (
            <span>No items found matching "{query}"</span>
          ) : (
            <span>
              {filteredItems.length} of {items.length} items match "{query}"
            </span>
          )}
        </div>
      )}
    </div>
  );
}