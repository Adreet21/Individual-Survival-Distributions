/**
 * Predictions API Client
 * 
 * This module handles all API interactions for saved predictions.
 * It provides functions to list, create, retrieve, and delete prediction records.
 */

import { api } from "./apiClient";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a saved prediction record from the backend
 * 
 * Contains all metadata about a prediction including the user who created it,
 * the predictor used, the dataset it was run on, and the prediction results.
 */
export interface Prediction {
  /** Unique identifier for this prediction */
  prediction_id: number;
  
  /** User who created this prediction */
  user: {
    id: number;
    username: string;
    email: string;
  };
  
  /** Predictor (model) that was used */
  predictor: {
    predictor_id: number;
    name: string;
  };
  
  /** Dataset the prediction was run on */
  dataset: {
    dataset_id: number;
    dataset_name: string;
    original_filename?: string;
  };
  
  /** User-provided name for this prediction */
  name: string;
  
  /** Whether this prediction was made on a labeled dataset (has time/censored columns) */
  is_labeled: boolean;
  
  /** Full prediction response from ML API including survival curves and metrics */
  prediction_data: any;
  
  /** Concordance index (C-index) - only available for labeled datasets */
  c_index: number | null;
  
  /** Integrated Brier Score (IBS) - only available for labeled datasets */
  ibs_score: number | null;
  
  /** Timestamp when this prediction was created */
  created_at: string;
  
  /** Timestamp when this prediction was last updated */
  updated_at: string;
}

/**
 * Request payload for creating a new prediction
 * 
 * Used when saving a prediction result after running it on a dataset.
 */
export interface CreatePredictionRequest {
  /** User-provided name for this prediction */
  name: string;
  
  /** ID of the predictor (model) that was used */
  predictor_id: number;
  
  /** ID of the dataset the prediction was run on */
  dataset_id: number;
  
  /** Full prediction response from the ML API */
  prediction_data: any;
  
  /** Whether this was run on a labeled dataset */
  is_labeled?: boolean;
  
  /** C-index metric (for labeled datasets) */
  c_index?: number | null;
  
  /** IBS metric (for labeled datasets) */
  ibs_score?: number | null;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetches list of predictions for the current user
 * 
 * Retrieves all predictions created by the authenticated user,
 * optionally filtered by a search query.
 * 
 * @param search - Optional search string to filter predictions by name, dataset, or model
 * @returns Promise resolving to array of Prediction objects
 * 
 * @example
 * ```tsx
 * // Get all predictions
 * const allPredictions = await listMyPredictions();
 * 
 * // Search for specific predictions
 * const filtered = await listMyPredictions("cancer");
 * ```
 */
export async function listMyPredictions(search?: string): Promise<Prediction[]> {
  if (search) {
    return api.get<Prediction[]>(`/api/predictions/?search=${encodeURIComponent(search)}`);
  }
  return api.get<Prediction[]>("/api/predictions/");
}

/**
 * Retrieves a single prediction by ID
 * 
 * Fetches detailed information about a specific prediction including
 * all survival curves and metrics.
 * 
 * @param id - The prediction ID to retrieve
 * @returns Promise resolving to the Prediction object
 * 
 * @example
 * ```tsx
 * const prediction = await getPrediction(123);
 * console.log(prediction.c_index);
 * ```
 */
export async function getPrediction(id: number): Promise<Prediction> {
  return api.get<Prediction>(`/api/predictions/${id}/`);
}

/**
 * Saves a new prediction to the database
 * 
 * Creates a new prediction record with all associated metadata and results.
 * The prediction data includes survival curves, metrics, and full_predictions
 * for labeled datasets.
 * 
 * @param data - The prediction data to save
 * @returns Promise resolving to the created Prediction object
 * 
 * @example
 * ```tsx
 * const newPrediction = await createPrediction({
 *   name: "Patient Cohort 2024",
 *   predictor_id: 5,
 *   dataset_id: 12,
 *   prediction_data: mlApiResponse,
 *   is_labeled: true,
 *   c_index: 0.785,
 *   ibs_score: 0.123
 * });
 * ```
 */
export async function createPrediction(data: CreatePredictionRequest): Promise<Prediction> {
  return api.post<Prediction>("/api/predictions/", data);
}

/**
 * Deletes a prediction from the database
 * 
 * Permanently removes a prediction record. This action cannot be undone.
 * 
 * @param id - The prediction ID to delete
 * @returns Promise that resolves when deletion is complete
 * 
 * @example
 * ```tsx
 * await deletePrediction(123);
 * console.log("Prediction deleted successfully");
 * ```
 */
export async function deletePrediction(id: number): Promise<void> {
  return api.del(`/api/predictions/${id}/`);
}
