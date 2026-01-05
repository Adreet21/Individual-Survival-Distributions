/**
 * DASHBOARD
 *
 * Purpose:
 * - Renders a three-tab workspace: "Predictors", "Datasets", and "Folders".
 * - Shares a single search box and filters across tabs.
 * - Has a sticky toolbar (tabs + search + filter + create) that stays visible while scrolling.
 * - Grid shows cards; clicking a card toggles its "selected" state.
 * - "Create" menu can add a Predictor, Dataset, or Folder.
 *   - The new item is inserted at the top,
 *   - The page switches to the corresponding tab (for datasets),
 *   - The new card is selected.
 *
 * Implementation notes (UPDATED):
 * - TanStack Query (useQuery) manages data fetching and caching.
 * - TanStack Query (useMutation) handles server-side updates.
 * - Local state holds UI state (activeTab, query, ownership, selection, etc.).
 * - useMemo filters each list by query + ownership + time window.
 * - Clicking the page background clears any selection.
 * - A small modal handles delete confirmation.
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toolbar from "../components/Toolbar";
import PredictorCard, { type PredictorItem } from "../components/PredictorCard";
import DatasetCard, { type DatasetItem } from "../components/DatasetCard";
import {
  FolderCard,
  FolderCreationModal,
  FolderSidebar,
  RecentFolders,
  DroppableFolder,
} from "../components/folder";
import FolderEditModal from "../components/folder/modals/FolderEditModal";
import FolderSharingModal from "../components/folder/modals/FolderSharingModal";
import { addFolderToRecent } from "../components/folder/navigation/RecentFolders";
import { DeleteConfirmation } from "../components/DeleteConfirmation";
import DragDropProvider from "../components/DragDropProvider";

import type { Ownership } from "../components/FilterMenu";
import type { DragItem } from "../types/dragDrop";
import { useAuth } from "../auth/AuthContext";
import { useDragDrop } from "../hooks/useDragDrop";
import { api } from "../lib/apiClient";
import {
  downloadDatasetFile,
  deleteDataset,
  mapApiDatasetToUi,
  isUserOwner,
} from "../lib/datasets";
import { deletePredictor, mapApiPredictorToUi } from "../lib/predictors";
import {
  listMyFolders,
  createFolder,
  deleteFolder,
  removeItemFromFolder,
  mapApiFolderToUi,
  type CreateFolderRequest,
  handleFolderApiError,
  isOwnedOrSharedFolder,
  isOwner,
} from "../lib/folders";
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
import type { FolderSortOption, FolderType } from "../components/folder";
import { FolderOpen } from "lucide-react";

type Tab = "predictors" | "datasets" | "folders";
type DeleteType = "predictor" | "dataset" | "folder";
type KeywordTarget = "title" | "notes" | "both";
type TimeWindow = "any" | "7d" | "30d" | "365d";
type SortMode = "chrono" | "alpha";

// Helper: match items updated within a time window
function matchesUpdatedWithin(
  updatedAt: string | null | undefined,
  window: TimeWindow
): boolean {
  if (!updatedAt || window === "any") return true;

  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return true;

  const now = Date.now();
  const days =
    window === "7d" ? 7 : window === "30d" ? 30 : window === "365d" ? 365 : 0;
  if (days <= 0) return true;

  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return parsed >= cutoff;
}

// Helper: derive a sortable timestamp from item fields
function getItemTimestamp(item: any): number {
  const raw =
    item.updatedAtRaw ??
    item.updatedAtSort ??
    item.updated_at ??
    item.updatedAt ??
    null;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = useMemo(
    () => (user as any)?.id ?? (user as any)?.pk,
    [user]
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive active tab from URL (?tab=predictors|datasets|folders)
  const activeTab: Tab = (() => {
    const q = searchParams.get("tab");
    return q === "datasets" || q === "folders" ? (q as Tab) : "predictors";
  })();

  // Track newly created items for highlighting
  const [newlyCreatedDatasetId, setNewlyCreatedDatasetId] = useState<string | null>(null);
  const [newlyCreatedPredictorId, setNewlyCreatedPredictorId] = useState<string | null>(null);
  const [newlyCreatedFolderId, setNewlyCreatedFolderId] = useState<string | null>(null);
  
  // Track pending navigation state (to handle it after tab switch)
  const [pendingNewDatasetId, setPendingNewDatasetId] = useState<string | null>(null);
  const [pendingNewPredictorId, setPendingNewPredictorId] = useState<string | null>(null);

  // Handle navigation state from item creation - Step 1: Switch tab
  useEffect(() => {
    const state = location.state as {
      tab?: string;
      justCreatedId?: number | string;
    } | null;

    if (state?.tab === "datasets") {
      // Store the new dataset ID for later
      if (state.justCreatedId) {
        setPendingNewDatasetId(String(state.justCreatedId));
      }

      // Switch to datasets tab via URL
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("tab", "datasets");
          return sp;
        },
        { replace: true }
      );

      // Clear the location state to prevent re-triggering on refresh
      navigate(location.pathname + "?tab=datasets", { replace: true, state: null });
    } else if (state?.tab === "predictors") {
      // Store the new predictor ID for later
      if (state.justCreatedId) {
        setPendingNewPredictorId(String(state.justCreatedId));
      }

      // Switch to predictors tab via URL
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("tab", "predictors");
          return sp;
        },
        { replace: true }
      );

      // Clear the location state to prevent re-triggering on refresh
      navigate(location.pathname + "?tab=predictors", { replace: true, state: null });
    }
  }, [location.state, setSearchParams, navigate, location.pathname]);

  // Handle navigation state - Step 2: After tab is switched to datasets, apply highlight
  useEffect(() => {
    if (pendingNewDatasetId && activeTab === "datasets") {
      setNewlyCreatedDatasetId(pendingNewDatasetId);
      setPendingNewDatasetId(null);
      // Invalidate datasets query to fetch the new dataset
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    }
  }, [pendingNewDatasetId, activeTab, queryClient]);

  // Handle navigation state - Step 2: After tab is switched to predictors, apply highlight
  useEffect(() => {
    if (pendingNewPredictorId && activeTab === "predictors") {
      setNewlyCreatedPredictorId(pendingNewPredictorId);
      setPendingNewPredictorId(null);
      // Invalidate predictors query to fetch the new predictor
      queryClient.invalidateQueries({ queryKey: ["predictors"] });
    }
  }, [pendingNewPredictorId, activeTab, queryClient]);

  // Clear the dataset highlight after 5 seconds
  useEffect(() => {
    if (newlyCreatedDatasetId) {
      const timer = setTimeout(() => {
        setNewlyCreatedDatasetId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyCreatedDatasetId]);

  // Clear the predictor highlight after 5 seconds
  useEffect(() => {
    if (newlyCreatedPredictorId) {
      const timer = setTimeout(() => {
        setNewlyCreatedPredictorId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyCreatedPredictorId]);

  // Clear the folder highlight after 5 seconds
  useEffect(() => {
    if (newlyCreatedFolderId) {
      const timer = setTimeout(() => {
        setNewlyCreatedFolderId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyCreatedFolderId]);

  const selectTab = (t: Tab) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.set("tab", t);
        return sp;
      },
      { replace: true }
    );
    clearSelection();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- DATA FETCHING (TanStack Query) ---

  const {
    data: predictors = [],
    isLoading: isPredictorsLoading,
  } = useQuery({
    queryKey: ["predictors"],
    queryFn: async () => {
      const data = await api.get<PredictorItem[]>(`/api/predictors/`);
      return Array.isArray(data) ? data : [];
    },
    select: (data) => data.map((it) => mapApiPredictorToUi(it, currentUserId)),
    enabled: activeTab === "predictors",
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  const {
    data: datasets = [],
    isLoading: isDatasetsLoading,
  } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => {
      const data = await api.get<DatasetItem[]>(`/api/datasets/`);
      return Array.isArray(data) ? data : [];
    },
    select: (data) => data.map((it) => mapApiDatasetToUi(it, currentUserId)),
    enabled: activeTab === "datasets",
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  // Folders are always fetched; they are used in sidebar and as drag targets
  const {
    data: folders = [],
    isLoading: isFoldersLoading,
  } = useQuery({
    queryKey: ["folders"],
    queryFn: listMyFolders,
    select: (data) => (Array.isArray(data) ? data.map(mapApiFolderToUi) : []),
    staleTime: 0,
    refetchOnMount: "always", 
    refetchOnWindowFocus: true,
  });

  const isLoading =
    (activeTab === "predictors" && isPredictorsLoading) ||
    (activeTab === "datasets" && isDatasetsLoading) ||
    (activeTab === "folders" && isFoldersLoading);

  // --- FILTER STATE ---

  const [predictorKeywordTarget, setPredictorKeywordTarget] =
    useState<KeywordTarget>("title");
  const [datasetKeywordTarget, setDatasetKeywordTarget] =
    useState<KeywordTarget>("title");
  const [folderKeywordTarget, setFolderKeywordTarget] =
    useState<KeywordTarget>("both");

  const [predictorUpdatedWithin, setPredictorUpdatedWithin] =
    useState<TimeWindow>("any");
  const [datasetUpdatedWithin, setDatasetUpdatedWithin] =
    useState<TimeWindow>("any");
  const [folderUpdatedWithin, setFolderUpdatedWithin] =
    useState<TimeWindow>("any");

  const [predictorOwnership, setPredictorOwnership] =
    useState<Ownership>("all");
  const [datasetOwnership, setDatasetOwnership] = useState<Ownership>("all");
  const [folderOwnership, setFolderOwnership] = useState<Ownership>("all");

  const [predictorSortMode, setPredictorSortMode] =
    useState<SortMode>("chrono");
  const [predictorChronoDir, setPredictorChronoDir] =
    useState<"asc" | "desc">("desc");
  const [predictorAlphaDir, setPredictorAlphaDir] =
    useState<"asc" | "desc">("asc");

  const [datasetSortMode, setDatasetSortMode] = useState<SortMode>("chrono");
  const [datasetChronoDir, setDatasetChronoDir] =
    useState<"asc" | "desc">("desc");
  const [datasetAlphaDir, setDatasetAlphaDir] =
    useState<"asc" | "desc">("asc");

  // --- MUTATIONS ---

  const deletePredictorMutation = useMutation({
    mutationFn: deletePredictor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["predictors"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const deleteDatasetMutation = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: (createdFolder) => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      // Set the newly created folder ID for highlighting after data is refreshed
      if (createdFolder?.folder_id) {
        setNewlyCreatedFolderId(String(createdFolder.folder_id));
      }
    },
    onError: (error: any) => {
      const folderError = handleFolderApiError(error);
      setFolderError(folderError.message);
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: (_data, folderId) => {
      // Optimistically remove deleted folder from cache
      queryClient.setQueryData(["folders"], (prev: any) => {
        if (!Array.isArray(prev)) return prev;
        return prev.filter(
          (f) => f.folder_id !== folderId && f.id !== folderId
        );
      });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const removeFromFolderMutation = useMutation({
    mutationFn: ({
      folderId,
      itemType,
      itemId,
    }: {
      folderId: string;
      itemType: "predictor" | "dataset";
      itemId: string;
    }) => removeItemFromFolder(folderId, itemType, itemId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      if (variables.itemType === "predictor") {
        queryClient.invalidateQueries({ queryKey: ["predictors"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["datasets"] });
      }
    },
  });

  // --- LOCAL UI STATE ---

  const [selection, setSelection] = useState<{
    predictorId: string | null;
    datasetId: string | null;
  }>({
    predictorId: null,
    datasetId: null,
  });

  const [tabState, setTabState] = useState({
    predictorQuery: "",
    datasetQuery: "",
    folderQuery: "",
  });

  const [deleteContext, setDeleteContext] = useState<{
    id: string;
    title: string;
    type: DeleteType;
  } | null>(null);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [editingFolder, setEditingFolder] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [sharingFolder, setSharingFolder] = useState<any | null>(null);
  const [isSharingModalOpen, setIsSharingModalOpen] = useState(false);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const [folderSortOption, setFolderSortOption] =
    useState<FolderSortOption>(DEFAULT_FOLDER_SORT);
  const [folderTypeFilter, setFolderTypeFilter] = useState<FolderType>("all");
  const [currentFolderView, setCurrentFolderView] = useState<string | null>(
    null
  );

  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());

  const { moveItem, isItemLoading } = useDragDrop(() => {
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    queryClient.invalidateQueries({ queryKey: ["predictors"] });
    queryClient.invalidateQueries({ queryKey: ["datasets"] });
  });

  // --- FILTERED LISTS ---

  const filteredPredictors = useMemo(() => {
    const keywords = tabState.predictorQuery.trim()
      ? tabState.predictorQuery.trim().split(/\s+/)
      : [];

    const filter: PredictorFilterState = {
      keywords,
      keywordTarget: predictorKeywordTarget,
      ownership: predictorOwnership,
      visibility: "all",
    };

    let base = filterPredictors(predictors, filter);

    if (predictorUpdatedWithin !== "any") {
      base = base.filter((item) =>
        matchesUpdatedWithin(
          (item as any).updatedAtRaw ??
            (item as any).updatedAtSort ??
            (item as any).updatedAt,
          predictorUpdatedWithin
        )
      );
    }

    const sorted = [...base];

    if (predictorSortMode === "chrono") {
      sorted.sort((a, b) => {
        const aTime = getItemTimestamp(a);
        const bTime = getItemTimestamp(b);
        const cmp = aTime - bTime;
        return predictorChronoDir === "asc" ? cmp : -cmp;
      });
    } else {
      sorted.sort((a, b) => {
        const aTitle = (a.title ?? "").toLowerCase();
        const bTitle = (b.title ?? "").toLowerCase();
        const cmp = aTitle.localeCompare(bTitle);
        return predictorAlphaDir === "asc" ? cmp : -cmp;
      });
    }

    // If there's a newly created predictor, move it to the top
    if (newlyCreatedPredictorId) {
      const newPredictorIndex = sorted.findIndex(
        (p) => String(p.id) === newlyCreatedPredictorId
      );
      if (newPredictorIndex > 0) {
        const [newPredictor] = sorted.splice(newPredictorIndex, 1);
        sorted.unshift(newPredictor);
      }
    }

    return sorted;
  }, [
    predictors,
    tabState.predictorQuery,
    predictorOwnership,
    predictorKeywordTarget,
    predictorUpdatedWithin,
    predictorSortMode,
    predictorChronoDir,
    predictorAlphaDir,
    newlyCreatedPredictorId,
  ]);

  const filteredDatasets = useMemo(() => {
    const keywords = tabState.datasetQuery.trim()
      ? tabState.datasetQuery.trim().split(/\s+/)
      : [];

    const filter: DatasetFilterState = {
      keywords,
      keywordTarget: datasetKeywordTarget,
      ownership: datasetOwnership,
      visibility: "all",
    };

    let base = filterDatasets(datasets, filter);

    if (datasetUpdatedWithin !== "any") {
      base = base.filter((item) =>
        matchesUpdatedWithin(
          (item as any).updatedAtRaw ??
            (item as any).updatedAtSort ??
            (item as any).updatedAt,
          datasetUpdatedWithin
        )
      );
    }

    const sorted = [...base];

    if (datasetSortMode === "chrono") {
      sorted.sort((a, b) => {
        const aTime = getItemTimestamp(a);
        const bTime = getItemTimestamp(b);
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

    // If there's a newly created dataset, move it to the top
    if (newlyCreatedDatasetId) {
      const newDatasetIndex = sorted.findIndex(
        (d) => String(d.id) === newlyCreatedDatasetId
      );
      if (newDatasetIndex > 0) {
        const [newDataset] = sorted.splice(newDatasetIndex, 1);
        sorted.unshift(newDataset);
      }
    }

    return sorted;
  }, [
    datasets,
    tabState.datasetQuery,
    datasetOwnership,
    datasetKeywordTarget,
    datasetUpdatedWithin,
    datasetSortMode,
    datasetChronoDir,
    datasetAlphaDir,
    newlyCreatedDatasetId,
  ]);

  // Pre-filter folders to only show owned or shared folders in Dashboard
  const accessibleFolders = useMemo(() => {
    if (!currentUserId) return [];
    return folders.filter((folder) =>
      isOwnedOrSharedFolder(folder, currentUserId)
    );
  }, [folders, currentUserId]);

  const filteredFolders = useMemo(() => {
    const keywords = tabState.folderQuery.trim()
      ? tabState.folderQuery.trim().split(/\s+/)
      : [];

    const filter: FolderFilterState = {
      keywords,
      keywordTarget: folderKeywordTarget,
      ownership: folderOwnership,
      visibility: "all",
      folderType: folderTypeFilter,
    };

    let list = filterFolders(accessibleFolders, filter, currentUserId);

    if (folderUpdatedWithin !== "any") {
      list = list.filter((folder) =>
        matchesUpdatedWithin(
          (folder as any).updatedAtRaw ??
            (folder as any).updatedAtSort ??
            (folder as any).updated_at ??
            (folder as any).updatedAt,
          folderUpdatedWithin
        )
      );
    }

    const sorted = sortFolders(list, folderSortOption);

    // If there's a newly created folder, move it to the top
    if (newlyCreatedFolderId) {
      const newFolderIndex = sorted.findIndex(
        (f) => String(f.folder_id) === String(newlyCreatedFolderId)
      );
      if (newFolderIndex > 0) {
        const [newFolder] = sorted.splice(newFolderIndex, 1);
        sorted.unshift(newFolder);
      }
    }

    return sorted;
  }, [
    accessibleFolders,
    tabState.folderQuery,
    folderOwnership,
    folderTypeFilter,
    folderSortOption,
    folderKeywordTarget,
    folderUpdatedWithin,
    currentUserId,
    newlyCreatedFolderId,
  ]);

  // --- SELECTION & NAVIGATION ---

  const toggleSelect = useCallback(
    (id: string) => {
      if (activeTab === "predictors") {
        setSelection((prev) => ({
          predictorId: prev.predictorId === id ? null : id,
          datasetId: null,
        }));
      } else {
        setSelection((prev) => ({
          datasetId: prev.datasetId === id ? null : id,
          predictorId: null,
        }));
      }
    },
    [activeTab]
  );

  const clearSelection = useCallback(() => {
    setSelection({ predictorId: null, datasetId: null });
  }, []);

  const createPredictor = useCallback(() => {
    navigate("/predictors/new");
  }, [navigate]);

  const addDataset = useCallback(() => {
    navigate("/datasets/new");
  }, [navigate]);

  // --- FOLDER MANAGEMENT ---

  const handleCreateFolder = useCallback(() => {
    setShowFolderModal(true);
    setFolderError(null);
  }, []);

  async function handleFolderCreation(data: CreateFolderRequest) {
    setFolderError(null);
    try {
      await createFolderMutation.mutateAsync(data);
      setShowFolderModal(false);
      
      // Switch to folders tab (highlighting is handled in mutation onSuccess)
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("tab", "folders");
          return sp;
        },
        { replace: true }
      );
    } catch {
      // Error handled in mutation onError
    }
  }

  function handleToggleFolderExpansion(folderId: string) {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
        const folder = folders.find((f) => f.folder_id === folderId);
        if (folder) {
          addFolderToRecent(folder);
        }
      }
      return newSet;
    });
  }

  function handleRecentFolderSelect(folderId: string) {
    setCurrentFolderView(folderId);
    setExpandedFolders((prev) => new Set(prev).add(folderId));
    setTimeout(() => {
      const element = document.getElementById(`folder-${folderId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }

  function handleFolderDelete(folderId: string) {
    const folder = folders.find((f) => f.folder_id === folderId);
    setPendingFolderDelete({
      id: folderId,
      name: folder?.name ?? "this folder",
    });
  }

  async function confirmFolderDelete() {
    if (!pendingFolderDelete || isDeletingFolder) return;

    const folderId = pendingFolderDelete.id;
    const prevFolders = queryClient.getQueryData(["folders"]);

    setIsDeletingFolder(true);
    setLoadingFolders((prev) => new Set(prev).add(folderId));

    queryClient.setQueryData(["folders"], (prev: any) => {
      if (!Array.isArray(prev)) return prev;
      return prev.filter(
        (f) => f.folder_id !== folderId && f.id !== folderId
      );
    });

    try {
      await deleteFolderMutation.mutateAsync(folderId);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
      setPendingFolderDelete(null);
    } catch (error: any) {
      console.error("Failed to delete folder:", error);
      queryClient.setQueryData(["folders"], prevFolders);
    } finally {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
      setIsDeletingFolder(false);
    }
  }

  const handleRemoveFromFolder = useCallback(
    async (
      itemId: string,
      itemType: "predictor" | "dataset",
      folderId: string
    ) => {
      setLoadingFolders((prev) => new Set(prev).add(folderId));

      try {
        await removeFromFolderMutation.mutateAsync({
          folderId,
          itemType,
          itemId,
        });
      } catch (error: any) {
        console.error("Failed to remove item from folder:", error);
      } finally {
        setLoadingFolders((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [removeFromFolderMutation]
  );

  const handleDrop = useCallback(
    (item: DragItem, folderId?: string) => {
      moveItem(item, folderId);
    },
    [moveItem]
  );

  const editItem = useCallback(
    (id: string) => {
      if (activeTab === "predictors") {
        navigate(`/predictors/${id}/edit`);
      } else {
        navigate(`/datasets/${id}/edit`);
      }
    },
    [activeTab, navigate]
  );

  // Draft edit route for predictors (used by PredictorCard via onDraftEdit)
  const draftEditItem = useCallback(
    (id: string) => {
      if (activeTab === "predictors") {
        navigate(`/predictors/draft/${id}/edit`);
      }
    },
    [activeTab, navigate]
  );

  const viewItem = useCallback(
    (id: string) => {
      if (activeTab === "predictors") {
        navigate(`/predictors/${id}`, { state: { from: "dashboard" } });
      } else {
        navigate(`/datasets/${id}/view`);
      }
    },
    [activeTab, navigate]
  );

  // --- DOWNLOAD ---

  async function downloadItem(
    id: string,
    allowAdminAccess: boolean,
    isOwnerFlag: boolean
  ) {
    try {
      if (!isOwnerFlag && !allowAdminAccess) {
        alert(
          "Download blocked: External access to this dataset has been disabled."
        );
        return;
      }
      const datasetId = parseInt(id, 10);
      const { blob, filename } = await downloadDatasetFile(datasetId);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanFilename = filename.replace(/^"|"$/g, "");
      link.href = url;
      link.download = cleanFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Download failed: ${error.message || "Unknown error"}`);
    }
  }

  // --- DELETE HANDLERS ---

  const promptDelete = useCallback(
    (id: string, title: string, type: DeleteType) => {
      setDeleteContext({ id, title, type });
    },
    []
  );

  async function handleConfirmDelete() {
    if (!deleteContext) return;
    const { id, type } = deleteContext;

    try {
      if (type === "predictor") {
        await deletePredictorMutation.mutateAsync(id);
        if (selection.predictorId === id) {
          setSelection((prev) => ({ ...prev, predictorId: null }));
        }
      } else if (type === "dataset") {
        await deleteDatasetMutation.mutateAsync(parseInt(id, 10));
        if (selection.datasetId === id) {
          setSelection((prev) => ({ ...prev, datasetId: null }));
        }
      } else if (type === "folder") {
        await deleteFolderMutation.mutateAsync(id);
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }

      setDeleteContext(null);
    } catch (error: any) {
      const msg =
        error?.details?.error || error?.message || "Failed to delete item";
      alert(`Delete failed: ${msg}`);
    }
  }

  const isDeleteLoading =
    deletePredictorMutation.isPending ||
    deleteDatasetMutation.isPending ||
    deleteFolderMutation.isPending;

  // --- SORT TOGGLES (PREDICTORS / DATASETS) ---

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

  // --- RENDER ---

  return (
    <DragDropProvider>
      <section
        className="w-full space-y-6 bg-neutral-100 pt-4"
        onClick={clearSelection}
        role="presentation"
      >
        {/* Welcome header */}
        <div
          className="mx-auto max-w-6xl px-3 pt-8 pb-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <h1 className="pb-1 pt-2 text-3xl font-extrabold tracking-tight text-neutral-900 md:text-4xl">
            Welcome{" "}
            {user
              ? user.first_name?.trim()
                ? user.first_name
                : user.username
              : "User"}
            !
          </h1>

          <h2 className="text-sm font-medium tracking-tight text-neutral-600 md:text-base">
            Find your datasets and predictors below.
          </h2>
        </div>

        {/* Sticky toolbar under navbar */}
        <div
          className="sticky top-[var(--app-nav-h,3.7rem)] z-40 w-full border-b bg-neutral-100/90 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/75"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto max-w-6xl px-3 py-4 pt-5">
            <Toolbar
              activeTab={activeTab}
              onTabChange={(t) => {
                selectTab(t);
              }}
              query={
                activeTab === "predictors"
                  ? tabState.predictorQuery
                  : activeTab === "datasets"
                  ? tabState.datasetQuery
                  : tabState.folderQuery
              }
              onQueryChange={(value) => {
                if (activeTab === "predictors") {
                  setTabState((prev) => ({ ...prev, predictorQuery: value }));
                } else if (activeTab === "datasets") {
                  setTabState((prev) => ({ ...prev, datasetQuery: value }));
                } else {
                  setTabState((prev) => ({ ...prev, folderQuery: value }));
                }
              }}
              onCreatePredictor={createPredictor}
              onCreateDataset={addDataset}
              onCreateFolder={handleCreateFolder}
              filterControl={
                activeTab === "folders" ? (
                  <FolderAdvancedFilterMenu
                    keywordTarget={folderKeywordTarget}
                    onKeywordTargetChange={setFolderKeywordTarget}
                    updatedWithin={folderUpdatedWithin}
                    onUpdatedWithinChange={setFolderUpdatedWithin}
                    folderType={folderTypeFilter}
                    onFolderTypeChange={setFolderTypeFilter}
                    sortOption={folderSortOption}
                    onSortOptionChange={setFolderSortOption}
                    ownership={folderOwnership}
                    onOwnershipChange={setFolderOwnership}
                  />
                ) : (
                  <AdvancedFilterMenu
                    keywordTarget={
                      activeTab === "predictors"
                        ? predictorKeywordTarget
                        : datasetKeywordTarget
                    }
                    onKeywordTargetChange={
                      activeTab === "predictors"
                        ? setPredictorKeywordTarget
                        : setDatasetKeywordTarget
                    }
                    updatedWithin={
                      activeTab === "predictors"
                        ? predictorUpdatedWithin
                        : datasetUpdatedWithin
                    }
                    onUpdatedWithinChange={
                      activeTab === "predictors"
                        ? setPredictorUpdatedWithin
                        : setDatasetUpdatedWithin
                    }
                    ownership={
                      activeTab === "predictors"
                        ? predictorOwnership
                        : datasetOwnership
                    }
                    onOwnershipChange={
                      activeTab === "predictors"
                        ? setPredictorOwnership
                        : setDatasetOwnership
                    }
                    sortMode={
                      activeTab === "predictors"
                        ? predictorSortMode
                        : datasetSortMode
                    }
                    chronoDir={
                      activeTab === "predictors"
                        ? predictorChronoDir
                        : datasetChronoDir
                    }
                    alphaDir={
                      activeTab === "predictors"
                        ? predictorAlphaDir
                        : datasetAlphaDir
                    }
                    onChronoToggle={
                      activeTab === "predictors"
                        ? handlePredictorChronoToggle
                        : handleDatasetChronoToggle
                    }
                    onAlphaToggle={
                      activeTab === "predictors"
                        ? handlePredictorAlphaToggle
                        : handleDatasetAlphaToggle
                    }
                  />
                )
              }
            />
          </div>
        </div>

        {/* Main content area */}
        <div className="mx-auto flex max-w-6xl gap-4 px-3 pb-6">
          <FolderSidebar
            onItemMoved={async (_itemId, _folderId) => {
              queryClient.invalidateQueries({ queryKey: ["folders"] });
            }}
            className={
              activeTab === "folders"
                ? "hidden"
                : "w-64 shrink-0 overflow-hidden rounded-md border border-black bg-white shadow-sm"
            }
          />

          {isLoading &&
          ((activeTab === "predictors" && predictors.length === 0) ||
            (activeTab === "datasets" && datasets.length === 0) ||
            (activeTab === "folders" && folders.length === 0)) ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-neutral-700" />
                <div className="text-sm text-neutral-700">
                  Loading {activeTab}...
                </div>
              </div>
              <div
                className={`mt-4 grid gap-4 ${
                  activeTab === "folders"
                    ? "sm:grid-cols-1 lg:grid-cols-2"
                    : "sm:grid-cols-2 lg:grid-cols-3"
                }`}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg border border-black bg-white p-4"
                  >
                    <div className="mb-3 h-5 w-3/4 rounded bg-neutral-200" />
                    <div className="mb-2 h-3 w-1/2 rounded bg-neutral-200" />
                    <div className="h-20 rounded bg-neutral-200" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1 transition-all duration-300">
              {activeTab === "folders" ? (
                <div
                  className="space-y-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <RecentFolders
                      onFolderSelect={handleRecentFolderSelect}
                      currentFolderId={currentFolderView || undefined}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                    {filteredFolders.map((folder) => {
                      const isFolderOwner = isOwner(folder, currentUserId);

                      return (
                        <div
                          key={`folder-${folder.folder_id}`}
                          id={`folder-${folder.folder_id}`}
                          className={
                            currentFolderView === folder.folder_id
                              ? "rounded-xl ring-2 ring-neutral-500"
                              : ""
                          }
                        >
                          <FolderCard
                            folder={folder}
                            expanded={expandedFolders.has(folder.folder_id)}
                            onToggleExpand={handleToggleFolderExpansion}
                            onEdit={
                              isFolderOwner
                                ? (folderId) => {
                                    const f = folders.find(
                                      (x) => x.folder_id === folderId
                                    );
                                    if (f) {
                                      setEditingFolder(f);
                                      setIsEditModalOpen(true);
                                    }
                                  }
                                : undefined
                            }
                            onDelete={
                              isFolderOwner ? handleFolderDelete : undefined
                            }
                            onShare={
                              isFolderOwner
                                ? (folderId) => {
                                    const f = folders.find(
                                      (x) => x.folder_id === folderId
                                    );
                                    if (f) {
                                      setSharingFolder(f);
                                      setIsSharingModalOpen(true);
                                    }
                                  }
                                : undefined
                            }
                            onDrop={handleDrop}
                            onItemSelect={(itemId, itemType) => {
                              if (itemType === "predictor") {
                                setSelection((prev) => ({
                                  predictorId:
                                    prev.predictorId === itemId ? null : itemId,
                                  datasetId: null,
                                }));
                              } else {
                                setSelection((prev) => ({
                                  datasetId:
                                    prev.datasetId === itemId ? null : itemId,
                                  predictorId: null,
                                }));
                              }
                            }}
                            onItemEdit={
                              isFolderOwner
                                ? (itemId) => editItem(itemId)
                                : undefined
                            }
                            onItemDelete={
                              isFolderOwner
                                ? (itemId, itemType) => {
                                    const item =
                                      itemType === "predictor"
                                        ? predictors.find(
                                            (p) => p.id === itemId
                                          )
                                        : datasets.find(
                                            (d) => d.id === itemId
                                          );
                                    const foundItem =
                                      item ||
                                      (folder.items?.find(
                                        (i) => i.id === itemId
                                      ) as any);
                                    if (foundItem) {
                                      promptDelete(
                                        itemId,
                                        foundItem.title ?? "Item",
                                        itemType
                                      );
                                    }
                                  }
                                : undefined
                            }
                            onItemView={(itemId) => viewItem(itemId)}
                            onRemoveFromFolder={
                              isFolderOwner
                                ? (itemId, itemType) =>
                                    handleRemoveFromFolder(
                                      itemId,
                                      itemType,
                                      folder.folder_id
                                    )
                                : undefined
                            }
                            selectedItems={
                              new Set([
                                ...(selection.predictorId
                                  ? [selection.predictorId]
                                  : []),
                                ...(selection.datasetId
                                  ? [selection.datasetId]
                                  : []),
                              ])
                            }
                            currentUserId={currentUserId}
                            canEdit={isFolderOwner}
                            isLoading={
                              loadingFolders.has(folder.folder_id) ||
                              removeFromFolderMutation.isPending
                            }
                            isNew={String(folder.folder_id) === String(newlyCreatedFolderId)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {filteredFolders.length === 0 && !isLoading && (
                    <div className="py-12 text-center">
                      <div className="text-lg text-neutral-500">
                        No folders found
                      </div>
                      <div className="mt-2 text-sm text-neutral-400">
                        Create a folder to organize your predictors and datasets
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <DroppableFolder
                  folder={null}
                  onDrop={handleDrop}
                  isLoading={isItemLoading}
                  className="rounded-xl p-2 transition-all duration-200"
                >
                  <div
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activeTab === "predictors"
                      ? filteredPredictors
                          .filter((item) => !item.folderId)
                          .map((it) => (
                            <PredictorCard
                              key={it.id}
                              item={it}
                              selected={selection.predictorId === it.id}
                              onToggleSelect={toggleSelect}
                              onEdit={editItem}
                              onDraftEdit={draftEditItem}
                              onDelete={(id) =>
                                promptDelete(id, it.title, "predictor")
                              }
                              onView={viewItem}
                              onDrop={handleDrop}
                              isLoading={isItemLoading(it.id)}
                              isNew={String(it.id) === newlyCreatedPredictorId}
                            />
                          ))
                      : filteredDatasets
                          .filter((item) => !item.folderId)
                          .map((it) => (
                            <DatasetCard
                              key={it.id}
                              item={{ ...it, owner: Boolean(it.owner) }}
                              selected={selection.datasetId === it.id}
                              onToggleSelect={toggleSelect}
                              onEdit={editItem}
                              onDelete={(id) =>
                                promptDelete(id, it.title, "dataset")
                              }
                              onView={viewItem}
                              onDownload={() => {
                                const ownerFlag = isUserOwner(
                                  it.owner,
                                  currentUserId
                                );
                                downloadItem(
                                  it.id,
                                  "allow_admin_access" in it
                                    ? it.allow_admin_access ?? false
                                    : false,
                                  ownerFlag
                                );
                              }}
                              onDrop={handleDrop}
                              isLoading={isItemLoading(it.id)}
                              isNew={String(it.id) === newlyCreatedDatasetId}
                            />
                          ))}

                    {(activeTab === "predictors"
                      ? filteredPredictors
                      : filteredDatasets
                    )
                      .filter((item) => !item.folderId).length === 0 &&
                      !isLoading && (
                        <div className="col-span-full flex items-center justify-center py-12 text-center">
                          <div className="max-w-sm">
                            <p className="flex items-center justify-center gap-2 text-sm text-neutral-500">
                              <FolderOpen className="h-4 w-4" />
                              No {activeTab} in your main collection
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">
                              Drag items from folders here to move them back to
                              your main collection.
                            </p>
                          </div>
                        </div>
                      )}
                  </div>
                </DroppableFolder>
              )}

              {/* Delete / folder modals & folder creation */}
              <DeleteConfirmation
                open={!!deleteContext}
                name={deleteContext?.title ?? ""}
                description={
                  deleteContext?.type === "folder"
                    ? "Items inside this folder will be preserved."
                    : "This action cannot be undone."
                }
                onCancel={() => setDeleteContext(null)}
                onConfirm={handleConfirmDelete}
                isLoading={isDeleteLoading}
              />

              <DeleteConfirmation
                open={!!pendingFolderDelete}
                name={pendingFolderDelete?.name ?? ""}
                description="Items inside this folder will be preserved."
                onCancel={() =>
                  !isDeletingFolder && setPendingFolderDelete(null)
                }
                onConfirm={confirmFolderDelete}
                isLoading={isDeletingFolder}
              />

              <FolderCreationModal
                isOpen={showFolderModal}
                onClose={() => {
                  setShowFolderModal(false);
                  setFolderError(null);
                }}
                onCreateFolder={handleFolderCreation}
                availablePredictors={predictors.filter((p) => !p.folderId)}
                availableDatasets={datasets.filter((d) => !d.folderId)}
                isLoading={createFolderMutation.isPending}
                error={folderError}
              />

              {editingFolder && (
                <FolderEditModal
                  isOpen={isEditModalOpen}
                  onClose={() => {
                    setIsEditModalOpen(false);
                    setEditingFolder(null);
                  }}
                  folder={editingFolder}
                  onFolderUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["folders"] });
                  }}
                />
              )}

              {sharingFolder && (
                <FolderSharingModal
                  isOpen={isSharingModalOpen}
                  onClose={() => {
                    setIsSharingModalOpen(false);
                    setSharingFolder(null);
                  }}
                  folder={sharingFolder}
                  onPermissionsUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["folders"] });
                  }}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </DragDropProvider>
  );
}

/**
 * Advanced filter menu for predictors and datasets.
 * Includes:
 * - Ownership
 * - Search target (title / notes / both)
 * - Updated-within time window
 * - Chronological sort toggle (newest/oldest)
 * - Alphabetical sort toggle (A–Z / Z–A)
 *
 * The chronological and alphabetical sort buttons are independent toggles in the UI,
 * with the currently active mode controlled internally by sortMode.
 */
type AdvancedFilterMenuProps = {
  keywordTarget: KeywordTarget;
  onKeywordTargetChange: (value: KeywordTarget) => void;

  updatedWithin: TimeWindow;
  onUpdatedWithinChange: (value: TimeWindow) => void;

  ownership: Ownership;
  onOwnershipChange: (value: Ownership) => void;

  sortMode: SortMode;
  chronoDir: "asc" | "desc";
  alphaDir: "asc" | "desc";
  onChronoToggle: () => void;
  onAlphaToggle: () => void;
};

function AdvancedFilterMenu({
  keywordTarget,
  onKeywordTargetChange,
  updatedWithin,
  onUpdatedWithinChange,
  ownership,
  onOwnershipChange,
  chronoDir,
  alphaDir,
  onChronoToggle,
  onAlphaToggle,
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
        className={`absolute right-0 z-20 mt-1 w-72 origin-top-right transform rounded-md border bg-white p-3 text-xs shadow-lg transition-all duration-150 ease-out ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ownership */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">Ownership</div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "All items"],
                ["owner", "Owned by me"],
                ["viewer", "Shared with me"],
              ] as [Ownership, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onOwnershipChange(value)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  ownership === value
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

        {/* Chronological sort (independent toggle) */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">
            Chronological sort
          </div>
          <button
            type="button"
            onClick={onChronoToggle}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg-white text-neutral-700 hover:bg-neutral-50"
          >
            <span>{chronoLabel}</span>
            <span className="text-[11px]">{chronoArrow}</span>
          </button>
        </div>

        {/* Alphabetical sort (independent toggle) */}
        <div>
          <div className="mb-1 font-semibold text-neutral-700">
            Alphabetical sort
          </div>
          <button
            type="button"
            onClick={onAlphaToggle}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg-white text-neutral-700 hover:bg-neutral-50"
          >
            <span>{alphaLabel}</span>
            <span className="text-[11px]">{alphaArrow}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Folder-specific filter menu.
 * Includes:
 * - Ownership & access
 * - Search target (title / notes / both)
 * - Updated-within time window
 * - Folder type (predictors / datasets / mixed / all)
 * - Chronological sort toggle (newest/oldest)
 * - Alphabetical sort toggle (A–Z / Z–A)
 *
 * Uses the same click-outside behavior and open/close animation as the main filter menu.
 */
type FolderAdvancedFilterMenuProps = {
  keywordTarget: KeywordTarget;
  onKeywordTargetChange: (value: KeywordTarget) => void;

  updatedWithin: TimeWindow;
  onUpdatedWithinChange: (value: TimeWindow) => void;

  folderType: FolderType;
  onFolderTypeChange: (value: FolderType) => void;

  sortOption: FolderSortOption;
  onSortOptionChange: (value: FolderSortOption) => void;

  ownership: Ownership;
  onOwnershipChange: (value: Ownership) => void;
};

function FolderAdvancedFilterMenu({
  keywordTarget,
  onKeywordTargetChange,
  updatedWithin,
  onUpdatedWithinChange,
  folderType,
  onFolderTypeChange,
  sortOption,
  onSortOptionChange,
  ownership,
  onOwnershipChange,
}: FolderAdvancedFilterMenuProps) {
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

  const folderChronoDir: "asc" | "desc" =
    sortOption && sortOption.field === "date"
      ? sortOption.direction
      : "desc";

  const folderAlphaDir: "asc" | "desc" =
    sortOption && sortOption.field === "name"
      ? sortOption.direction
      : "asc";

  const chronoLabel =
    folderChronoDir === "desc" ? "Newest → oldest" : "Oldest → newest";
  const chronoArrow = folderChronoDir === "desc" ? "▾" : "▴";

  const alphaLabel = folderAlphaDir === "asc" ? "A–Z" : "Z–A";
  const alphaArrow = folderAlphaDir === "asc" ? "▴" : "▾";

  const handleFolderChronoToggle = () => {
    const nextDirection: FolderSortOption["direction"] =
      folderChronoDir === "desc" ? "asc" : "desc";
    onSortOptionChange({
      field: "date",
      direction: nextDirection,
      label:
        nextDirection === "desc"
          ? "Recently updated (newest)"
          : "Recently updated (oldest)",
    } as FolderSortOption);
  };

  const handleFolderAlphaToggle = () => {
    const nextDirection: FolderSortOption["direction"] =
      folderAlphaDir === "asc" ? "desc" : "asc";
    onSortOptionChange({
      field: "name",
      direction: nextDirection,
      label: nextDirection === "asc" ? "Title A–Z" : "Title Z–A",
    } as FolderSortOption);
  };

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
        className={`absolute right-0 z-20 mt-1 w-72 origin-top-right transform rounded-md border bg-white p-3 text-xs shadow-lg transition-all duration-150 ease-out ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ownership & access (dashboard-focused wording) */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">
            Ownership & access
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "Owned or shared with me"],
                ["owner", "Owned by me"],
                ["viewer", "Shared (I can access)"],
              ] as [Ownership, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onOwnershipChange(value)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  ownership === value
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

        {/* Folder type */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">Folder type</div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "All"],
                ["predictors", "Predictors"],
                ["datasets", "Datasets"],
                ["mixed", "Mixed"],
              ] as [FolderType, string][]
            ).map(([value, label]) => (
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

        {/* Sort (independent toggles, same style as predictors/datasets) */}
        <div className="mb-3">
          <div className="mb-1 font-semibold text-neutral-700">
            Chronological sort
          </div>
          <button
            type="button"
            onClick={handleFolderChronoToggle}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg-white text-neutral-700 hover:bg-neutral-50"
          >
            <span>{chronoLabel}</span>
            <span className="text-[11px]">{chronoArrow}</span>
          </button>
        </div>

        <div>
          <div className="mb-1 font-semibold text-neutral-700">
            Alphabetical sort
          </div>
          <button
            type="button"
            onClick={handleFolderAlphaToggle}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs bg_WHITE text-neutral-700 hover:bg-neutral-50"
          >
            <span>{alphaLabel}</span>
            <span className="text-[11px]">{alphaArrow}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
