/**
 * Use Predictor Page
 * 
 * Single-page workflow for running predictions on datasets using trained models.
 * Provides a guided three-step process: select predictor, select dataset, run prediction.
 * 
 * Workflow:
 * 1. Select a trained predictor from dropdown (auto-loads metadata)
 * 2. Select a dataset from dropdown (auto-loads preview and validates features)
 * 3. Review validation status and run prediction if features match
 * 4. Navigate to Save Prediction page to name & save results
 * 
 * Features:
 * - Automatic feature validation (checks for missing/extra features)
 * - Truncated feature display (shows first 10 with "..." for long lists)
 * - Dataset preview with first 10 rows
 * - Labeled dataset detection (checks for time/censored columns)
 * - Yellow warning banner for labeled datasets
 * - Full-screen loading modal during prediction
 * - Enhanced button hover effects (scale, shadow)
 * - Performance optimizations (memoized dropdowns, callbacks)
 * 
 * Validation Logic:
 * - Checks that selected dataset has EXACT features required by predictor
 * - Allows predictions only when features match perfectly  * - Detects and ignores time/censored columns for labeled datasets
 * - Displays truncated list of missing/extra features for better UX
 * 
 * State Management:
 * - predictors: List of all trained predictors
 * - datasets: List of all available datasets
 * - selectedPredictor: Currently selected predictor (with metadata)
 * - selectedDataset: Currently selected dataset
 * - datasetPreview: Preview data for selected dataset (columns + 10 rows)
 * - featureStatus: Validation result (ok/not ok, message, missing, extra)
 * - loading: Whether prediction is currently running
 * - results: Prediction results from ML API
 * - isLabeledDataset: Whether dataset has time/censored columns
 * - survivalCurvesData: Transformed curves for visualization
 * - showSaveModal: Whether save modal is visible
 * 
 * Performance Optimizations:
 * - Memoized dropdown options to prevent re-renders
 * - useCallback for change handlers
 * - Debounced feature validation
 * 
 * API Integration:
 * - Fetches predictors and datasets on mount
 * - Fetches dataset preview when dataset selected
 * - Runs prediction via /api/predictors/:id/ml/predict/
 * - Passes labeled=true parameter for labeled datasets
 * 
 */

/**
 * Use Predictor Page
 *
 * Single-page workflow for running predictions on datasets using trained models.
 * Provides a guided three-step process: select predictor, select dataset, run prediction.
 *
 * After a successful prediction, navigates to /predictions/save with
 * full prediction data so the user can review and save it.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/use_predictor/card";
import { Button } from "../components/use_predictor/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "../components/use_predictor/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "../components/use_predictor/table";
import { api } from "../lib/apiClient";
import { useAuth } from "../auth/AuthContext";
import { mapApiPredictorToUi } from "../lib/predictors";
import { type PredictorItem } from "../components/PredictorCard";
import { type DatasetItem } from "../components/DatasetCard";
import { mapApiDatasetToUi } from "../lib/datasets";
import type { SurvivalCurvesData, SurvivalCurve } from "../lib/predictors";
import AuthLoadingScreen from "../auth/AuthLoadingScreen";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  SlidersHorizontal,
  Database,
  PlayCircle,
} from "lucide-react";

/** Dataset preview structure returned from backend */
interface DatasetPreview {
  columns: string[];
  preview_data: any[][];
}

/** Feature validation result */
interface ValidationStatus {
  ok: boolean;
  message: string;
  missing?: string[];
  extra?: string[];
}

/**
 * Truncates a list of features for display
 */
const truncateFeatures = (
  features: string[],
  maxDisplay: number = 10
): string => {
  if (features.length <= maxDisplay) {
    return features.join(", ");
  }
  return features.slice(0, maxDisplay).join(", ") + "...";
};

export default function UsePredictor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = (user as any)?.id ?? (user as any)?.pk;

  // Data state
  const [predictors, setPredictors] = useState<PredictorItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);

  // Selection state
  const [selectedPredictor, setSelectedPredictor] =
    useState<PredictorItem | null>(null);
  const [selectedDataset, setSelectedDataset] =
    useState<DatasetItem | null>(null);
  const [datasetPreview, setDatasetPreview] =
    useState<DatasetPreview | null>(null);
  
  // State for predictor's training dataset columns (to calculate required features)
  const [predictorDatasetColumns, setPredictorDatasetColumns] = 
    useState<string[] | null>(null);

  // Status state
  const [featureStatus, setFeatureStatus] =
    useState<ValidationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isLabeledDataset, setIsLabeledDataset] = useState(false);

  // NEW: explicit error message for prediction failures
  const [predictionError, setPredictionError] = useState<string | null>(null);

  // --- Data fetch ---

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [predData, dsData] = await Promise.all([
          api.get<any[]>("/api/predictors/"),
          api.get<any[]>("/api/datasets/"),
        ]);

        const mappedPreds = Array.isArray(predData)
          ? predData.map((p) => mapApiPredictorToUi(p, currentUserId))
          : [];
        const mappedDatasets = Array.isArray(dsData)
          ? dsData.map((d) => mapApiDatasetToUi(d, currentUserId))
          : [];

        const trainedPreds = mappedPreds.filter(
          (p) =>
            p.ml_training_status === "Trained" ||
            p.ml_training_status === "trained"
        );

        setPredictors(trainedPreds);
        setDatasets(mappedDatasets);
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    }
    fetchData();
  }, [currentUserId]);

  // Fetch predictor's dataset columns when predictor is selected
  useEffect(() => {
    const datasetId = selectedPredictor?.dataset?.id;
    if (!datasetId) {
      setPredictorDatasetColumns(null);
      return;
    }

    async function fetchPredictorDatasetColumns() {
      // Add safety check for TypeScript
      if (!selectedPredictor?.dataset?.id) return;
      
      try {
        const data = await api.get<DatasetPreview>(
          `/api/datasets/${datasetId}/preview/`
        );
        setPredictorDatasetColumns(data.columns);
      } catch (err) {
        console.error("Failed to fetch predictor's dataset columns", err);
        setPredictorDatasetColumns(null);
      }
    }

    fetchPredictorDatasetColumns();
  }, [selectedPredictor]);

  // Fetch dataset preview when dataset is selected
  useEffect(() => {
    if (!selectedDataset) {
      setDatasetPreview(null);
      return;
    }

    async function fetchPreview() {
      setPreviewLoading(true);
      try {
        const data = await api.get<DatasetPreview>(
          `/api/datasets/${selectedDataset?.id}/preview/`
        );
        setDatasetPreview(data);
      } catch (err) {
        console.error("Failed to fetch dataset preview", err);
        setDatasetPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }

    fetchPreview();
  }, [selectedDataset]);

  // Validate features when both are selected and preview is ready
  useEffect(() => {
    if (!selectedPredictor || !selectedDataset || !datasetPreview) {
      setFeatureStatus(null);
      setIsLabeledDataset(false);
      return;
    }

    // Check if dataset is labeled (has time and censored columns which are case-insensitive)
    const hasTimeColumn = datasetPreview.columns.some((col) =>
      /time/i.test(col)
    );
    const hasCensoredColumn = datasetPreview.columns.some((col) =>
      /censored/i.test(col)
    );

    const isLabeled = hasTimeColumn && hasCensoredColumn;
    setIsLabeledDataset(isLabeled);

    const requiredFeatures = selectedPredictor.ml_selected_features || [];

    // Filter out time and censored columns from available features
    const availableFeatures = datasetPreview.columns.filter(
      (col: string) => !/time|censored/i.test(col)
    );

    if (Array.isArray(requiredFeatures) && requiredFeatures.length > 0) {
      const missing = requiredFeatures.filter(
        (f: string) => !availableFeatures.includes(f)
      );
      const extra = availableFeatures.filter(
        (f: string) => !requiredFeatures.includes(f)
      );

      if (missing.length === 0 && extra.length === 0) {
        setFeatureStatus({
          ok: true,
          message: `All ${requiredFeatures.length} required features are present.`,
        });
      } else if (missing.length === 0 && extra.length > 0) {
        setFeatureStatus({
          ok: false,
          message: `Dataset has ${extra.length} extra feature(s) not used in training: ${truncateFeatures(
            extra
          )}`,
          extra,
        });
      } else {
        setFeatureStatus({
          ok: false,
          message: `Missing ${missing.length} required feature(s):`,
          missing,
          extra,
        });
      }
    } else {
      setFeatureStatus({
        ok: false,
        message: "Feature validation failed.",
      });
    }
  }, [selectedPredictor, selectedDataset, datasetPreview]);

  // Memoize dropdown options
  const predictorOptions = useMemo(() => predictors, [predictors]);
  const datasetOptions = useMemo(() => datasets, [datasets]);

  // Change handlers
  const handlePredictorChange = useCallback(
    (val: string) => {
      const pred = predictors.find((x) => x.id === val);
      setSelectedPredictor(pred || null);
      setSelectedDataset(null);
      setDatasetPreview(null);
      setFeatureStatus(null);
      setPredictionError(null);
    },
    [predictors]
  );

  const handleDatasetChange = useCallback(
    (val: string) => {
      const ds = datasets.find((x) => x.id === val);
      setSelectedDataset(ds || null);
      setPredictionError(null);
    },
    [datasets]
  );

  const runPrediction = async () => {
    if (!selectedPredictor || !selectedDataset) return;

    setLoading(true);
    setPredictionError(null);

    try {
      const payload: any = { dataset_id: selectedDataset.id };
      if (isLabeledDataset) {
        payload.labeled = true;
      }

      const response: any = await api.post(
        `/api/predictors/${selectedPredictor.id}/ml/predict/`,
        payload
      );

      let transformedData: SurvivalCurvesData | null = null;

      if (
        response.predictions?.survival_curves &&
        response.predictions?.time_points
      ) {
        const curves: Record<string, SurvivalCurve> = {};
        const survivalCurves = response.predictions.survival_curves;
        const timePoints = response.predictions.time_points;

        survivalCurves.forEach((probabilities: number[], index: number) => {
          curves[String(index)] = {
            times: timePoints,
            survival_probabilities: probabilities.map((p: number) =>
              Math.min(100, p * 100)
            ),
          };
        });

        transformedData = {
          quantile_levels: timePoints,
          survival_probabilities: [],
          curves,
        };
      }

      // ⬇️ NEW: send everything to the full-page Save Prediction view
      navigate("/predictions/save", {
        state: {
          predictionData: response,
          survivalCurvesData: transformedData,
          predictorId: parseInt(selectedPredictor.id),
          predictorName: selectedPredictor.title,
          datasetId: parseInt(selectedDataset.id),
          timeUnit: selectedPredictor.dataset?.time_unit || null,
          isLabeled: isLabeledDataset,
        },
      });
    } catch (err: any) {
      console.error("Prediction failed", err);
      const msg =
        err?.message ||
        err?.detail ||
        "Prediction failed. Please check the logs or try again.";
      setPredictionError(msg);
    } finally {
      setLoading(false);
    }
  };

  const activeStep = !selectedPredictor ? 1 : !selectedDataset ? 2 : 3;

  const scrollToStep = (stepId: string) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  if (loading) {
    return (
      <AuthLoadingScreen
        word="Loading"
        message="Checking requirements and running your prediction…"
      />
    );
  }

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-3">
          <div className="text-lg font-semibold tracking-wide text-center">
            Use Predictor
          </div>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Body — centered white card, single column */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Page intro */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              Choose a trained predictor and a compatible dataset to generate
              survival predictions. We&apos;ll automatically check that the
              dataset features match what the model expects before letting you
              run the prediction.
            </p>
          </section>

          {/* Step nav */}
          <section className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
            <div className="flex flex-col gap-2 text-xs">
              {[
                {
                  id: 1,
                  label: "Select predictor",
                  icon: SlidersHorizontal,
                  targetId: "step-1",
                },
                {
                  id: 2,
                  label: "Select dataset",
                  icon: Database,
                  targetId: "step-2",
                },
                {
                  id: 3,
                  label: "Review & run",
                  icon: PlayCircle,
                  targetId: "step-3",
                },
              ].map((step) => {
                const Icon = step.icon;
                const isActive = step.id === activeStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => scrollToStep(step.targetId)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left ${
                      isActive
                        ? "bg-neutral-900 text-white"
                        : "border border-neutral-200 bg-white text-neutral-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-semibold">
                        Step {step.id}
                      </span>
                    </div>
                    <span className="text-[11px]">{step.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 1: Predictor Selector */}
          <section id="step-1">
            <Card className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-100 p-4">
              <header className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Step 1
                  </p>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Select predictor
                  </h2>
                </div>
                {predictors.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {predictors.length} trained predictor
                    {predictors.length === 1 ? "" : "s"} available
                  </p>
                )}
              </header>

              <div>
                <Select onValueChange={handlePredictorChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a trained predictor..." />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]" position="popper">
                    {predictors.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No trained predictors available
                      </SelectItem>
                    ) : (
                      predictorOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {selectedPredictor && (
                  <div className="mt-4 rounded-lg border border-black/10 bg-white p-4">
                    {/* Top row: label + status + last updated */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Predictor info
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                          {selectedPredictor.status}
                        </span>
                        <span className="text-neutral-500">
                          Last updated:{" "}
                          <span className="font-medium text-neutral-800">
                            {selectedPredictor.updatedAt}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Description block */}
                    <div className="mt-3 rounded-md bg-neutral-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Description
                      </p>
                      <p className="mt-1 text-sm text-neutral-800">
                        {selectedPredictor.notes || "No description provided."}
                      </p>
                    </div>

                    {/* Model configuration */}
                    {selectedPredictor && (
                      <div className="mt-3 rounded-md bg-neutral-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          Model configuration
                        </p>
                        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Model type
                            </dt>
                            <dd className="mt-0.5 text-neutral-900">
                              {selectedPredictor.model || selectedPredictor.model_metadata?.model_type || "N/A"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Trained on
                            </dt>
                            <dd className="mt-0.5 text-neutral-900">
                              {selectedPredictor.dataset?.original_filename}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Required features
                            </dt>
                            <dd className="mt-0.5 text-neutral-900">
                              {predictorDatasetColumns 
                                ? predictorDatasetColumns.filter(
                                    (col: string) => !/time|censored/i.test(col)
                                  ).length
                                : "N/A"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Trained at
                            </dt>
                            <dd className="mt-0.5 text-neutral-900">
                              {selectedPredictor.ml_trained_at}
                            </dd>
                          </div>
                          {selectedPredictor.post_process && (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                Post process
                              </dt>
                              <dd className="mt-0.5 text-neutral-900">
                                {selectedPredictor.post_process}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Time bins
                            </dt>
                            <dd className="mt-0.5 text-neutral-900">
                              {selectedPredictor.time_bins || "default"}
                            </dd>
                          </div>
                          {selectedPredictor.activation && (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                Activation
                              </dt>
                              <dd className="mt-0.5 text-neutral-900">
                                {selectedPredictor.activation}
                              </dd>
                            </div>
                          )}
                          {selectedPredictor.neurons && selectedPredictor.neurons.length > 0 && (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                Hidden layers
                              </dt>
                              <dd className="mt-0.5 text-neutral-900">
                                {selectedPredictor.neurons.join(", ")}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* Step 2: Dataset Selector */}
          <section id="step-2">
            <Card className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-100 p-4">
              <header className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Step 2
                  </p>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Select dataset
                  </h2>
                </div>
                {datasets.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {datasets.length} dataset{datasets.length === 1 ? "" : "s"}{" "}
                    available
                  </p>
                )}
              </header>

              <div
                className={`rounded-lg border border-black/10 bg-white p-4 transition-opacity ${
                  !selectedPredictor ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <Select
                  disabled={!selectedPredictor}
                  onValueChange={handleDatasetChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasetOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedDataset && (
                  <div className="mt-4">
                    {previewLoading ? (
                      <div className="py-4 text-center text-sm text-neutral-500">
                        Loading preview…
                      </div>
                    ) : datasetPreview ? (
                      <div className="overflow-hidden rounded-md border border-black/10 bg-white p-3">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Dataset preview (first 10 rows)
                        </h3>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {datasetPreview.columns.map((col) => (
                                  <TableHead
                                    key={col}
                                    className="whitespace-nowrap text-xs font-semibold"
                                  >
                                    {col}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {datasetPreview.preview_data.map((row, i) => (
                                <TableRow key={i}>
                                  {row.map((cell, j) => (
                                    <TableCell
                                      key={j}
                                      className="whitespace-nowrap text-xs"
                                    >
                                      {cell !== null ? (
                                        String(cell)
                                      ) : (
                                        <span className="italic text-neutral-400">
                                          null
                                        </span>
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Showing {datasetPreview.preview_data.length} rows and{" "}
                          {datasetPreview.columns.length} columns.
                        </p>

                        {isLabeledDataset && (
                          <div className="mt-3 flex gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3">
                            <Info className="mt-0.5 h-4 w-4 text-neutral-700" />
                            <p className="text-xs text-neutral-700">
                              This dataset contains{" "}
                              <code className="rounded bg-neutral-200 px-1 text-[11px]">
                                time
                              </code>{" "}
                              and{" "}
                              <code className="rounded bg-neutral-200 px-1 text-[11px]">
                                censored
                              </code>{" "}
                              columns. These columns are ignored for prediction
                              purposes but may still be used by the backend for
                              labeled metrics.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-red-600">
                        Failed to load preview.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* Step 3: Feature Validation + Run */}
          <section id="step-3">
            <Card className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-100 p-4">
              {featureStatus && (
                <>
                  <header>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Step 3
                    </p>
                    <h2 className="text-base font-semibold text-neutral-900">
                      Check features &amp; run prediction
                    </h2>
                  </header>

                  <div className="rounded-lg border border-neutral-300 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {featureStatus.ok ? (
                          <CheckCircle2 className="h-5 w-5 text-neutral-800" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-neutral-800" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="font-semibold text-neutral-900">
                          {featureStatus.ok
                            ? "Feature check passed"
                            : "Feature check"}
                        </h3>
                        <p className="text-sm text-neutral-700">
                          {featureStatus.message}
                        </p>

                        {featureStatus.missing &&
                          featureStatus.missing.length > 0 && (
                            <div className="mt-1 text-sm text-neutral-700">
                              <span className="font-medium">Missing:</span>{" "}
                              {truncateFeatures(featureStatus.missing)}
                            </div>
                          )}
                        {featureStatus.extra &&
                          featureStatus.extra.length > 0 && (
                            <div className="mt-1 text-sm text-neutral-700">
                              <span className="font-medium">
                                Ignored extra:
                              </span>{" "}
                              {truncateFeatures(featureStatus.extra)}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      disabled={!featureStatus.ok || loading}
                      onClick={runPrediction}
                      size="lg"
                      className="inline-flex items-center rounded-md border border-black/10 bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <span className="mr-2 flex h-4 w-4 items-center justify-center">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
                          </span>
                          Run prediction…
                        </>
                      ) : (
                        "Run prediction"
                      )}
                    </Button>
                  </div>

                  {/* Error state for failed predictions */}
                  {predictionError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div>
                          <p className="font-semibold text-red-900">
                            Prediction failed
                          </p>
                          <p className="mt-1">{predictionError}</p>
                          <p className="mt-2 text-[11px] text-red-700">
                            Something went wrong. Please try again.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!featureStatus && (
                <section className="rounded-md border border-dashed border-neutral-300 bg-white p-3 text-xs text-neutral-600">
                  Select a predictor and dataset to see feature checks and
                  enable the{" "}
                  <span className="font-semibold">Run prediction</span> button.
                </section>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
