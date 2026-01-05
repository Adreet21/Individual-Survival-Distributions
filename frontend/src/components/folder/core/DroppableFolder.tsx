import { useDrop } from "react-dnd";
import { useRef } from "react";
import type { DragItem } from "../../../types/dragDrop";
import type { Folder } from "../../../lib/folders";

interface Props {
  folder: Folder | null; // null represents main collection
  children: React.ReactNode;
  isLoading?: (itemId: string) => boolean;
  onDrop?: (item: DragItem, targetFolderId?: string) => void;
  className?: string;
}

export default function DroppableFolder({
  folder,
  children,
  isLoading = () => false,
  onDrop,
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const folderId = folder?.folder_id;

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ["predictor", "dataset"],
    drop: (item: DragItem) => {
      onDrop?.(item, folderId);
      return { folderId: folderId || undefined };
    },
    canDrop: (item: DragItem) => {
      // Block drops while this item is in a loading state
      if (isLoading(item.id)) return false;

      // Dropping to main collection: only allow if the item is currently in a folder
      if (!folderId) {
        return !!item.folderId;
      }

      // Avoid dropping into the same folder it already belongs to
      if (item.folderId && item.folderId === folderId) {
        return false;
      }

      // Otherwise, allow dropping onto folders
      return true;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drop(ref);

  // Highlight a specific folder as "loading" if caller indicates so
  const folderLoading = folderId ? isLoading(folderId) : false;

  return (
    <div
      ref={ref}
      className={`
        ${className}
        ${isOver && canDrop ? "ring-2 ring-blue-500 bg-blue-50/80 shadow-lg" : ""}
        ${isOver && !canDrop ? "ring-2 ring-red-500 bg-red-50/80" : ""}
        ${folderLoading ? "ring-2 ring-orange-400 bg-orange-50/60" : ""}
        transition-all duration-200 relative
      `}
    >
      {children}
      {folderLoading && (
        <div className="absolute top-3 right-3 bg-white rounded-full p-2.5 shadow-lg border border-orange-200 animate-in slide-in-from-top-2 duration-300">
          <div className="relative">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-200" />
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-orange-500 absolute inset-0" />
          </div>
        </div>
      )}
    </div>
  );
}
