import { useState } from "react";
import { addItemToFolder, removeItemFromFolder } from "../lib/folders";
import type { DragItem } from "../types/dragDrop";

export function useDragDrop(
  onUpdate: (
    itemId: string,
    folderId?: string,
    folderData?: any, // Keep for backward compatibility but not used
    originalFolderId?: string
  ) => void,
  onLoadingChange?: (itemId: string, isLoading: boolean) => void
) {
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

  const setItemLoading = (itemId: string, isLoading: boolean) => {
    setLoadingItems((prev) => {
      const newSet = new Set(prev);
      if (isLoading) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
    onLoadingChange?.(itemId, isLoading);
  };

  const moveItem = async (item: DragItem, targetFolderId?: string) => {
    const originalFolderId = item.folderId;

    // Start loading state
    setItemLoading(item.id, true);

    try {
      // Only remove from source folder if dropping to main collection (no targetFolderId)
      if (originalFolderId && !targetFolderId) {
        await removeItemFromFolder(originalFolderId, item.type, item.id);
        // Notify callback to refresh the source folder
        onUpdate(item.id, undefined, undefined, originalFolderId);
      }

      // Add to target folder if specified (copy behavior)
      if (targetFolderId) {
        try {
          await addItemToFolder(targetFolderId, {
            item_type: item.type,
            item_id: item.id,
          });
          
          // Notify callback to refresh the target folder
          onUpdate(item.id, targetFolderId, undefined, originalFolderId);
          
        } catch (error: any) {
          // If item already exists in folder, don't treat it as an error
          if (
            error?.status === 400 &&
            (error?.details?.item || error?.message?.includes("already"))
          ) {
            console.log("Item already exists in folder, skipping...");
            return; // Exit early, don't throw error
          }
          throw error; // Re-throw other errors
        }
      }
    } catch (error) {
      console.error("Move failed:", error);

      // Show error feedback (could be enhanced with toast notifications)
      const errorMessage =
        error instanceof Error ? error.message : "Failed to move item";
      console.error("Drag and drop error:", errorMessage);
    } finally {
      // End loading state
      setItemLoading(item.id, false);
    }
  };

  const isItemLoading = (itemId: string) => loadingItems.has(itemId);

  return {
    moveItem,
    isItemLoading,
    loadingItems: Array.from(loadingItems),
  };
}
