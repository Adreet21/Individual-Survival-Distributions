import { api, publicApi } from "./apiClient";
import type { PredictorItem } from "../components/PredictorCard";

export type Predictor = {
  predictor_id: number;
  name: string;
  description: string;
  dataset?: {
    dataset_id: number;
    dataset_name: string;
  };
  dataset_id?: number; // For creating/updating
  owner?: {
    id: number;
    username: string;
    email?: string;
  };
  owner_id?: number; // For creating/updating
  is_private?: boolean;
  created_at: string;
  updated_at: string;
  time_unit?: "year" | "month" | "day" | "hour";
  folder_id?: number | string | null;
  folder_name?: string;
  // NEW: ML Model fields
  model_id?: string;
  ml_trained_at?: string;
  ml_training_status?: "not_trained" | "training" | "trained" | "failed";
  ml_model_metrics?: {
    "C-index"?: number;
    IBS?: number;
    [key: string]: any;
  };
  // Backend can send this in different shapes; keep it flexible
  ml_selected_features?: string | string[] | null | any;
  features?: string[];
  permissions: {
    id: number;
    role: "owner" | "viewer";
    user: {
      id: number;
      username: string;
    };
  }[];
};

export type PredictorPermission = {
  id: number;
  predictor: number;
  user: {
    id: number;
    username: string;
    email?: string;
  };
  role: "owner" | "viewer";
};

/**
 * Create a new predictor.
 */
export async function createPredictor(body: {
  name: string;
  description: string;
  dataset_id: number;
  is_private: boolean;
  permissions?: { username: string; role: "owner" | "viewer" }[];
  folder_id?: string;
  model_id?: string | null;
  ml_trained_at?: string | null;
  ml_model_metrics?: Record<string, any> | null;
  ml_training_status?: string;
  ml_selected_features?: string | string[] | null | any;
  // Advanced settings
  num_time_points?: number;
  regularization?: "l1" | "l2";
  objective_function?:
    | "log-likelihood"
    | "l2 marginal loss"
    | "log-likelihood & L2ML";
  marginal_loss_type?: "weighted" | "unweighted";
  c_param_search_scope?: "basic" | "fine" | "extremely fine";
  cox_feature_selection?: boolean;
  mrmr_feature_selection?: boolean;
  mtlr_predictor?: "stable" | "testing1";
  tune_parameters?: boolean;
  use_smoothed_log_likelihood?: boolean;
  use_predefined_folds?: boolean;
  run_cross_validation?: boolean;
  standardize_features?: boolean;
  // New model configuration fields
  model?: string;
  post_process?: "CSD" | "CSD-iPOT";
  n_exp?: number;
  seed?: number;
  time_bins?: number;
  error_f?: string;
  decensor_method?: "uncensored" | "margin" | "PO" | "sampling";
  mono_method?: "ceil" | "floor" | "bootstrap";
  interpolate?: "Linear" | "Pchip";
  n_quantiles?: number;
  use_train?: boolean;
  n_sample?: number;
  neurons?: number[];
  norm?: boolean;
  dropout?: number;
  activation?: string;
  n_epochs?: number;
  early_stop?: boolean;
  batch_size?: number;
  lr?: number;
  weight_decay?: number;
  lam?: number;
}) {
  return api.post<Predictor>("/api/predictors/", body);
}

export async function grantPredictorViewer(
  predictorId: number,
  userId: number,
  role: "owner" | "viewer"
) {
  return api.post("/api/predictors/permissions/", {
    predictor: predictorId,
    user_id: userId,
    role: role,
  });
}

export async function listPredictorPermissions(predictorId?: number) {
  const data = await api.get<PredictorPermission[]>(
    "/api/predictors/permissions/"
  );
  if (typeof predictorId === "number") {
    return data.filter((perm) => perm.predictor === predictorId);
  }
  return data;
}

export async function revokePredictorPermission(
  permissionId: number
) {
  return api.del(`/api/predictors/permissions/${permissionId}/`);
}

/**
 * Delete predictor.
 */
export async function deletePredictor(id: string) {
  return api.del(`/api/predictors/${id}/`);
}

/**
 * List all predictors user owns or has access to.
 */
export async function listMyPredictors(folderId?: string) {
  const url = folderId
    ? `/api/predictors/?folder=${folderId}`
    : "/api/predictors/";
  return api.get<Predictor[]>(url);
}

/**
 * Get a single predictor by ID.
 */
export async function getPredictor(id: number): Promise<Predictor> {
  return api.get<Predictor>(`/api/predictors/${id}/`);
}

/**
 * Update a predictor
 */
export async function updatePredictor(
  id: number,
  updatedData: {
    name?: string;
    description?: string;
    dataset_id?: number | null;
    folder_id?: number | string | null;

    is_private?: boolean;

    // ML fields
    model_id?: string | null;
    ml_training_status?: "not_trained" | "training" | "trained" | "failed";
    ml_trained_at?: string | null;
    ml_model_metrics?: Record<string, any>;
    ml_selected_features?: string | string[] | null | any;
  }
): Promise<Predictor> {
  return api.patch(`/api/predictors/${id}/`, updatedData);
}

/**
 * Pin a predictor
 */
export async function pinPredictor(id: string) {
  return api.post(`/api/predictors/${id}/pin/`);
}

/**
 * Unpin a predictor
 */
export async function unpinPredictor(id: string) {
  return api.post(`/api/predictors/${id}/unpin/`);
}

/**
 * List pinned predictors
 */
export async function listPinnedPredictors() {
  return api.get<any[]>(`/api/predictors/pins/`);
}

/**
 * List all public predictors (no authentication required).
 * This endpoint should be accessible to everyone.
 */
export async function listPublicPredictors(folderId?: string) {
  const url = folderId
    ? `/api/predictors/public/?folder=${folderId}`
    : "/api/predictors/public/";
  return publicApi.get<Predictor[]>(url);
}

/**
 * Mapper function from API Predictor to UI PredictorItem
 */
export function mapApiPredictorToUi(
  item: any,
  currentUserId?: number
): PredictorItem {
  // Format the uploaded date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Choose a single "raw" updated timestamp from the API payload.
  const rawUpdated =
    item.updated_at ??
    item.updatedAt ??
    item.modified ??
    item.last_edited ??
    undefined;

  // Decide a consistent UI status:
  // - If ml_training_status === "not_trained" → DRAFT
  // - If ml_training_status is any other valid value → PUBLISHED
  // - Otherwise fall back to item.status or is_private heuristic
  let uiStatus: "DRAFT" | "PUBLISHED" | undefined;

  if (item.ml_training_status === "not_trained") {
    uiStatus = "DRAFT";
  } else if (
    item.ml_training_status === "training" ||
    item.ml_training_status === "trained" ||
    item.ml_training_status === "failed"
  ) {
    uiStatus = "PUBLISHED";
  } else if (item.status === "DRAFT" || item.status === "PUBLISHED") {
    uiStatus = item.status;
  } else if (typeof item.is_private === "boolean") {
    uiStatus = item.is_private ? "DRAFT" : "PUBLISHED";
  }

  return {
    id: String(item.predictor_id ?? item.id ?? item.pk ?? ""),
    title: item.name ?? item.title ?? "Untitled predictor",

    status: uiStatus,

    // Human-readable date for display
    updatedAt: rawUpdated ? formatDate(rawUpdated) : undefined,

    // Raw ISO-ish timestamp for filtering/sorting
    updatedAtRaw: rawUpdated,

    // Owner is coerced to a boolean relative to the current user id
    owner:
      typeof item.owner === "number" && currentUserId !== undefined
        ? item.owner === currentUserId
        : Boolean(item.owner),

    ownerName:
      typeof item.owner === "object" && item.owner !== null
        ? item.owner.username ?? null
        : null,

    notes: item.description ?? item.notes ?? "",

    isPublic:
      typeof item.is_private === "boolean"
        ? !item.is_private
        : undefined,

    // If backend ever sends a pinned flag, map it; otherwise leave undefined.
    pinned:
      typeof item.pinned === "boolean"
        ? item.pinned
        : typeof item.is_pinned === "boolean"
        ? item.is_pinned
        : undefined,

    folderId: item.folder_id ?? undefined,
    folderName: item.folder_name ?? undefined,
    ml_selected_features: item.ml_selected_features ?? undefined,
    ml_training_status: item.ml_training_status ?? undefined,
    ml_trained_at: formatDate(item.ml_trained_at ?? ""),
    // Map dataset properly - convert dataset_id to id as string
    dataset: item.dataset
      ? {
          id: String(item.dataset.dataset_id ?? item.dataset.id ?? ""),
          title: item.dataset.dataset_name ?? item.dataset.title ?? "",
          time_unit: item.dataset.time_unit ?? "day",
          original_filename: item.dataset.original_filename ?? undefined,
        }
      : undefined,
    model_metadata: item.model_metadata ?? undefined,
    // Additional model configuration fields
    model: item.model ?? undefined,
    post_process: item.post_process ?? undefined,
    time_bins: item.time_bins ?? undefined,
    activation: item.activation ?? undefined,
    neurons: item.neurons ?? undefined,
  };
}

// ========================================
// NEW: ML Model Training & Prediction
// ========================================

export interface TrainPredictorParams {
  parameters?: {
    neurons?: number[];
    dropout?: number;
    n_epochs?: number;
    lr?: number;
    batch_size?: number;
    weight_decay?: number;
    n_quantiles?: number;
    n_exp?: number;
    // Advanced settings
    num_time_points?: number;
    regularization?: "l1" | "l2";
    objective_function?:
      | "log-likelihood"
      | "l2 marginal loss"
      | "log-likelihood & L2ML";
    marginal_loss_type?: "weighted" | "unweighted";
    c_param_search_scope?: "basic" | "fine" | "extremely fine";
    cox_feature_selection?: boolean;
    mrmr_feature_selection?: boolean;
    mtlr_predictor?: "stable" | "testing1";
    tune_parameters?: boolean;
    use_smoothed_log_likelihood?: boolean;
    use_predefined_folds?: boolean;
    run_cross_validation?: boolean;
    standardize_features?: boolean;
    // Feature selection
    selected_features?: string[];
    [key: string]: any;
  };
}

export interface PredictionResult {
  predictions: {
    median_survival_time: number;
    quantile_levels: number[];
    quantile_predictions: number[];
  };
}

interface TrainPredictorResponse {
  status: string;
  model_id: string;
  metrics?: Record<string, any>;
  selected_features: string | string[] | any;
  model_config?: string;
  model_file?: {
    encoder: string;
    icp_state: string;
  };
  cv_predictions?: {
    summary_csv: string;
    full_predictions: string;
    n_folds: number;
    total_predictions: number;
  };
  trained_at: string; // ISO date string
  train_duration?: number; // in seconds
  timestamp?: string;
}

/**
 * Train an ML model for a specific predictor
 * Uses the predictor's linked dataset
 */
export async function trainPredictor(
  datasetId: number,
  params?: TrainPredictorParams
): Promise<TrainPredictorResponse> {
  return api.post(`/api/datasets/${datasetId}/ml/train/`, {
    parameters: params?.parameters,
  });
}

/**
 * Start async training for a predictor (non-blocking)
 */
export async function trainPredictorAsync(
  datasetId: number,
  predictorId: number,
  params?: TrainPredictorParams
): Promise<{ message: string; predictor_id: number; dataset_id: number; status: string }> {
  return api.post(`/api/datasets/${datasetId}/ml/train-async/`, {
    predictor_id: predictorId,
    parameters: params?.parameters,
  });
}

/**
 * Get training status and progress for a predictor
 */
export async function getTrainingStatus(predictorId: number): Promise<{
  status: 'not_trained' | 'training' | 'trained' | 'failed';
  progress: {
    current_experiment?: number;
    total_experiments?: number;
    status?: string;
    message?: string;
    estimated_progress?: number;
    elapsed_seconds?: number;
    eta_seconds?: number;
  } | null;
  error: string | null;
  model_id: string | null;
  metrics: Record<string, any> | null;
  trained_at: string | null;
}> {
  return api.get(`/api/predictors/${predictorId}/training-status/`);
}

/**
 * Start async retraining for a predictor
 */
export async function retrainPredictorAsync(
  predictorId: number,
  modelId: string,
  config: {
    selected_features?: string[];
    parameters?: Record<string, any>;
  }
): Promise<{
  message: string;
  predictor_id: number;
  task_id: string;
  status: string;
}> {
  return api.post('/api/predictors/ml/retrain-async/', {
    predictor_id: predictorId,
    model_id: modelId,
    selected_features: config.selected_features,
    parameters: config.parameters,
  });
}

/**
 * Make a prediction using a trained predictor's ML model
 */
export async function predictWithPredictor(
  predictorId: number,
  datasetId: number,
): Promise<PredictionResult> {
  return api.post(`/api/predictors/${predictorId}/ml/predict/`, {
    dataset_id: datasetId,
  });
}

/**
 * Get detailed predictor information including ML model status
 * (This is the same as getPredictor but more explicit)
 */
export async function getPredictorDetails(
  predictorId: number
): Promise<Predictor> {
  return api.get<Predictor>(`/api/predictors/${predictorId}/`);
}

export interface CvPredictions {
  test_indices?: number[];
  actual_times?: number[];
  actual_events?: number[];
  median_predictions?: number[];
  mean_predictions?: number[];
  prob_at_actual_time?: number[];
  quantile_levels?: number[];
  quantile_predictions?: number[][];
}

export async function getPredictorCvPredictions(
  predictorId: number
): Promise<CvPredictions> {
  return api.get<CvPredictions>(
    `/api/predictors/${predictorId}/cv-predictions/`
  );
}

export async function getPredictorFullPredictions(
  predictorId: number
): Promise<CvPredictions> {
  return api.get<CvPredictions>(`/api/predictors/${predictorId}/full-predictions/`);
}

export async function getPredictorMetadata(
  predictorId: number
): Promise<any> {
  return api.get<any>(`/api/predictors/${predictorId}/metadata/`);
}

export interface SurvivalCurve {
  times: number[];
  survival_probabilities: number[];
}

export interface SurvivalCurvesData {
  quantile_levels: number[];
  survival_probabilities: number[];
  curves: Record<string, SurvivalCurve>;
}

export async function getPredictorSurvivalCurves(
  predictorId: number
): Promise<SurvivalCurvesData> {
  // Fetch from the API endpoint
  return api.get<SurvivalCurvesData>(
    `/api/predictors/${predictorId}/survival-curves/`
  );
}

export interface PredictionSummaryRow {
  identifier: number;
  censored: string;
  event_time: number;
  predicted_prob_event: number;
  predicted_median_survival: number;
  predicted_mean_survival: number;
  absolute_error: number | null;
}

export interface PredictionsSummaryData {
  predictions: PredictionSummaryRow[];
  total: number;
}

export async function getPredictorPredictionsSummary(
  predictorId: number
): Promise<PredictionsSummaryData> {
  return api.get<PredictionsSummaryData>(
    `/api/predictors/${predictorId}/predictions-summary/`
  );
}

export interface FullPredictionsData {
  test_indices: number[];
  actual_times: number[];
  actual_events: number[];
  median_predictions: number[];
  mean_predictions: number[];
  prob_at_actual_time: number[];
  quantile_levels: number[];
  quantile_predictions: number[][];
}

export async function getPredictorFullPredictionsData(
  predictorId: number
): Promise<FullPredictionsData> {
  return api.get<FullPredictionsData>(`/api/predictors/${predictorId}/full-predictions/`);
}

/**
 * Get the MTLR model file content as plain text
 */
export async function getPredictorMtlrFile(
  predictorId: number
): Promise<string> {
  return api.get<string>(`/api/predictors/${predictorId}/mtlr_file/`);
}

// --- Predictor Comparison Types ---

export interface ComparablePredictor {
  predictor_id: number;
  name: string;
  owner: string;
  is_private: boolean;
  model_id: string | null;
  has_cv_stats: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComparablePredictorsResponse {
  base_predictor: {
    predictor_id: number;
    name: string;
    dataset_id: number;
    dataset_name: string;
  };
  comparable_predictors: ComparablePredictor[];
}

export interface PredictorCvComparison {
  predictor_id: number;
  name: string;
  owner: string;
  model_id: string | null;
  cv_stats: any | null;
  ml_model_metrics: {
    Cindex?: { mean: number; std: number };
    IBS?: { mean: number; std: number };
    MAE_Hinge?: { mean: number; std: number };
    MAE_PO?: { mean: number; std: number };
    KM_cal?: { mean: number; std: number };
    xCal_stats?: { mean: number; std: number };
    wsc_xCal_stats?: { mean: number; std: number };
    dcal_p?: { mean: number; std: number };
    dcal_Chi?: { mean: number; std: number };
    train_times?: { mean: number; std: number };
    infer_times?: { mean: number; std: number };
    [key: string]: any;
  } | null;
  created_at?: string;
  updated_at?: string;
  error: string | null;
}

export interface CompareCvStatsResponse {
  comparisons: PredictorCvComparison[];
}

// --- Predictor Comparison API Functions ---

export async function getComparablePredictors(
  predictorId: number
): Promise<ComparablePredictorsResponse> {
  return api.get<ComparablePredictorsResponse>(
    `/api/predictors/${predictorId}/comparable-predictors/`
  );
}

export async function comparePredictorsCvStats(
  predictorIds: number[]
): Promise<CompareCvStatsResponse> {
  return api.post<CompareCvStatsResponse>(
    "/api/predictors/compare-cv-stats/",
    { predictor_ids: predictorIds }
  );
}
