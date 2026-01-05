import { useDrag } from 'react-dnd';
import { useRef } from 'react';
import type { DragItem } from '../types/dragDrop';

interface Props {
  item: DragItem;
  children: React.ReactNode;
  onDrop?: (item: DragItem, folderId?: string) => void;
  isLoading?: boolean;
}

export default function DraggableCard({ item, children, onDrop, isLoading = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: item.type,
    item,
    canDrag: item.owner && !isLoading,
    end: (draggedItem, monitor) => {
      const result = monitor.getDropResult() as { folderId?: string } | null;
      if (result) onDrop?.(draggedItem, result.folderId);
    },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  drag(ref);

  return (
    <div
      ref={ref}
      className={`
        ${item.owner && !isLoading ? 'cursor-grab' : ''} 
        ${isDragging ? 'opacity-50' : ''} 
        ${isLoading ? 'opacity-60' : ''}
        relative
      `}
    >
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl shadow-lg border border-gray-200 animate-in fade-in duration-200">
            <div className="relative">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-200" />
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-blue-600 absolute inset-0" />
            </div>
            <span className="text-sm font-medium text-gray-800">Moving item...</span>
          </div>
        </div>
      )}
    </div>
  );
}