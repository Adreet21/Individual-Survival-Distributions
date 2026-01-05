/**
 * ----------------------------------------------------------------------------------
 * FolderSidebar
 * ----------------------------------------------------------------------------------
 * - Sidebar panel listing user's folders, with quick create and search.
 * - Appears on Dashboard (Predictors / Datasets tabs).
 * - Supports drag and drop: users can drag predictors/datasets onto folders.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listMyOwnedFolders,
  createFolder,
  addItemToFolder,
  mapApiFolderToUi,
  type Folder,
  type CreateFolderRequest,
  isOwner,
} from "../../../lib/folders";
import { addFolderToRecent } from "../navigation/RecentFolders";
import PrivacyBadge from "../../PrivacyBadge";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderOpen,
  Lock,
} from "lucide-react";
import FolderCreationModal from "../modals/FolderCreationModal";
import DroppableFolder from "./DroppableFolder";
import { useAuth } from "../../../auth/AuthContext";
import type { DragItem } from "../../../types/dragDrop";

export interface FolderSidebarProps {
  className?: string;
  onItemMoved?: (itemId: string, folderId: string) => void;
}

export default function FolderSidebar({
  className,
  onItemMoved,
}: FolderSidebarProps) {
  const { user } = useAuth();
  const currentUserId = useMemo(
    () => (user as any)?.id ?? (user as any)?.pk,
    [user]
  );

  const [folders, setFolders] = useState<Folder[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFetchingFolders, setIsFetchingFolders] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [query, setQuery] = useState("");
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());

  const fetchFolders = useCallback(async () => {
    try {
      const data = await listMyOwnedFolders();
      const mapped = Array.isArray(data)
        ? data.map((f: any) => mapApiFolderToUi(f))
        : [];
      setFolders(mapped);
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    } finally {
      setIsFetchingFolders(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Filter to only show folders the user owns
  const accessibleFolders = useMemo(() => {
    if (!currentUserId) return [];
    return folders.filter((folder) => isOwner(folder, currentUserId));
  }, [folders, currentUserId]);

  async function handleCreateFolder(req: CreateFolderRequest) {
    setCreatingFolder(true);
    try {
      const newFolder = await createFolder(req);
      const mapped = mapApiFolderToUi(newFolder);
      setFolders((prev) => [mapped, ...prev]);
      addFolderToRecent(mapped);
      setShowCreateModal(false);
    } catch (err) {
      console.error("Failed to create folder:", err);
    } finally {
      setCreatingFolder(false);
    }
  }

  const handleDrop = useCallback(
    async (item: DragItem, folderId?: string) => {
      if (!folderId) return;

      setLoadingFolders((prev) => new Set(prev).add(folderId));

      try {
        await addItemToFolder(folderId, {
          item_type: item.type,
          item_id: item.id,
        });

        // Refresh folders to show updated item count
        await fetchFolders();

        // Notify parent component
        onItemMoved?.(item.id, folderId);
      } catch (error: any) {
        // If item already exists in folder, don't treat it as an error
        if (
          error?.status === 400 &&
          (error?.details?.item || error?.message?.includes("already"))
        ) {
          console.log("Item already exists in folder, skipping...");
        } else {
          console.error("Failed to add item to folder:", error);
        }
      } finally {
        setLoadingFolders((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [fetchFolders, onItemMoved]
  );

  const isLoading = useCallback(
    (itemId: string) => loadingFolders.has(itemId),
    [loadingFolders]
  );

  const filteredFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accessibleFolders;
    return accessibleFolders.filter((folder: any) => {
      if (
        folder.name.toLowerCase().includes(q) ||
        (folder.description &&
          folder.description.toLowerCase().includes(q))
      ) {
        return true;
      }
      if (
        folder.items?.some((item: any) => {
          return (
            item.title.toLowerCase().includes(q) ||
            (item.notes &&
              item.notes.toLowerCase().includes(q))
          );
        })
      ) {
        return true;
      }
      return false;
    });
  }, [accessibleFolders, query]);

  return (
    <>
      <aside
        className={`w-64 shrink-0 rounded-md border border-black bg-gray-50 overflow-hidden ${className ?? ""}`}
      >
        <div className="flex items-center justify-between border-b border-black/10 bg-neutral-600 px-3 py-2">
          <div className="text-sm font-semibold text-white">
            Folders
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center rounded-md border border-white bg-neutral-600 px-2 py-2 text-xs text-white hover:bg-neutral-400"
              onClick={() => setShowCreateModal(true)}
              title="Create folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              className="inline-flex items-center rounded-md border border-white bg-neutral-600 px-2 py-2 text-xs text-white hover:bg-neutral-400"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-expanded={sidebarOpen}
              title={sidebarOpen ? "Collapse" : "Expand"}
            >
              {sidebarOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <div className="p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-3 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-500 outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
              placeholder="Search folders…"
            />

            <div className="space-y-2">
              {isFetchingFolders ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-t-2 border-neutral-700" />
                  <span className="text-xs text-neutral-600">Loading folders...</span>
                </div>
              ) : filteredFolders.length === 0 ? (
                <div className="rounded-md border border-black/10 bg-neutral-200 px-3 py-4 text-center text-xs text-gray-600">
                  No folders
                </div>
              ) : (
                filteredFolders.map((folder: any) => {
                  const count =
                    folder.item_count ??
                    folder.items?.length ??
                    0;

                  addFolderToRecent(folder);

                  return (
                    <DroppableFolder
                      key={folder.folder_id}
                      folder={folder}
                      onDrop={handleDrop}
                      isLoading={isLoading}
                      className="rounded-md border border-black bg-white p-3 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[13px] font-medium text-gray-900">
                            {folder.is_private ? (
                              <Lock className="h-4 w-4 text-gray-700" />
                            ) : (
                              <FolderOpen className="h-4 w-4 text-gray-700" />
                            )}
                            <span className="truncate">
                              {folder.name}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                            <span className="text-gray-600">
                              {count} item
                              {count !== 1 ? "s" : ""}
                            </span>
                            <PrivacyBadge
                              isPublic={!folder.is_private}
                            />
                          </div>

                          {folder.description ? (
                            <div className="mt-1 line-clamp-2 text-[11px] text-gray-600">
                              {folder.description}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </DroppableFolder>
                  );
                })
              )}
            </div>
          </div>
        )}
      </aside>

      <FolderCreationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateFolder={handleCreateFolder}
        isLoading={creatingFolder}
      />
    </>
  );
}
