import type { Predictor } from "./predictors";
import type { Dataset } from "./datasets";
import type { PredictorItem } from "../components/PredictorCard";
import type { DatasetItem } from "../components/DatasetCard";

/** Predictor Mapping */
export function toPredictorItem(p: Predictor): PredictorItem {
  return {
    id: String(p.predictor_id),
    title: p.name,
    notes: p.description,
    owner: true,          // map real ownership from backend 
    // updatedAt:    , // when backend provides a timestamp
    // status:   ,        // when backend provides status
    isPublic: !(p as any).is_private,  // Predictor uses is_private (inverted logic)
    pinned: (p as any).pinned ?? false,  // update
  };
}

/** Dataset Mapping */
export function toDatasetItem(d: Dataset, currentUserId?: number): DatasetItem {
  // Format the uploaded date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Convert file size from bytes to MB
  const fileSizeMB = d.file_size ? Math.round(d.file_size / (1024 * 1024) * 10) / 10 : undefined;

  return {
    id: String(d.dataset_id),
    title: d.dataset_name,
    owner: currentUserId ? d.owner === currentUserId : true, // Check actual ownership
    ownerId: d.owner,
    ownerName: d.owner_name,
    updatedAt: d.uploaded_at ? formatDate(d.uploaded_at) : undefined,
    notes: d.notes || undefined,
    sizeMB: fileSizeMB,
    hasFile: d.has_file,
    originalFilename: d.original_filename,
    __raw: d, // Keep raw data for potential future use
  };
}
