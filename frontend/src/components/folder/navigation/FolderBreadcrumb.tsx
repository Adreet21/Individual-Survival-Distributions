/**
 * ----------------------------------------------------------------------------------
 * FolderBreadcrumb
 * ----------------------------------------------------------------------------------
 * - Displays breadcrumb navigation for folder contents
 * - Shows path from main collection to current folder
 * - Allows navigation back to parent levels
 */

import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  id: string;
  name: string;
  path: string;
}

interface FolderBreadcrumbProps {
  currentFolder?: {
    folder_id: string;
    name: string;
  };
  onNavigate: (path: string) => void;
  className?: string;
}

export default function FolderBreadcrumb({
  currentFolder,
  onNavigate,
  className = "",
}: FolderBreadcrumbProps) {
  const breadcrumbs: BreadcrumbItem[] = [
    {
      id: "root",
      name: "My Collection",
      path: "/",
    },
  ];

  if (currentFolder) {
    breadcrumbs.push({
      id: currentFolder.folder_id,
      name: currentFolder.name,
      path: `/folder/${currentFolder.folder_id}`,
    });
  }

  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {breadcrumbs.map((item, index) => (
          <li key={item.id} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-gray-400 mx-1" />
            )}
            <button
              onClick={() => onNavigate(item.path)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                index === breadcrumbs.length - 1
                  ? "text-gray-900 font-medium cursor-default"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
              disabled={index === breadcrumbs.length - 1}
            >
              {index === 0 && <Home className="h-4 w-4" />}
              <span className="truncate max-w-[150px]">{item.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}