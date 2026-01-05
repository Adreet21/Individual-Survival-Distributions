/**
 * BROWSE
 * (Public Predictors / Datasets / Folders)
 *
 * Purpose:
 * - Read-only "explore" page for all public content on the platform.
 * - Lets users search, filter, sort, and pin public predictors, datasets, and folders.
 * - Provides a unified browse experience that mirrors Dashboard styling.
 *
 * High-level behavior:
 * - Three-tab layout (Predictors / Datasets / Folders) synced to `?tab=` in the URL.
 * - Each tab has its own search query and advanced filter state.
 * - Uses React Query to load:
 *     - Public predictors, datasets, and folders.
 *     - Pinned predictors and datasets for the current user.
 * - Left sidebar shows pinned predictors/datasets; folders use inline star pins.
 * - Right side shows a responsive grid of cards (PredictorCard / DatasetCard / FolderCard).
 *
 * Implementation notes:
 * - Local state:
 *     - Active tab, per-tab search queries and visibility.
 *     - Advanced filter options (keyword target, updated-within, has-file, folder type/sort).
 *     - Pinned state for folders (local-only) and selection state for cards.
 *     - Expanded folder IDs, so folder contents can be lazily loaded.
 * - Derived lists:
 *     - `filteredPredictors`, `filteredDatasets`, `filteredFolders` are memoized and apply:
 *         - Keyword filtering, owner-name filtering, visibility and time windows.
 *         - Tab-specific sorting (chronological and alphabetical).
 * - Pinning:
 *     - Predictors/datasets: backed by pin/unpin mutations and React Query invalidation.
 *     - Folders: stars are local-only; no backend wiring yet.
 * - Folders:
 *     - Expanding a folder triggers `getPublicFolderContents` on first open,
 *       then patches the `public-folders` cache with the loaded items.
 *     - `RecentFolders` offers quick access and scrolls the selected folder into view.
 * - Filters:
 *     - `AdvancedFilterMenu` is a shared dropdown that adapts to the active tab
 *       (datasets get "has file", folders get folder type + sort controls, etc.).
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import SearchBar from "../components/SearchBar";
import type { Visibility } from "../components/PublicFilter";
import DragDropProvider from "../components/DragDropProvider";

import {
  FolderCard,
  RecentFolders,
  type FolderSortOption,
  type FolderType,
} from "../components/folder";
import { addFolderToRecent } from "../components/folder/navigation/RecentFolders";

import {
  listPublicPredictors,
  listPinnedPredictors,
  pinPredictor,
  unpinPredictor,
} from "../lib/predictors";
import {
  listPublicFolders,
  getPublicFolderContents,
  mapApiFolderToUi,
  listPinnedFolders,
  pinFolder,
  unpinFolder,
  type Folder,
} from "../lib/folders";
import {
  listPublicDatasets,
  listPinnedDatasets,
  pinDataset,
  unpinDataset,
  downloadDatasetFile,
} from "../lib/datasets";
import { toPredictorItem, toDatasetItem } from "../lib/mappers";

import { useAuth } from "../auth/AuthContext";
import { sortFolders, DEFAULT_FOLDER_SORT } from "../lib/folderUtils";

import {
  filterPredictors,
  filterDatasets,
  filterFolders,
} from "../lib/filtering";
import type {
  PredictorFilterState,
  DatasetFilterState,
  FolderFilterState,
} from "../types/flitering";
import PredictorCard, { type PredictorItem } from "../components/PredictorCard";
import DatasetCard, { type DatasetItem } from "../components/DatasetCard";

type Tab = "predictors" | "datasets" | "folders";

/**
 * Extra fields used by Browse cards.
 */
type BrowseBase = {
  ownerName?: string | null | undefined;
  // raw timestamp for chronological filtering
  updatedAtRaw?: string | null | undefined;
  // mostly for datasets, but shared for simplicity
  hasFile?: boolean;
  originalFilename?: string | null | undefined;
};

type BrowsePredictor = PredictorItem & BrowseBase;
type BrowseDataset = DatasetItem & BrowseBase;
type BrowseItem = BrowsePredictor | BrowseDataset;

// local types for advanced filters
type KeywordTarget = "title" | "notes" | "both";
type TimeWindow = "any" | "7d" | "30d" | "365d";
type SortMode = "chrono" | "alpha";

// helper: updatedWithin matcher (uses raw ISO timestamp where possible)
function matchesUpdatedWithin(
  updatedAt: string | null | undefined,
  window: TimeWindow
): boolean {
  if (!updatedAt || window === "any") return true;

  const parsed = Date.parse(updatedAt);
  // if we can't parse the date, don't exclude it
  if (Number.isNaN(parsed)) return true;

  const now = Date.now();
  const days =
    window === "7d" ? 7 : window === "30d" ? 30 : window === "365d" ? 365 : 0;
  if (days <= 0) return true;

  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return parsed >= cutoff;
}

export default function Browse() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = (user as any)?.id ?? (user as any)?.pk ?? undefined;
  const navigate = useNavigate();

  // tab navigation handling (same thing as Dashboard mostly)
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: Tab = (() => {
    const q = searchParams.get("tab");
    return q === "datasets" || q === "folders" ? (q as Tab) : "predictors";
  })();

  const selectTab = useCallback(
    (t: Tab) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("tab", t);
          return sp;
        },
        { replace: true }
      );
      setSelectedPredictorId(null);
      setSelectedDatasetId(null);
      // Smooth scroll to top on tab change
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setSearchParams]
  );

  // Separate search states for each tab
  const [predictorQuery, setPredictorQuery] = useState("");
  const [datasetQuery, setDatasetQuery] = useState("");
  const [folderQuery, setFolderQuery] = useState("");

  // Separate visibility filters for each tab
  const [predictorVisibility, setPredictorVisibility] =
    useState<Visibility>("all");
  const [datasetVisibility, setDatasetVisibility] =
    useState<Visibility>("all");
  const [folderVisibility, setFolderVisibility] =
    useState<Visibility>("all");

  const [pinnedOpen, setPinnedOpen] = useState(true);

  // --- Advanced filter state (Browse only) ---

  // where to search (title / notes / both)
  const [predictorKeywordTarget, setPredictorKeywordTarget] =
    useState<KeywordTarget>("both");
  const [datasetKeywordTarget, setDatasetKeywordTarget] =
    useState<KeywordTarget>("both");
  const [folderKeywordTarget, setFolderKeywordTarget] =
    useState<KeywordTarget>("both");

  // updated within time windows
  const [predictorUpdatedWithin, setPredictorUpdatedWithin] =
    useState<TimeWindow>("any");
  const [datasetUpdatedWithin, setDatasetUpdatedWithin] =
    useState<TimeWindow>("any");
  const [folderUpdatedWithin, setFolderUpdatedWithin] =
    useState<TimeWindow>("any");

  // owner username search (shared between tabs)
  const [ownerNameQuery, setOwnerNameQuery] = useState("");

  // datasets: only show those with a downloadable file
  const [datasetHasFileOnly, setDatasetHasFileOnly] = useState(false);

  // Folder-specific filters (search uses main query state)
  const [folderSortOption, setFolderSortOption] =
    useState<FolderSortOption>(DEFAULT_FOLDER_SORT);
  const [folderTypeFilter, setFolderTypeFilter] = useState<FolderType>("all");

  // Sort state for predictors & datasets
  const [predictorSortMode, setPredictorSortMode] =
    useState<SortMode>("chrono");
  const [predictorChronoDir, setPredictorChronoDir] =
    useState<"asc" | "desc">("desc");
  const [predictorAlphaDir, setPredictorAlphaDir] =
    useState<"asc" | "desc">("asc");

  const [datasetSortMode, setDatasetSortMode] =
    useState<SortMode>("chrono");
  const [datasetChronoDir, setDatasetChronoDir] =
    useState<"asc" | "desc">("desc");
  const [datasetAlphaDir, setDatasetAlphaDir] =
    useState<"asc" | "desc">("asc");

  const [selectedPredictorId, setSelectedPredictorId] = useState<string | null>(
    null
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    null
  );

  // Folder expansion state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  // --- TANSTACK QUERY: FETCH MAIN LISTS ---

  // Fetch Public Predictors
  const {
    data: predictors = [],
    isLoading: isPredictorsLoading,
    error: predictorsError,
  } = useQuery<BrowsePredictor[]>({
    queryKey: ["public-predictors"],
    queryFn: async () => {
      const apiPreds = await listPublicPredictors();
      return apiPreds.map((p: any) => {
        const ui = toPredictorItem(p);

        const updatedAtRaw =
          (p as any).updated_at ?? (ui as any).updatedAtRaw ?? null;
        const updatedAt =
          (ui as any).updatedAt ??
          (updatedAtRaw
            ? new Date(updatedAtRaw).toLocaleDateString()
            : undefined);

        const item: BrowsePredictor = {
          ...ui,
          ownerName:
            (ui as any).ownerName ??
            (p.owner?.username ??
              (p.owner_name as string | undefined) ??
              "Unknown owner"),
          updatedAtRaw,
          updatedAt,
        };

        return item;
      });
    },
    enabled: activeTab === "predictors",
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  // Fetch Public Datasets
  const {
    data: datasets = [],
    isLoading: isDatasetsLoading,
    error: datasetsError,
  } = useQuery<BrowseDataset[]>({
    queryKey: ["public-datasets"],
    queryFn: async () => {
      const apiDsets = await listPublicDatasets();
      return apiDsets.map((d: any) => {
        const ui = toDatasetItem(d, currentUserId);

        const updatedAtRaw =
          (d as any).uploaded_at ??
          (d as any).updated_at ??
          (ui as any).updatedAtRaw ??
          null;
        const updatedAt =
          (ui as any).updatedAt ??
          (updatedAtRaw
            ? new Date(updatedAtRaw).toLocaleDateString()
            : undefined);

        const item: BrowseDataset = {
          ...ui,
          ownerName:
            ui.ownerName ||
            (d.owner_name as string | undefined) ||
            "Owner",
          updatedAtRaw,
          updatedAt,
          hasFile:
            (ui as any).hasFile ??
            Boolean((d as any).file || (d as any).uploaded_file),
          originalFilename:
            (ui as any).originalFilename ??
            (d.original_filename as string | undefined) ??
            (d.filename as string | undefined) ??
            null,
        };

        return item;
      });
    },
    enabled: activeTab === "datasets",
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  // Fetch Public Folders
  const {
    data: folders = [],
    isLoading: isFoldersLoading,
    error: foldersError,
  } = useQuery({
    queryKey: ["public-folders"],
    queryFn: async () => {
      const apiFolders = await listPublicFolders();
      return apiFolders
        .map((f: any) => {
          const ui = mapApiFolderToUi(f) as any;

          const updatedAtRaw =
            (f as any).updated_at ?? (ui as any).updatedAtRaw ?? null;
          const updatedAt =
            (ui as any).updatedAt ??
            (updatedAtRaw
              ? new Date(updatedAtRaw).toLocaleDateString()
              : undefined);

          const ownerName =
            (ui as any).ownerName ??
            (f.owner?.username ??
              (f.owner_name as string | undefined) ??
              "Unknown owner");

          return {
            ...ui,
            ownerName,
            updatedAtRaw,
            updatedAt,
          };
        })
        .filter(
          (folder: any) => !folder.is_private && folder.public_item_count > 0
        );
    },
    enabled: activeTab === "folders",
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  // --- TANSTACK QUERY: FETCH PINNED ITEMS ---

  // Fetch Pinned Predictor IDs
  const { data: pinnedPredictorIds = new Set<string>(), isLoading: isPinnedPredictorsLoading } = useQuery({
    queryKey: ["pinned-predictors"],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const pinned = await listPinnedPredictors();
      return new Set(pinned.map((p) => String(p.predictor.predictor_id)));
    },
    enabled: !!user && activeTab === "predictors",
  });

  // Fetch Pinned Dataset IDs
  const { data: pinnedDatasetIds = new Set<string>(), isLoading: isPinnedDatasetsLoading } = useQuery({
    queryKey: ["pinned-datasets"],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const pinned = await listPinnedDatasets();
      return new Set(pinned.map((d) => String(d.dataset_id)));
    },
    enabled: !!user && activeTab === "datasets",
  });

  // Fetch Pinned Folder IDs
  const { data: pinnedFolderData = [], isLoading: isPinnedFoldersLoading } = useQuery({
    queryKey: ["pinned-folders"],
    queryFn: async () => {
      if (!user) return [];
      return await listPinnedFolders();
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Sidebar loading state based on active tab
  const isSidebarLoading =
    (activeTab === "predictors" && isPinnedPredictorsLoading) ||
    (activeTab === "datasets" && isPinnedDatasetsLoading) ||
    (activeTab === "folders" && isPinnedFoldersLoading);

  const pinnedFolderIds = new Set(
    pinnedFolderData.map((pf) => String(pf.folder?.folder_id || pf.folder_id))
  );

  // --- MUTATIONS FOR PINNING ---

  const pinPredictorMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      isPinned ? unpinPredictor(id) : pinPredictor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pinned-predictors"] });
    },
    onError: (err) => console.error("Failed to toggle predictor pin", err),
  });

  const pinDatasetMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      isPinned ? unpinDataset(id) : pinDataset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pinned-datasets"] });
    },
    onError: (err) => console.error("Failed to toggle dataset pin", err),
  });

  const pinFolderMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      if (isPinned) {
        // Get fresh pinned folders data
        const currentPinned = queryClient.getQueryData<any[]>(["pinned-folders"]) || [];
        const pinnedEntry = currentPinned.find(
          (pf) => String(pf.folder?.folder_id || pf.folder_id) === id
        );
        if (pinnedEntry) {
          await unpinFolder(String(pinnedEntry.id));
        } else {
          console.warn(`Could not find pinned folder entry for folder ${id}`);
        }
      } else {
        await pinFolder(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pinned-folders"] });
    },
    onError: (err) => console.error("Failed to toggle folder pin", err),
  });

  // --- FILTERING ---

  const filteredPredictors = useMemo<BrowsePredictor[]>(() => {
    if (activeTab !== "predictors") return [];

    const keywords = predictorQuery.trim()
      ? predictorQuery.trim().split(/\s+/)
      : [];

    const filter: PredictorFilterState = {
      keywords,
      keywordTarget: predictorKeywordTarget,
      ownership: "all",
      visibility: predictorVisibility,
    };

    // base keyword + visibility filtering
    let base = filterPredictors(
      predictors,
      filter
    ) as BrowsePredictor[];

    // owner-name filter
    if (ownerNameQuery.trim()) {
      const needle = ownerNameQuery.trim().toLowerCase();
      base = base.filter((item) =>
        (item.ownerName ?? "").toLowerCase().includes(needle)
      );
    }

    // time window filter (use raw timestamp if available)
    if (predictorUpdatedWithin !== "any") {
      base = base.filter((item) =>
        matchesUpdatedWithin(
          item.updatedAtRaw ?? (item as any).updatedAt,
          predictorUpdatedWithin
        )
      );
    }

    // Apply sort based on current predictor sort mode
    const sorted = [...base];

    if (predictorSortMode === "chrono") {
      // sort by updatedAtRaw (fallback to 0 if missing)
      sorted.sort((a, b) => {
        const aTime = a.updatedAtRaw ? Date.parse(a.updatedAtRaw) : 0;
        const bTime = b.updatedAtRaw ? Date.parse(b.updatedAtRaw) : 0;

        const cmp = aTime - bTime;
        return predictorChronoDir === "asc" ? cmp : -cmp;
      });
    } else {
      // sort by title A–Z / Z–A
      sorted.sort((a, b) => {
        const aTitle = (a.title ?? "").toLowerCase();
        const bTitle = (b.title ?? "").toLowerCase();
        const cmp = aTitle.localeCompare(bTitle);
        return predictorAlphaDir === "asc" ? cmp : -cmp;
      });
    }

    return sorted;
  }, [
    activeTab,
    predictors,
    predictorQuery,
    predictorVisibility,
    predictorKeywordTarget,
    predictorUpdatedWithin,
    ownerNameQuery,
    predictorSortMode,
    predictorChronoDir,
    predictorAlphaDir,
  ]);

  const filteredDatasets = useMemo<BrowseDataset[]>(() => {
    if (activeTab !== "datasets") return [];

    const keywords = datasetQuery.trim()
      ? datasetQuery.trim().split(/\s+/)
      : [];

    const filter: DatasetFilterState = {
      keywords,
      keywordTarget: datasetKeywordTarget,
      ownership: "all",
      visibility: datasetVisibility,
    };

    // base keyword + visibility filtering
    let base = filterDatasets(
      datasets,
      filter
    ) as BrowseDataset[];

    // owner-name filter
    if (ownerNameQuery.trim()) {
      const needle = ownerNameQuery.trim().toLowerCase();
      base = base.filter((item) =>
        (item.ownerName ?? "").toLowerCase().includes(needle)
      );
    }

    // time window filter (use raw timestamp if available)
    if (datasetUpdatedWithin !== "any") {
      base = base.filter((item) =>
        matchesUpdatedWithin(
          item.updatedAtRaw ?? (item as any).updatedAt,
          datasetUpdatedWithin
        )
      );
    }

    // has-file-only filter
    if (datasetHasFileOnly) {
      base = base.filter((item) => !!item.hasFile);
    }

    const sorted = [...base];

    if (datasetSortMode === "chrono") {
      sorted.sort((a, b) => {
        const aTime = a.updatedAtRaw ? Date.parse(a.updatedAtRaw) : 0;
        const bTime = b.updatedAtRaw ? Date.parse(b.updatedAtRaw) : 0;

        const cmp = aTime - bTime;
        return datasetChronoDir === "asc" ? cmp : -cmp;
      });
    } else {
      sorted.sort((a, b) => {
        const aTitle = (a.title ?? "").toLowerCase();
        const bTitle = (b.title ?? "").toLowerCase();
        const cmp = aTitle.localeCompare(bTitle);
        return datasetAlphaDir === "asc" ? cmp : -cmp;
      });
    }

    return sorted;
  }, [
    activeTab,
    datasets,
    datasetQuery,
    datasetVisibility,
    datasetKeywordTarget,
    datasetUpdatedWithin,
    ownerNameQuery,
    datasetHasFileOnly,
    datasetSortMode,
    datasetChronoDir,
    datasetAlphaDir,
  ]);

  const filteredFolders = useMemo(() => {
    if (activeTab !== "folders") return [];

    const keywords = folderQuery.trim()
      ? folderQuery.trim().split(/\s+/)
      : [];

    const filter: FolderFilterState = {
      keywords,
      keywordTarget: folderKeywordTarget,
      // Browse doesn't care about owner/viewer split; we show all public folders
      ownership: "all",
      visibility: folderVisibility,
      folderType: folderTypeFilter,
    };

    // base keyword + visibility + folder-type filtering
    let base = filterFolders(folders as any[], filter) as any[];

    // owner-name filter
    if (ownerNameQuery.trim()) {
      const needle = ownerNameQuery.trim().toLowerCase();
      base = base.filter((folder: any) =>
        (
          folder.ownerName ??
          folder.owner?.username ??
          folder.owner_name ??
          ""
        )
          .toString()
          .toLowerCase()
          .includes(needle)
      );
    }

    // time window filter
    if (folderUpdatedWithin !== "any") {
      base = base.filter((folder: any) =>
        matchesUpdatedWithin(
          (folder.updatedAtRaw ??
            (folder as any).updated_at ??
            (folder as any).updatedAt) as string | null | undefined,
          folderUpdatedWithin
        )
      );
    }

    return sortFolders(base as any[], folderSortOption);
  }, [
    activeTab,
    folders,
    folderQuery,
    folderVisibility,
    folderTypeFilter,
    folderSortOption,
    folderKeywordTarget,
    ownerNameQuery,
    folderUpdatedWithin,
  ]);

  const filtered: BrowseItem[] =
    activeTab === "predictors"
      ? filteredPredictors
      : activeTab === "datasets"
      ? filteredDatasets
      : [];

  // Global loading/error
  const isLoading =
    (activeTab === "predictors" && isPredictorsLoading) ||
    (activeTab === "datasets" && isDatasetsLoading) ||
    (activeTab === "folders" && isFoldersLoading);

  const errorObj =
    (activeTab === "predictors" ? predictorsError : null) ||
    (activeTab === "datasets" ? datasetsError : null) ||
    (activeTab === "folders" ? foldersError : null);

  const errorMessage = errorObj
    ? (errorObj as any).message || "Failed to load data"
    : null;

  // base list for pinned panel (only predictors/datasets; unfiltered)
  const baseList: BrowseItem[] =
    activeTab === "predictors"
      ? (predictors as BrowseItem[])
      : activeTab === "datasets"
      ? (datasets as BrowseItem[])
      : [];

  // Determine pinned items list for Sidebar
  const pinnedSet =
    activeTab === "predictors"
      ? pinnedPredictorIds
      : activeTab === "datasets"
      ? pinnedDatasetIds
      : pinnedFolderIds;

  // Pinned items for sidebar
  const pinned =
    activeTab === "folders"
      ? pinnedFolderData.map((pf) => ({
          id: String(pf.folder.folder_id),
          title: pf.folder.name,
          owner: false,
          notes: pf.folder.description || "",
          updatedAt: new Date(pf.folder.updated_at).toLocaleDateString(),
        }))
      : baseList.filter((it) => pinnedSet.has(it.id));

  // --- ACTIONS ---

  const toggleSelect = useCallback(
    (id: string) => {
      if (activeTab === "predictors") {
        setSelectedPredictorId((curr) => (curr === id ? null : id));
        setSelectedDatasetId(null);
      } else if (activeTab === "datasets") {
        setSelectedDatasetId((curr) => (curr === id ? null : id));
        setSelectedPredictorId(null);
      }
    },
    [activeTab]
  );

  const togglePin = useCallback(
    (id: string) => {
      if (!user) return;
      if (activeTab === "predictors") {
        pinPredictorMutation.mutate({
          id,
          isPinned: pinnedPredictorIds.has(id),
        });
      } else if (activeTab === "datasets") {
        pinDatasetMutation.mutate({
          id,
          isPinned: pinnedDatasetIds.has(id),
        });
      }
    },
    [
      user,
      activeTab,
      pinnedPredictorIds,
      pinnedDatasetIds,
      pinPredictorMutation,
      pinDatasetMutation,
    ]
  );

  // Folder pin toggle using backend API
  const toggleFolderPin = useCallback(
    (folderId: string) => {
      if (!user) return;
      pinFolderMutation.mutate({
        id: folderId,
        isPinned: pinnedFolderIds.has(folderId),
      });
    },
    [user, pinnedFolderIds, pinFolderMutation]
  );

  const downloadDataset = useCallback(
    async (id: string, _allowAdminAccess?: boolean) => {
      try {
        const datasetId = parseInt(id, 10);
        const { blob, filename } = await downloadDatasetFile(datasetId);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error: any) {
        alert(`Download failed: ${error.message || "Unknown error"}`);
      }
    },
    []
  );

  // Folder expansion - updates Query Cache manually for efficiency
  const handleToggleFolderExpand = useCallback(
    async (folderId: string) => {
      const isExpanded = expandedFolders.has(folderId);

      if (isExpanded) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
      } else {
        const folder = folders.find((f: any) => f.folder_id === folderId);
        if (folder && (!folder.items || folder.items.length === 0)) {
          try {
            const contents = await getPublicFolderContents(folderId);
            // Manually update the query cache so the UI reflects the loaded items
            queryClient.setQueryData(
              ["public-folders"],
              (old: Folder[] | undefined) => {
                if (!old) return old;
                return old.map((f: any) =>
                  f.folder_id === folderId ? { ...f, items: contents } : f
                );
              }
            );
          } catch (error) {
            console.error("Failed to load folder contents:", error);
          }
        }

        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(folderId);
          return next;
        });

        if (folder) addFolderToRecent(folder as any);
      }
    },
    [expandedFolders, folders, queryClient]
  );

  const handleRecentFolderSelect = useCallback((folderId: string) => {
    setExpandedFolders((prev) => new Set(prev).add(folderId));
    setTimeout(() => {
      const element = document.getElementById(`browse-folder-${folderId}`);
      if (element)
        element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const handleItemView = useCallback(
    (itemId: string, itemType: "predictor" | "dataset") => {
      if (itemType === "predictor") {
        window.open(`/predictors/${itemId}/view`, "_blank");
      } else {
        window.open(`/datasets/${itemId}/view`, "_blank");
      }
    },
    []
  );

  // --- Sort toggle handlers for predictors/datasets (AdvancedFilterMenu) ---

  const handlePredictorChronoToggle = useCallback(() => {
    setPredictorSortMode("chrono");
    setPredictorChronoDir((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  const handlePredictorAlphaToggle = useCallback(() => {
    setPredictorSortMode("alpha");
    setPredictorAlphaDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const handleDatasetChronoToggle = useCallback(() => {
    setDatasetSortMode("chrono");
    setDatasetChronoDir((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  const handleDatasetAlphaToggle = useCallback(() => {
    setDatasetSortMode("alpha");
    setDatasetAlphaDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const tabLabel =
    activeTab === "predictors"
      ? "Predictors"
      : activeTab === "datasets"
      ? "Datasets"
      : "Folders";

  const itemCountLabel =
    activeTab === "folders"
      ? `${filteredFolders.length} public folders`
      : `${filtered.length} public ${activeTab}`;

  return (
    <DragDropProvider>
      {/* Sticky sub-header under global nav  */}
      <div className="sticky top-[var(--app-nav-h,3.7rem)] -mt-px z-30 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-3 py-4">
          <div className="text-lg font-semibold tracking-wide">
            Browse {tabLabel}
          </div>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Controls bar */}
      <div className="sticky top-[calc(var(--app-nav-h,3.2rem)+3rem)] z-20 w-full border-b bg-neutral-100/90 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/75">
        <div className="mx-auto max-w-6xl px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[12px] text-neutral-500">
            <span className="hidden sm:inline">{itemCountLabel}</span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            {/* Left cluster: tab switch + search */}
            <div className="flex w-full items-center gap-2">
              <div className="inline-flex h-9.5 overflow-hidden rounded-md border bg-white shadow-sm">
                <button
                  className={`px-3 text-xs font-medium ${
                    activeTab === "predictors"
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                  onClick={() => selectTab("predictors")}
                >
                  Predictors
                </button>
                <button
                  className={`px-3 text-xs font-medium ${
                    activeTab === "datasets"
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                  onClick={() => selectTab("datasets")}
                >
                  Datasets
                </button>
                <button
                  className={`px-3 text-xs font-medium ${
                    activeTab === "folders"
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                  onClick={() => selectTab("folders")}
                >
                  Folders
                </button>
              </div>

              <div className="flex-1 md:max-w-md">
                <SearchBar
                  value={
                    activeTab === "predictors"
                      ? predictorQuery
                      : activeTab === "datasets"
                      ? datasetQuery
                      : folderQuery
                  }
                  onChange={
                    activeTab === "predictors"
                      ? setPredictorQuery
                      : activeTab === "datasets"
                      ? setDatasetQuery
                      : setFolderQuery
                  }
                  placeholder={
                    activeTab === "folders"
                      ? "Search folders…"
                      : activeTab === "predictors"
                      ? "Search predictors…"
                      : "Search datasets…"
                  }
                  onClear={() => {
                    if (activeTab === "predictors") setPredictorQuery("");
                    else if (activeTab === "datasets") setDatasetQuery("");
                    else setFolderQuery("");
                  }}
                />
              </div>
            </div>

            {/* Right cluster: filters (single unified menu per tab) */}
            <div className="flex shrink-0 items-center gap-2">
              <AdvancedFilterMenu
                visibility={
                  activeTab === "predictors"
                    ? predictorVisibility
                    : activeTab === "datasets"
                    ? datasetVisibility
                    : folderVisibility
                }
                onVisibilityChange={
                  activeTab === "predictors"
                    ? setPredictorVisibility
                    : activeTab === "datasets"
                    ? setDatasetVisibility
                    : setFolderVisibility
                }
                keywordTarget={
                  activeTab === "predictors"
                    ? predictorKeywordTarget
                    : activeTab === "datasets"
                    ? datasetKeywordTarget
                    : folderKeywordTarget
                }
                onKeywordTargetChange={
                  activeTab === "predictors"
                    ? setPredictorKeywordTarget
                    : activeTab === "datasets"
                    ? setDatasetKeywordTarget
                    : setFolderKeywordTarget
                }
                updatedWithin={
                  activeTab === "predictors"
                    ? predictorUpdatedWithin
                    : activeTab === "datasets"
                    ? datasetUpdatedWithin
                    : folderUpdatedWithin
                }
                onUpdatedWithinChange={
                  activeTab === "predictors"
                    ? setPredictorUpdatedWithin
                    : activeTab === "datasets"
                    ? setDatasetUpdatedWithin
                    : setFolderUpdatedWithin
                }
                ownerNameQuery={ownerNameQuery}
                onOwnerNameQueryChange={setOwnerNameQuery}
                hasFileOnly={
                  activeTab === "datasets" ? datasetHasFileOnly : undefined
                }
                onHasFileOnlyChange={
                  activeTab === "datasets"
                    ? setDatasetHasFileOnly
                    : undefined
                }
                folderType={
                  activeTab === "folders" ? folderTypeFilter : undefined
                }
                onFolderTypeChange={
                  activeTab === "folders" ? setFolderTypeFilter : undefined
                }
                folderSortOption={
                  activeTab === "folders" ? folderSortOption : undefined
                }
                onFolderSortOptionChange={
                  activeTab === "folders" ? setFolderSortOption : undefined
                }
                // predictor sort props
                predictorChronoDir={
                  activeTab === "predictors" ? predictorChronoDir : undefined
                }
                predictorAlphaDir={
                  activeTab === "predictors" ? predictorAlphaDir : undefined
                }
                onPredictorChronoToggle={
                  activeTab === "predictors"
                    ? handlePredictorChronoToggle
                    : undefined
                }
                onPredictorAlphaToggle={
                  activeTab === "predictors"
                    ? handlePredictorAlphaToggle
                    : undefined
                }
                // dataset sort props
                datasetChronoDir={
                  activeTab === "datasets" ? datasetChronoDir : undefined
                }
                datasetAlphaDir={
                  activeTab === "datasets" ? datasetAlphaDir : undefined
                }
                onDatasetChronoToggle={
                  activeTab === "datasets"
                    ? handleDatasetChronoToggle
                    : undefined
                }
                onDatasetAlphaToggle={
                  activeTab === "datasets"
                    ? handleDatasetAlphaToggle
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content row: pinned left, grid right */}
      <div className="w-full bg-neutral-100">
        <section className="mx-auto flex max-w-6xl gap-4 px-3 py-4">
          {/* Left: Pinned panel */}
          <aside className="w-64 shrink-0">
            <div className="overflow-hidden rounded-md border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b bg-neutral-600 px-3 py-2">
                <div className="text-xs font-semibold text-white">
                  Pinned {tabLabel}
                </div>
                <button
                  onClick={() => setPinnedOpen((v) => !v)}
                  className="rounded-md border px-2 py-1 text-xs text-white hover:bg-neutral-500"
                  aria-expanded={pinnedOpen}
                >
                  {pinnedOpen ? "▾" : "▸"}
                </button>
              </div>
              {pinnedOpen && (
                <div className="space-y-2 p-2">
                  {isSidebarLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-t-2 border-neutral-700" />
                      <span className="text-xs text-neutral-600">Loading...</span>
                    </div>
                  ) : pinned.length === 0 ? (
                    <div className="rounded-md bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-600">
                      Nothing pinned yet
                    </div>
                  ) : (
                    pinned.map((p) => {
                      const isPinned =
                        (activeTab === "predictors" &&
                          pinnedPredictorIds.has(p.id)) ||
                        (activeTab === "datasets" &&
                          pinnedDatasetIds.has(p.id)) ||
                        (activeTab === "folders" &&
                          pinnedFolderIds.has(p.id));

                      const handlePinClick = () => {
                        if (activeTab === "folders") {
                          toggleFolderPin(p.id);
                        } else {
                          togglePin(p.id);
                        }
                      };

                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-xs"
                        >
                          <span className="truncate text-neutral-800">
                            {p.title}
                          </span>
                          <button
                            className={`ml-2 rounded-md border px-2 py-0.5 text-xs ${
                              isPinned
                                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:animate-pulse"
                                : "hover:bg-neutral-50"
                            }`}
                            title={isPinned ? "Unpin" : "Pin"}
                            onClick={handlePinClick}
                          >
                            {isPinned ? "★" : "☆"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* Right: content */}
          <div className="min-w-0 flex-1 space-y-4">
            {/* Loading indicator */}
            {isLoading ? (
              <div className="py-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-neutral-700" />
                  <div className="text-sm text-neutral-700">
                    Loading {tabLabel}…
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-md border bg-white p-4 shadow-sm"
                    >
                      <div className="mb-3 h-5 w-3/4 animate-pulse rounded bg-neutral-100" />
                      <div className="mb-2 h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
                      <div className="h-20 animate-pulse rounded bg-neutral-100" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Error display */}
            {errorMessage && !isLoading ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {/* Main Content Area */}
            {!isLoading && (
              <>
                {activeTab === "folders" ? (
                  /* Folders Tab Content */
                  <div className="space-y-6 -mt-2">
                    {/* Recent Folders Quick Access */}
                    <div className="mt-0 pt-2">
                      <RecentFolders onFolderSelect={handleRecentFolderSelect} />
                    </div>

                    {/* Folders Content */}
                    {filteredFolders.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="text-lg text-neutral-500">
                          No public folders available
                        </div>
                        <div className="mt-2 text-sm text-neutral-400">
                          Public folders will appear here when available
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                        {filteredFolders.map((folder: any) => {
                          const folderId = String(folder.folder_id);
                          const isPinned = pinnedFolderIds.has(folderId);
                          return (
                            <div
                              key={folder.folder_id}
                              id={`browse-folder-${folder.folder_id}`}
                              className="relative"
                            >
                              <FolderCard
                                folder={folder}
                                expanded={expandedFolders.has(
                                  folder.folder_id
                                )}
                                onToggleExpand={handleToggleFolderExpand}
                                onItemView={handleItemView}
                                canEdit={false}
                              />
                              {/* Pin button overlay */}
                              <button
                                className={`absolute right-5.5 top-4 rounded-md border px-2 py-1 text-xs shadow-sm ${
                                  isPinned
                                    ? "bg-neutral-100"
                                    : "bg-white hover:bg-neutral-50"
                                }`}
                                title={isPinned ? "Unpin" : "Pin"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFolderPin(folder.folder_id);
                                }}
                              >
                                {isPinned ? "★" : "☆"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Predictors and Datasets Tab Content */}
                    {activeTab === "predictors" ? (
                      <>
                        {filteredPredictors.length === 0 && !errorMessage ? (
                          <div className="py-12 text-center">
                            <div className="text-lg text-neutral-500">
                              No public predictors available
                            </div>
                            <div className="mt-2 text-sm text-neutral-400">
                              Public predictors will appear here when available
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredPredictors.map((item) => {
                              const isPinned = pinnedPredictorIds.has(item.id);
                              const isSelected =
                                selectedPredictorId === item.id;

                              // `PredictorItem` is what PredictorCard expects; we can
                              // safely treat the BrowsePredictor as a superset.
                              const cardItem: PredictorItem = {
                                ...item,
                                // By definition these are public, and “owner” in this context
                                // is not “me”, so just treat as non-owner for UI.
                                owner: false as any,
                              };

                              return (
                                <PredictorCard
                                  key={item.id}
                                  item={cardItem}
                                  selected={isSelected}
                                  onToggleSelect={toggleSelect}
                                  onView={(id) =>
                                    navigate(`/predictors/${id}`, {
                                      state: { from: "browse" },
                                    })
                                  }
                                  // Browse never shows Edit/Delete
                                  showOwnerActions={false}
                                  // Inline pin controls
                                  showPin
                                  isPinned={isPinned}
                                  onTogglePin={(id) => togglePin(id)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {filteredDatasets.length === 0 && !errorMessage ? (
                          <div className="py-12 text-center">
                            <div className="text-lg text-neutral-500">
                              No public datasets available
                            </div>
                            <div className="mt-2 text-sm text-neutral-400">
                              Public datasets will appear here when available
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredDatasets.map((item) => {
                              const isPinned = pinnedDatasetIds.has(item.id);
                              const isSelected =
                                selectedDatasetId === item.id;

                              const cardItem: DatasetItem = {
                                ...item,
                                // same reasoning as predictors
                                owner: false as any,
                              };

                              return (
                                <DatasetCard
                                  key={item.id}
                                  item={cardItem}
                                  selected={isSelected}
                                  onToggleSelect={toggleSelect}
                                  onView={(id) =>
                                    navigate(`/datasets/${id}/view`)
                                  }
                                  onDownload={downloadDataset}
                                  showOwnerActions={false}
                                  showPin
                                  isPinned={isPinned}
                                  onTogglePin={(id) => togglePin(id)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </DragDropProvider>
  );
}

/**
 * AdvancedFilterMenu
 *
 * Shared dropdown used by all three Browse tabs.
 *
 * Responsibilities:
 * - Wraps all "advanced" controls that refine the main search:
 *     - Search target (title / notes / both).
 *     - Updated-within time windows.
 *     - Owner username filter.
 *     - "Has downloadable file" toggle (datasets only).
 *     - Folder type and folder-level sort (folders only).
 *     - Chronological and alphabetical sort controls for the active tab.
 *
 * Implementation notes:
 * - Uses a controlled `open` state and click-outside detection to close the menu
 *   when the user clicks anywhere else on the page.
 * - Adapts its UI based on which props are provided (datasets vs folders vs predictors).
 * - Sort controls are derived from the currently active tab and bubble up via callbacks.
 */
type AdvancedFilterMenuProps = {
  visibility: Visibility;
  onVisibilityChange: (value: Visibility) => void;

  keywordTarget: KeywordTarget;
  onKeywordTargetChange: (value: KeywordTarget) => void;

  updatedWithin: TimeWindow;
  onUpdatedWithinChange: (value: TimeWindow) => void;

  ownerNameQuery: string;
  onOwnerNameQueryChange: (value: string) => void;

  hasFileOnly?: boolean;
  onHasFileOnlyChange?: (value: boolean) => void;

  folderType?: FolderType;
  onFolderTypeChange?: (value: FolderType) => void;

  folderSortOption?: FolderSortOption;
  onFolderSortOptionChange?: (value: FolderSortOption) => void;

  // Predictors tab sort
  predictorChronoDir?: "asc" | "desc";
  predictorAlphaDir?: "asc" | "desc";
  onPredictorChronoToggle?: () => void;
  onPredictorAlphaToggle?: () => void;

  // Datasets tab sort
  datasetChronoDir?: "asc" | "desc";
  datasetAlphaDir?: "asc" | "desc";
  onDatasetChronoToggle?: () => void;
  onDatasetAlphaToggle?: () => void;
};

function AdvancedFilterMenu({
  keywordTarget,
  onKeywordTargetChange,
  updatedWithin,
  onUpdatedWithinChange,
  ownerNameQuery,
  onOwnerNameQueryChange,
  hasFileOnly,
  onHasFileOnlyChange,
  folderType,
  onFolderTypeChange,
  folderSortOption,
  onFolderSortOptionChange,
  predictorChronoDir,
  predictorAlphaDir,
  onPredictorChronoToggle,
  onPredictorAlphaToggle,
  datasetChronoDir,
  datasetAlphaDir,
  onDatasetChronoToggle,
  onDatasetAlphaToggle,
}: AdvancedFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking anywhere outside the filter menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!open) return;
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [open]);

  // Folder-type pill options (only used on folder tab)
  const folderTypeOptions: { value: FolderType; label: string }[] = [
    { value: "all", label: "All folders" },
    { value: "predictor-only", label: "Predictors only" },
    { value: "dataset-only", label: "Datasets only" },
    { value: "mixed", label: "Mixed content" },
  ];

  // Derive folder sort directions from folderSortOption
  const folderChronoDir: "asc" | "desc" =
    folderSortOption && folderSortOption.field === "date"
      ? folderSortOption.direction
      : "desc";

  const folderAlphaDir: "asc" | "desc" =
    folderSortOption && folderSortOption.field === "name"
      ? folderSortOption.direction
      : "asc";

  const handleFolderChronoToggle = () => {
    if (!onFolderSortOptionChange) return;
    const nextDirection: FolderSortOption["direction"] =
      folderChronoDir === "desc" ? "asc" : "desc";
    onFolderSortOptionChange({
      field: "date",
      direction: nextDirection,
      label:
        nextDirection === "desc"
          ? "Recently updated (newest)"
          : "Recently updated (oldest)",
    } as FolderSortOption);
  };

  const handleFolderAlphaToggle = () => {
    if (!onFolderSortOptionChange) return;
    const nextDirection: FolderSortOption["direction"] =
      folderAlphaDir === "asc" ? "desc" : "asc";
    onFolderSortOptionChange({
      field: "name",
      direction: nextDirection,
      label: nextDirection === "asc" ? "Title A–Z" : "Title Z–A",
    } as FolderSortOption);
  };

  // Choose which context we’re in: predictors, datasets, or folders
  let chronoDir: "asc" | "desc" | undefined;
  let alphaDir: "asc" | "desc" | undefined;
  let onChronoClick: (() => void) | undefined;
  let onAlphaClick: (() => void) | undefined;

  if (
    predictorChronoDir &&
    predictorAlphaDir &&
    onPredictorChronoToggle &&
    onPredictorAlphaToggle
  ) {
    // Predictors tab
    chronoDir = predictorChronoDir;
    alphaDir = predictorAlphaDir;
    onChronoClick = onPredictorChronoToggle;
    onAlphaClick = onPredictorAlphaToggle;
  } else if (
    datasetChronoDir &&
    datasetAlphaDir &&
    onDatasetChronoToggle &&
    onDatasetAlphaToggle
  ) {
    // Datasets tab
    chronoDir = datasetChronoDir;
    alphaDir = datasetAlphaDir;
    onChronoClick = onDatasetChronoToggle;
    onAlphaClick = onDatasetAlphaToggle;
  } else if (folderSortOption && onFolderSortOptionChange) {
    // Folders tab
    chronoDir = folderChronoDir;
    alphaDir = folderAlphaDir;
    onChronoClick = handleFolderChronoToggle;
    onAlphaClick = handleFolderAlphaToggle;
  }

  const hasSortControls =
    chronoDir !== undefined &&
    alphaDir !== undefined &&
    onChronoClick &&
    onAlphaClick;

  const chronoLabel =
    chronoDir === "desc" ? "Newest → oldest" : "Oldest → newest";
  const chronoArrow = chronoDir === "desc" ? "▾" : "▴";

  const alphaLabel = alphaDir === "asc" ? "A–Z" : "Z–A";
  const alphaArrow = alphaDir === "asc" ? "▴" : "▾";

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        className="inline-flex h-9.5 cursor-pointer select-none items-center gap-1 rounded-md border bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
      >
        Filters
        <span
          className={`transition-transform text-[20px] text-neutral-500 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      <div
        className={`absolute right-0 z-20 mt-1 w-72 origin-top-right transform rounded-md border bg-white p-3 text-xs shadow-lg transition-all duration-150 ease-out max-h-[50vh] overflow-y-auto ${
            open
              ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
              : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}  
      >
        {/* Info pill about how filters work */}
        <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-600">
          Filters refine whatever you type into the search bar. If there is
          nothing, it defaults to searching through everything! Start typing to
          refine your search.
        </div>

        {/* Search in */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">Search in</div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["title", "Title"],
                ["notes", "Notes"],
                ["both", "Title + notes"],
              ] as [KeywordTarget, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onKeywordTargetChange(value)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  keywordTarget === value
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Updated within */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">
            Updated within
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["any", "Any time"],
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["365d", "1 year"],
              ] as [TimeWindow, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdatedWithinChange(value)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  updatedWithin === value
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Owner username */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">
            Owner username
          </div>
          <input
            type="text"
            value={ownerNameQuery}
            onChange={(e) => onOwnerNameQueryChange(e.target.value)}
            placeholder="survival_predictor100"
            className="w-full rounded-md border px-2 py-1 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>

        {/* Has file (datasets only) */}
        {typeof hasFileOnly === "boolean" && onHasFileOnlyChange && (
          <div className="mb-3">
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={hasFileOnly}
                onChange={(e) => onHasFileOnlyChange(e.target.checked)}
                className="h-3 w-3 rounded border-neutral-400 text-neutral-900"
              />
              <span>Downloadable dataset</span>
            </label>
          </div>
        )}

        {/* Folder-only controls */}
        {folderType !== undefined && onFolderTypeChange && (
          <div className="mb-3">
            <div className="mb-1 font-semibold text-neutral-700">
              Folder type
            </div>
            <div className="flex flex-wrap gap-1">
              {folderTypeOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFolderTypeChange(value)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    folderType === value
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasSortControls && (
          <>
            {/* Chronological sort */}
            <div className="mb-3">
              <div className="mb-1 font-semibold text-neutral-700">
                Chronological sort
              </div>
              <button
                type="button"
                onClick={onChronoClick}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg-white text-neutral-700 hover:bg-neutral-50"
              >
                <span>{chronoLabel}</span>
                <span className="text-[11px]">{chronoArrow}</span>
              </button>
            </div>

            {/* Alphabetical sort */}
            <div>
              <div className="mb-1 font-semibold text-neutral-700">
                Alphabetical sort
              </div>
              <button
                type="button"
                onClick={onAlphaClick}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg-white text-neutral-700 hover:bg-neutral-50"
              >
                <span>{alphaLabel}</span>
                <span className="text-[11px]">{alphaArrow}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
