import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import { Printer, Download, Eye, FileDown } from "lucide-react";
import { api } from "../lib/apiClient";
import { getDatasetStats } from "../lib/datasets";
import type { DatasetStats } from "../lib/datasets";
import {
  getPredictorFullPredictions,
  getPredictorSurvivalCurves,
  getPredictorMtlrFile,
  retrainPredictorAsync,
  updatePredictor,
  type CvPredictions,
  type SurvivalCurvesData,
} from "../lib/predictors";
import IndividualSurvivalCurves from "../components/IndividualSurvivalCurves";
import DCalibrationHistogram from "../components/DCalibrationHistogram";
import KaplanMeierVisualization from "../components/KaplanMeierVisualization";
import TrainingModal from "../components/TrainingModal";
import PredictorComparisonTable from "../components/PredictorComparisonTable";
import AuthLoadingScreen from "../auth/AuthLoadingScreen";

// Utility functions for Printing and Downloading sections
function handlePrintSection(sectionId: string) {
  const section = document.getElementById(sectionId);
  if (!section) {
    console.error("Print section not found:", sectionId);
    return;
  }

  // Create hidden iframe so we don't touch the main window
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    console.error("No iframe contentWindow for printing");
    document.body.removeChild(iframe);
    return;
  }

  const doc = iframeWindow.document;
  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 16px;
          }
        </style>
      </head>
      <body>
        ${section.innerHTML}
      </body>
    </html>
  `);
  doc.close();

  iframe.onload = () => {
    iframeWindow.focus();
    iframeWindow.print();
    // Remove iframe after print; small timeout so print dialog can open
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 500);
  };
}

// --- Type Definitions ---
interface PredictorDetail {
  predictor_id: number;
  name: string;
  description: string;
  dataset: {
    dataset_id: number;
    dataset_name: string;
  };
  owner: {
    id: number;
    username: string;
  };
  is_private: boolean;
  time_unit: "hour" | "day" | "month" | "year";
  num_time_points: number | null;
  regularization: "l1" | "l2";
  objective_function:
    | "log-likelihood"
    | "l2 marginal loss"
    | "log-likelihood & L2ML";
  marginal_loss_type: "weighted" | "unweighted";
  c_param_search_scope: "basic" | "fine" | "extremely fine";
  cox_feature_selection: boolean;
  mrmr_feature_selection: boolean;
  mtlr_predictor: "stable" | "testing1";
  tune_parameters: boolean;
  use_smoothed_log_likelihood: boolean;
  use_predefined_folds: boolean;
  allow_admin_access: boolean;
  created_at: string;
  updated_at: string;
  features: string[];
  run_cross_validation: boolean;
  standardize_features: boolean;
  model_id: string;
  ml_training_status?: string;
  ml_model_metrics?: {
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
    n_experiment?: number;
    train_duration?: number;
    train_start_time?: string;
    [key: string]: any;
  };
}

type Tab = "meta" | "dataset" | "retrain" | "cross-validation";

const NAVBAR_HEIGHT = 64;
const HEADER_HEIGHT = 72;
const MAX_HISTOGRAM_BARS = 20;
const SURVIVAL_X_TICKS = 6;
const SURVIVAL_Y_TICKS = 5;
const EVENT_X_TICKS = 6;
const EVENT_Y_TICKS = 5;

type DatasetSubTab = "correlations" | "eventHistogram" | "survivalHistogram";

type SurvivalHistogramBin = { bin_start: number; bin_end: number; count: number };
interface SurvivalHistogramData {
  bins: SurvivalHistogramBin[];
  axisMin: number;
  axisMax: number;
}
interface SurvivalChartDatum extends SurvivalHistogramBin {
  center: number;
}
type HistogramBin = DatasetStats["event_time_histogram"][number];
interface EventHistogramDatum extends HistogramBin {
  center: number;
  events: number;
  censored: number;
  total: number;
}

export default function PredictorDetailPage() {
  const { predictorId } = useParams<{ predictorId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // fall back to the parent page + correct tab
  type NavOrigin = "browse" | "dashboard";
  const navOrigin: NavOrigin =
    (location.state as any)?.from === "browse" ? "browse" : "dashboard";

  const fallbackBackPath =
    navOrigin === "browse"
      ? "/browse?tab=predictors"
      : "/dashboard?tab=predictors";

  const handleBack = () => {
    // if we have browser history to return to, use it
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // else, go to the appropriate parent with the right tab preselected
    navigate(fallbackBackPath, { replace: true });
  };

  // State for data, loading, and errors
  const [predictor, setPredictor] = useState<PredictorDetail | null>(null);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("meta");

  // Fetch predictor data when the component mounts
  useEffect(() => {
    if (!predictorId) {
      setError("No predictor ID provided.");
      setIsLoading(false);
      return;
    }

    async function fetchPredictorDetails() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.get<PredictorDetail>(
          `/api/predictors/${predictorId}/`
        );
        setPredictor(data);
      } catch (err) {
        setError(
          "Failed to load predictor details. It may not exist or you may not have permission."
        );
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPredictorDetails();
  }, [predictorId]);

  // Poll for status updates if training
  useEffect(() => {
    if (!predictor || predictor.ml_training_status !== "training") {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const data = await api.get<PredictorDetail>(
          `/api/predictors/${predictorId}/`
        );
        setPredictor(data);

        // Stop polling if training is complete
        if (data.ml_training_status !== "training") {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error polling predictor status:", err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [predictor?.ml_training_status, predictorId]);

  // --- Render States ---
  if (isLoading) {
    return (
      <AuthLoadingScreen
        word="Loading"
        message="Loading predictor details…"
      />
    );
  }

  if (error || !predictor) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-100">
        <div className="rounded-md border border-black/5 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm text-red-600">
            {error || "Predictor not found."}
          </p>
          <button
            onClick={handleBack}
            className="mt-4 inline-flex items-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:translate-y-[0.5px]"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "meta":
        return <MetaTab predictor={predictor} />;
      case "dataset":
        return <DatasetTab predictor={predictor} navOrigin={navOrigin} />;
      case "retrain":
        return <RetrainTab predictor={predictor} />;
      case "cross-validation":
        return <CrossValidationTab predictor={predictor} />;
      default:
        return null;
    }
  };

  const statusLabel =
    predictor.ml_training_status === "not_trained"
      ? "Not Trained"
      : predictor.ml_training_status === "training"
      ? "Training"
      : predictor.ml_training_status === "trained"
      ? "Trained"
      : predictor.ml_training_status === "failed"
      ? "Failed"
      : "Unknown";

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      {/* Sticky header */}
      <div
        className="sticky z-30 w-full border-b border-black/20 bg-neutral-700 text-white shadow-sm"
        style={{ top: NAVBAR_HEIGHT }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <button
            onClick={handleBack}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
          >
            Back
          </button>

          <div className="min-w-0 flex-1 px-4 text-center">
            <h1 className="truncate text-sm font-semibold tracking-wide sm:text-base">
              {predictor.name}
            </h1>
            <p className="mt-1 truncate text-[11px] text-neutral-200">
              <span className="font-medium">{predictor.owner.username}</span>
              {"   ·   "}
              Uses dataset{" "}
              <span className="font-mono">
                {predictor.dataset?.dataset_name}
              </span>
              {"   ·   "}
              Time unit: <span className="lowercase">{predictor.time_unit}</span>
            </p>
          </div>

          {/* Status badge / training indicator */}
          <button
            type="button"
            onClick={() => {
              if (predictor.ml_training_status === "training") {
                setShowTrainingModal(true);
              }
            }}
            className={`hidden sm:inline-flex items-center rounded-full border px-3 py-1 text-[11px] ${
              predictor.ml_training_status === "training"
                ? "border-white/30 bg-blue-600 text-white hover:bg-blue-500 cursor-pointer transition"
                : "border-white/25 bg-neutral-600/80 text-white cursor-default"
            }`}
            disabled={predictor.ml_training_status !== "training"}
          >
            <span className="mr-1 text-neutral-200">Status</span>
            <span className="font-medium">{statusLabel}</span>
          </button>
        </div>
        <div className="h-1 w-full bg-neutral-700" />
      </div>

      {/* Tab bar */}
      <div
        className="sticky z-20 w-full border-b border-black/10 bg-neutral-50/95 pt-2 backdrop-blur"
        style={{ top: NAVBAR_HEIGHT + HEADER_HEIGHT }}
      >
        <div className="mx-auto max-w-6xl">
          <nav className="flex justify-center gap-2 px-3 py-3">
            {(
              ["meta", "dataset", "retrain", "cross-validation"] as Tab[]
            ).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    // Smooth scroll to top on tab change
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`rounded-md px-3.5 py-2 text-xs sm:text-sm font-medium capitalize transition ${
                    isActive
                      ? "border border-neutral-900 bg-neutral-900 text-white shadow-sm"
                      : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-200"
                  }`}
                >
                  {tab === "retrain"
                    ? "Predictor Settings / Retrain"
                    : tab.replace("-", " ")}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
          {renderTabContent()}
        </div>
      </div>

      {/* Training Modal */}
      {showTrainingModal && predictor && (
        <TrainingModal
          predictorId={predictor.predictor_id}
          onClose={() => setShowTrainingModal(false)}
          autoNavigateOnComplete={false}
        />
      )}
    </div>
  );
}

// --- Shared tiny components  ---
const Card = ({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) => (
  <div
    id={id}
    className={`rounded-xl border border-black/5 bg-white p-4 shadow-sm ${className}`}
  >
    {children}
  </div>
);

export const InfoItem = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="space-y-1">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      {label}
    </dt>
    <dd className="text-sm text-neutral-900">{value}</dd>
  </div>
);

// --- Tabs ---
function MetaTab({ predictor }: { predictor: PredictorDetail }) {
  return (
    <div className="space-y-6">
      <Card>
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <InfoItem label="Predictor Name" value={predictor.name} />
          <InfoItem label="Owner" value={predictor.owner.username} />
          <InfoItem
            label="Created"
            value={new Date(predictor.created_at).toLocaleDateString()}
          />
          <InfoItem
            label="Last Updated"
            value={new Date(predictor.updated_at).toLocaleDateString()}
          />
          <InfoItem
            label="Visibility"
            value={!predictor.is_private ? "Public" : "Private"}
          />
        </dl>
      </Card>

      <Card>
        <dl className="grid grid-cols-1 gap-4">
          <div className="sm:col-span-2">
            <InfoItem
              label="Description"
              value={predictor.description || "No description provided."}
            />
          </div>
        </dl>
      </Card>
    </div>
  );
}

function DatasetTab({
  predictor,
  navOrigin,
}: {
  predictor: PredictorDetail;
  navOrigin: "browse" | "dashboard";
}) {
  const [activeView, setActiveView] = useState<DatasetSubTab>("correlations");
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [cvPredictions, setCvPredictions] = useState<CvPredictions | null>(
    null
  );
  const [cvError, setCvError] = useState<string | null>(null);
  const [isCvLoading, setIsCvLoading] = useState(false);

  const datasetId = predictor.dataset?.dataset_id;

  const handleRefreshStats = useCallback(async () => {
    if (!datasetId) return;
    setIsRefreshing(true);
    setStatsError(null);
    try {
      const fresh = await getDatasetStats(datasetId, { refresh: true });
      setStats(fresh);
    } catch (error) {
      console.error("Failed to refresh dataset statistics", error);
      const apiDetails = (error as { details?: unknown })?.details as
        | Record<string, unknown>
        | undefined;
      const errorMessage =
        (apiDetails &&
          typeof apiDetails.error === "string" &&
          apiDetails.error) ||
        (apiDetails &&
          typeof apiDetails.message === "string" &&
          apiDetails.message) ||
        "Failed to refresh dataset metrics. Please try again.";
      setStatsError(errorMessage);
    } finally {
      setIsRefreshing(false);
    }
  }, [datasetId]);

  useEffect(() => {
    let cancelled = false;
    if (!datasetId) {
      setStats(null);
      setIsInitialLoading(false);
      return;
    }
    setIsInitialLoading(true);
    setStatsError(null);
    getDatasetStats(datasetId)
      .then((data) => {
        if (!cancelled) {
          setStats(data);
        }
      })
      .catch((error) => {
        console.error("Failed to load dataset statistics", error);
        if (!cancelled) {
          const apiDetails = (error as { details?: unknown })?.details as
            | Record<string, unknown>
            | undefined;
          const errorMessage =
            (apiDetails &&
              typeof apiDetails.error === "string" &&
              apiDetails.error) ||
            (apiDetails &&
              typeof apiDetails.message === "string" &&
              apiDetails.message) ||
            "Failed to load dataset metrics.";
          setStatsError(errorMessage);
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    setCvPredictions(null);
    setCvError(null);
    setIsCvLoading(false);
  }, [predictor?.predictor_id]);

  const generalStats = stats?.general_stats;
  const timeUnitLabel = generalStats?.time_unit || predictor.time_unit;
  const hasTimeStats =
    generalStats &&
    [
      generalStats.time_min,
      generalStats.time_max,
      generalStats.time_mean,
      generalStats.time_median,
    ].some((value) => value !== null && value !== undefined);

  const histogramBins = useMemo(
    () => stats?.event_time_histogram?.slice(0, MAX_HISTOGRAM_BARS) ?? [],
    [stats]
  );

  const survivalHistogram = useMemo<SurvivalHistogramData | null>(() => {
    if (!cvPredictions) return null;
    const predicted = (cvPredictions.median_predictions ?? []).filter(
      (val): val is number => typeof val === "number" && Number.isFinite(val)
    );
    if (!predicted.length) return null;

    const rawMin = Math.min(...predicted);
    const rawMax = Math.max(...predicted);
    const padding = Math.max((rawMax - rawMin) * 0.05, 1);
    const axisMin = getNiceFloor(Math.max(0, rawMin - padding));
    const axisMaxCandidate = getNiceCeiling(rawMax + padding);
    const axisMax = axisMaxCandidate <= axisMin ? axisMin + 1 : axisMaxCandidate;
    const range = axisMax - axisMin || 1;
    const fdBinWidth = getFreedmanDiaconisBinWidth(predicted);
    const estimatedBins =
      fdBinWidth > 0
        ? Math.round(range / fdBinWidth)
        : Math.round(Math.sqrt(predicted.length));
    const binCount = Math.max(
      5,
      Math.min(MAX_HISTOGRAM_BARS, estimatedBins || 1)
    );
    const binWidth = range / binCount;

    const bins: SurvivalHistogramBin[] = Array.from(
      { length: binCount },
      (_, idx) => ({
        bin_start: axisMin + idx * binWidth,
        bin_end: axisMin + (idx + 1) * binWidth,
        count: 0,
      })
    );

    const toIndex = (value: number) => {
      if (value <= axisMin) return 0;
      if (value >= axisMax) return binCount - 1;
      const relative = (value - axisMin) / binWidth;
      return Math.min(binCount - 1, Math.max(0, Math.floor(relative)));
    };

    predicted.forEach((value) => {
      bins[toIndex(value)].count += 1;
    });

    return { bins, axisMin, axisMax };
  }, [cvPredictions]);

  useEffect(() => {
    if (activeView !== "survivalHistogram") return;
    if (!predictor || !predictor.predictor_id) return;
    if (!predictor.model_id) {
      setCvPredictions(null);
      setCvError("This predictor has not been trained yet.");
      return;
    }
    if (cvPredictions || isCvLoading) return;
    setCvError(null);
    setIsCvLoading(true);
    getPredictorFullPredictions(predictor.predictor_id)
      .then((data) => setCvPredictions(data))
      .catch((err) => {
        console.error("Failed to load full predictions", err);
        const apiDetails = (err as { details?: unknown })?.details as
          | Record<string, unknown>
          | undefined;
        const message =
          (apiDetails &&
            typeof apiDetails.error === "string" &&
            apiDetails.error) ||
          (apiDetails &&
            typeof apiDetails.message === "string" &&
            apiDetails.message) ||
          (typeof (err as any)?.message === "string"
            ? (err as any).message
            : "Failed to load predicted survival data.");
        setCvPredictions(null);
        setCvError(message);
      })
      .finally(() => setIsCvLoading(false));
  }, [activeView, predictor, cvPredictions, isCvLoading]);

  const tabButtonClass = useCallback(
    (tab: DatasetSubTab) =>
      `rounded-md px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
        activeView === tab
          ? "bg-neutral-900 text-white shadow-sm"
          : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
      }`,
    [activeView]
  );

  const content = useMemo(() => {
    if (isInitialLoading) {
      return (
        <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
          <p className="mt-2">Loading dataset statistics…</p>
        </div>
      );
    }

    if (!stats) {
      return (
        <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
          <p>Statistics are not available for this dataset yet.</p>
          {datasetId && (
            <button
              onClick={handleRefreshStats}
              disabled={isRefreshing}
              className="mt-4 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? "Refreshing…" : "Generate statistics"}
            </button>
          )}
        </div>
      );
    }

    switch (activeView) {
      case "correlations":
        return <FeatureCorrelationTable rows={stats.feature_correlations ?? []} />;
      case "eventHistogram":
        return (
          <EventHistogramChart bins={histogramBins} timeUnit={timeUnitLabel} />
        );
      case "survivalHistogram":
        return (
          <PredictedSurvivalHistogram
            histogram={survivalHistogram}
            timeUnit={timeUnitLabel}
            isLoading={isCvLoading}
            error={cvError}
            hasModel={Boolean(predictor.model_id)}
          />
        );
      default:
        return null;
    }
  }, [
    activeView,
    datasetId,
    handleRefreshStats,
    histogramBins,
    isInitialLoading,
    isRefreshing,
    stats,
    timeUnitLabel,
    survivalHistogram,
    cvError,
    isCvLoading,
    predictor,
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="space-y-4">
            {/* Dataset Name Header */}
            <div className="rounded-lg bg-gradient-to-br from-neutral-50 to-neutral-100 p-4 border border-neutral-200">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Dataset
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-base font-semibold text-neutral-900">
                    {predictor.dataset.dataset_name}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-neutral-500">
                    ID: {predictor.dataset.dataset_id}
                  </div>
                </div>
                <Link
                  to={`/datasets/${predictor.dataset.dataset_id}/view`}
                  state={{ from: navOrigin }}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
                  title="View dataset details"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Link>
              </div>
            </div>

            {/* Time Unit */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Time Unit
              </div>
              {isInitialLoading ? (
                <div className="h-5 w-24 animate-pulse rounded bg-neutral-200" />
              ) : (
                <div className="text-sm font-medium text-neutral-900">
                  {timeUnitLabel}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-4 text-sm font-semibold text-neutral-900">
            General Statistics
          </h4>
          {statsError && (
            <p className="mb-3 text-xs text-red-600">{statsError}</p>
          )}
          {isInitialLoading ? (
            <div className="space-y-5">
              {/* Loading skeleton for Sample & Events */}
              <div>
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Sample & Events
                </h5>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 w-20 animate-pulse rounded bg-neutral-200" />
                      <div className="h-6 w-16 animate-pulse rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-neutral-200" />
              {/* Loading skeleton for Features */}
              <div>
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Features
                </h5>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
                      <div className="h-6 w-16 animate-pulse rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-neutral-200" />
              {/* Loading skeleton for Time Statistics */}
              <div>
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Time Statistics
                </h5>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 w-16 animate-pulse rounded bg-neutral-200" />
                      <div className="h-6 w-20 animate-pulse rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Sample & Event Statistics */}
              <div>
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Sample & Events
                </h5>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      # Samples
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {formatInteger(generalStats?.num_samples)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      # Censored
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {formatInteger(generalStats?.num_censored)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      # Events
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {formatInteger(generalStats?.num_events)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Separator */}
              <div className="border-t border-neutral-200" />

              {/* Feature Statistics */}
              <div>
                <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Features
                </h5>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      # Features
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {formatInteger(generalStats?.num_features)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      # Numeric Features
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {formatInteger(generalStats?.num_numeric_features)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Time Unit
                    </dt>
                    <dd className="text-base font-semibold text-neutral-900">
                      {timeUnitLabel}
                    </dd>
                  </div>
                </dl>
              </div>

              {hasTimeStats && (
                <>
                  {/* Separator */}
                  <div className="border-t border-neutral-200" />

                  {/* Time Statistics */}
                  <div>
                    <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                      Time Statistics
                    </h5>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Min
                        </dt>
                        <dd className="text-base font-semibold text-neutral-900">
                          {formatWithUnit(generalStats?.time_min, timeUnitLabel)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Max
                        </dt>
                        <dd className="text-base font-semibold text-neutral-900">
                          {formatWithUnit(generalStats?.time_max, timeUnitLabel)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Mean
                        </dt>
                        <dd className="text-base font-semibold text-neutral-900">
                          {formatWithUnit(generalStats?.time_mean, timeUnitLabel)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Median
                        </dt>
                        <dd className="text-base font-semibold text-neutral-900">
                          {formatWithUnit(
                            generalStats?.time_median,
                            timeUnitLabel
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
          <button
            type="button"
            onClick={() => setActiveView("correlations")}
            className={tabButtonClass("correlations")}
          >
            Feature Correlations
          </button>
          <button
            type="button"
            onClick={() => setActiveView("eventHistogram")}
            className={tabButtonClass("eventHistogram")}
          >
            Event Time Histogram
          </button>
          <button
            type="button"
            onClick={() => setActiveView("survivalHistogram")}
            className={tabButtonClass("survivalHistogram")}
            title="Predicted median survival histogram"
          >
            Predicted Survival Histogram
          </button>
        </div>
        <div className="p-4">{content}</div>
      </Card>
    </div>
  );
}

type FeatureCorrelationRow = DatasetStats["feature_correlations"][number];

export function FeatureCorrelationTable({
  rows,
}: {
  rows: FeatureCorrelationRow[];
}) {
  const [search, setSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter((row) => row.feature.toLowerCase().includes(term));
  }, [rows, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / rowsPerPage)
  );
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedRows = useMemo(
    () => filteredRows.slice(startIndex, startIndex + rowsPerPage),
    [filteredRows, rowsPerPage, startIndex]
  );

  useEffect(() => {
    setPage(1);
  }, [rowsPerPage, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!rows.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <p>Not enough numeric features to compute correlations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* header bar */}
      <div className="border-b bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
        <p className="mb-2">
          Censored subjects are ignored for these calculations.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            >
              {[25, 50, 100, 250].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] max-w-xs flex-1 sm:max-w-sm">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search features"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Rank
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Feature
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Non-nil (%)
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Type
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Correlation
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                |Correlation|
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Details
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Cox score
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Cox score log
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {paginatedRows.map((row, index) => {
              const correlationValue = row.correlation_with_time;
              const correlationClass =
                correlationValue === null || correlationValue === undefined
                  ? "text-neutral-500"
                  : correlationValue >= 0
                  ? "text-emerald-600"
                  : "text-rose-600";

              return (
                <tr key={row.feature}>
                  <td className="px-3 py-2 text-neutral-500">
                    {startIndex + index + 1}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm text-neutral-800">
                    {row.feature}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">
                    {formatPercentage(row.non_null_percent)}
                  </td>
                  <td className="px-3 py-2 text-left capitalize text-neutral-600">
                    {row.feature_type ?? "—"}
                  </td>
                  <td className={`px-3 py-2 text-right ${correlationClass}`}>
                    {formatCorrelation(correlationValue)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">
                    {formatCorrelation(row.abs_correlation)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">
                    {formatDetails(row.mean, row.std_dev)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">
                    {formatScientific(row.cox_score)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">
                    {formatFloat(row.cox_score_log, 6)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info text and pagination */}
      <div className="flex flex-col gap-2 border-t bg-neutral-50 px-3 py-2 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-shrink-0 text-neutral-600">
          Showing {startIndex + 1}-
          {Math.min(startIndex + rowsPerPage, filteredRows.length)} of{" "}
          {filteredRows.length}{" "}
          {filteredRows.length === 1 ? "feature" : "features"}
          {search && ` (filtered from ${rows.length} total)`}
        </div>
        <div className="overflow-x-auto">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            onJump={(n) => setPage(n)}
          />
        </div>
      </div>
    </div>
  );
}

export function EventHistogramChart({
  bins,
  timeUnit,
}: {
  bins: HistogramBin[];
  timeUnit?: string | null;
}) {
  if (!bins.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <p>Not enough time observations to plot a histogram.</p>
      </div>
    );
  }

  const normalizedBins: EventHistogramDatum[] = bins.map((bin) => {
    const start = typeof bin.bin_start === "number" ? bin.bin_start : 0;
    const end = typeof bin.bin_end === "number" ? bin.bin_end : start;
    const events =
      typeof bin.events === "number" ? bin.events : bin.count ?? 0;
    const censored =
      typeof bin.censored === "number"
        ? bin.censored
        : Math.max((bin.count ?? 0) - events, 0);
    const total = typeof bin.count === "number" ? bin.count : events + censored;
    return {
      ...bin,
      bin_start: start,
      bin_end: end,
      center: (start + end) / 2,
      events,
      censored,
      total,
    };
  });

  const axisMin = Math.min(
    ...normalizedBins.map((bin) => bin.bin_start ?? 0)
  );
  const axisMax = Math.max(
    ...normalizedBins.map((bin) => bin.bin_end ?? 0)
  );
  const resolvedMin = Number.isFinite(axisMin) ? axisMin : 0;
  const resolvedMax =
    Number.isFinite(axisMax) && axisMax > resolvedMin
      ? axisMax
      : resolvedMin + 1;
  const range = resolvedMax - resolvedMin || 1;

  const maxCount = Math.max(
    ...normalizedBins.map((bin) => bin.total),
    1
  );
  const yTicks = Array.from(
    { length: EVENT_Y_TICKS },
    (_, idx) =>
      Math.round((maxCount / (EVENT_Y_TICKS - 1 || 1)) * idx)
  );
  const xTicks = Array.from(
    { length: EVENT_X_TICKS },
    (_, idx) => resolvedMin + (range / (EVENT_X_TICKS - 1 || 1)) * idx
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-neutral-900">
            Event Time Histogram
          </h4>
        </div>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={normalizedBins}
              margin={{ top: 10, right: 16, bottom: 40, left: 0 }}
              barGap={8}
            >
              <CartesianGrid strokeDasharray="4 6" vertical={false} />
              <XAxis
                type="number"
                dataKey="center"
                domain={[resolvedMin, resolvedMax]}
                ticks={xTicks}
                tickFormatter={formatHistogramLabel}
                stroke="#9ca3af"
                tick={{ fontSize: 10 }}
                label={{
                  value: `Time${timeUnit ? ` (${timeUnit})` : ""}`,
                  position: "insideBottom",
                  offset: -20,
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
              />
              <YAxis
                allowDecimals={false}
                ticks={yTicks}
                stroke="#9ca3af"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Count",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
              />
              <Tooltip content={<EventHistogramTooltip timeUnit={timeUnit} />} />
              <Legend
                verticalAlign="top"
                height={32}
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="events"
                name="Uncensored"
                fill="#1d4ed8"
                radius={[4, 4, 0, 0]}
                stackId="counts"
                isAnimationActive={false}
              />
              <Bar
                dataKey="censored"
                name="Censored"
                fill="#e11d48"
                radius={[4, 4, 0, 0]}
                stackId="counts"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Counts represent samples per time bucket
        {timeUnit ? ` (${timeUnit})` : ""}.
      </p>
    </div>
  );
}

function PredictedSurvivalHistogram({
  histogram,
  timeUnit,
  isLoading,
  error,
  hasModel,
}: {
  histogram: SurvivalHistogramData | null;
  timeUnit?: string | null;
  isLoading: boolean;
  error: string | null;
  hasModel: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
        <p className="mt-2">Loading predicted survival distribution…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <p>{error}</p>
      </div>
    );
  }

  if (!hasModel) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <p>This predictor has not been trained yet.</p>
      </div>
    );
  }

  if (!histogram || !histogram.bins.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <p>Predicted survival data is not available.</p>
      </div>
    );
  }

  const { bins, axisMin, axisMax } = histogram;
  const maxValue = Math.max(...bins.map((bin) => bin.count), 1);
  const range = axisMax - axisMin || 1;

  const yTickValues = Array.from(
    { length: SURVIVAL_Y_TICKS },
    (_, idx) =>
      Math.round((maxValue / (SURVIVAL_Y_TICKS - 1 || 1)) * idx)
  );
  const xTickValues = Array.from(
    { length: SURVIVAL_X_TICKS },
    (_, idx) => axisMin + (range / (SURVIVAL_X_TICKS - 1 || 1)) * idx
  );

  const chartData: SurvivalChartDatum[] = bins.map((bin) => ({
    ...bin,
    center: (bin.bin_start + bin.bin_end) / 2,
  }));
  const barSize = Math.max(8, Math.floor(600 / bins.length));

  return (
    <div id="predictor-survival-histogram-section" className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-neutral-900">
            Predicted Median Survival Histogram
          </h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePrintSection("predictor-survival-histogram-section");
              }}
              aria-label="Print predicted survival histogram"
              title="Print predicted survival histogram"
              className="rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:translate-y-[0.5px]"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 16, bottom: 40, left: 0 }}
              barSize={barSize}
            >
              <CartesianGrid strokeDasharray="4 6" vertical={false} />
              <XAxis
                type="number"
                dataKey="center"
                domain={[axisMin, axisMax]}
                ticks={xTickValues}
                tickFormatter={formatHistogramLabel}
                stroke="#9ca3af"
                tick={{ fontSize: 10 }}
                label={{
                  value: `Time${timeUnit ? ` (${timeUnit})` : ""}`,
                  position: "insideBottom",
                  offset: -20,
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
              />
              <YAxis
                allowDecimals={false}
                ticks={yTickValues}
                stroke="#9ca3af"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Count",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
              />
              <Tooltip content={<SurvivalTooltip timeUnit={timeUnit} />} />
              <Bar
                dataKey="count"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                name="Predicted median survival"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Each bar counts test patients whose predicted median survival falls
        inside the matching time bucket.
      </p>
    </div>
  );
}

function SurvivalTooltip({
  active,
  payload,
  timeUnit,
}: TooltipProps<number, string> & { timeUnit?: string | null }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const datum = payload[0].payload as SurvivalChartDatum;
  return (
    <div className="rounded border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-neutral-700">Median survival</p>
      <p className="text-neutral-600">
        {formatHistogramLabel(datum.bin_start)} –{" "}
        {formatHistogramLabel(datum.bin_end)}
        {timeUnit ? ` ${timeUnit}` : ""}
      </p>
      <p className="mt-1 text-neutral-500">Count: {datum.count}</p>
    </div>
  );
}

function EventHistogramTooltip({
  active,
  payload,
  timeUnit,
}: TooltipProps<number, string> & { timeUnit?: string | null }) {
  if (!active || !payload || !payload.length) return null;
  const datum = payload[0].payload as EventHistogramDatum;
  return (
    <div className="rounded border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-neutral-700">Time bucket</p>
      <p className="text-neutral-600">
        {formatHistogramLabel(datum.bin_start)} –{" "}
        {formatHistogramLabel(datum.bin_end)}
        {timeUnit ? ` ${timeUnit}` : ""}
      </p>
      <p className="mt-1 text-neutral-500">Uncensored: {datum.events}</p>
      <p className="text-neutral-500">Censored: {datum.censored}</p>
      <p className="text-neutral-500">Total: {datum.total}</p>
    </div>
  );
}

export function formatInteger(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
}

function formatFloat(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return Number(value.toFixed(digits)).toLocaleString();
}

function formatPercentage(
  value: number | null | undefined,
  digits = 1
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${Number(value.toFixed(digits)).toLocaleString()}%`;
}

function formatDetails(
  mean: number | null | undefined,
  stdDev: number | null | undefined
): string {
  const meanFormatted = formatFloat(mean, 3);
  const stdFormatted = formatFloat(stdDev, 5);

  if (meanFormatted === "—" && stdFormatted === "—") {
    return "—";
  }

  if (stdFormatted === "—") {
    return `${meanFormatted}`;
  }

  return `${meanFormatted}, σ = ${stdFormatted}`;
}

function formatScientific(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toExponential(5);
}

export function formatWithUnit(
  value: number | null | undefined,
  unit?: string | null
): string {
  const formatted = formatFloat(value);
  if (formatted === "—") {
    return formatted;
  }
  return unit ? `${formatted} ${unit}` : formatted;
}


function formatCorrelation(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Number(value.toFixed(3));
  return (Math.abs(rounded) < 0.0005 ? 0 : rounded).toFixed(3);
}

function formatHistogramLabel(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const digits = Math.abs(value) >= 100 ? 0 : 1;
  return Number(value.toFixed(digits)).toLocaleString();
}

/**
 * Calculate mean and standard deviation from an array of values
 */
function calculateMeanAndStd(values: number[]): {
  mean: number;
  std: number;
} {
  if (!values || values.length === 0) {
    return { mean: 0, std: 0 };
  }

  const mean =
    values.reduce((sum, val) => sum + val, 0) / values.length;

  if (values.length === 1) {
    return { mean, std: 0 };
  }

  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  const std = Math.sqrt(variance);

  return { mean, std };
}

/**
 * Format a metric value with ± standard deviation
 * Handles objects with {mean, std}, arrays, or single values
 */
function formatMetricWithStd(values: any, decimals: number = 3): string {
  // Handle undefined or null
  if (values === undefined || values === null) {
    return "—";
  }

  // Handle object with mean and std properties (the actual format from backend)
  if (
    typeof values === "object" &&
    values !== null &&
    "mean" in values &&
    "std" in values
  ) {
    const mean = Number(values.mean);
    const std = Number(values.std);
    if (!isNaN(mean) && !isNaN(std)) {
      return `${mean.toFixed(decimals)} ± ${std.toFixed(decimals)}`;
    }
  }

  // Handle single number (not an array or object)
  if (typeof values === "number") {
    return `${values.toFixed(decimals)} ± 0.000`;
  }

  // Handle array of values (calculate mean and std)
  if (Array.isArray(values) && values.length > 0) {
    const { mean, std } = calculateMeanAndStd(values);
    return `${mean.toFixed(decimals)} ± ${std.toFixed(decimals)}`;
  }

  return "—";
}

function getNiceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function downloadCvMetricsCsv(predictor: PredictorDetail) {
  if (typeof document === "undefined") return;
  if (!predictor.ml_model_metrics) return;

  const m = predictor.ml_model_metrics;

  const rows: string[][] = [];
  const addRow = (label: string, metric: any) => {
    rows.push([label, formatMetricWithStd(metric, 3)]);
  };

  addRow("Concordance Index (C-index)", m.Cindex);
  addRow("Integrated Brier Score (IBS)", m.IBS);
  addRow("MAE Hinge", m.MAE_Hinge);
  addRow("MAE PO", m.MAE_PO);
  addRow("KM Calibration", m.KM_cal);
  addRow("X-Calibration Statistics", m.xCal_stats);
  addRow("WSC X-Calibration Statistics", m.wsc_xCal_stats);
  addRow("D-Calibration p-value", m.dcal_p);
  addRow("D-Calibration χ² statistic", m.dcal_Chi);
  addRow("Training Time (seconds)", m.train_times);
  addRow("Inference Time (seconds)", m.infer_times);

  const header = ["Metric", "Value (mean ± std)"];
  const allRows = [header, ...rows];

  const csv = allRows
    .map((cols) => cols.map(escapeCsvCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `predictor-${predictor.predictor_id}-cv-metrics.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getNiceFloor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  let niceNormalized: number;
  if (normalized >= 5) niceNormalized = 5;
  else if (normalized >= 2) niceNormalized = 2;
  else niceNormalized = 1;
  const candidate = niceNormalized * magnitude;
  return candidate > value ? candidate - magnitude : candidate;
}

function getFreedmanDiaconisBinWidth(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = getPercentile(sorted, 0.25);
  const q3 = getPercentile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return 0;
  return (2 * iqr) / Math.cbrt(values.length);
}

function getPercentile(sortedValues: number[], percentile: number): number {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function RetrainTab({ predictor }: { predictor: PredictorDetail }) {
  const navigate = useNavigate();

  // --- Retraining Status ---
  const [isRetraining, setIsRetraining] = useState(false);

  // --- MTLR File State ---
  const [mtlrFileContent, setMtlrFileContent] = useState<string | null>(null);
  const [isLoadingMtlr, setIsLoadingMtlr] = useState(false);
  const [showMtlrModal, setShowMtlrModal] = useState(false);

  // Retrain Modal State
  const [showRetrainModal, setShowRetrainModal] = useState(false);
  const [retrainStep, setRetrainStep] = useState<
    "training" | "complete" | "error"
  >("training");
  const [retrainError, setRetrainError] = useState<string | null>(null);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Dataset first column name for Training Results Label
  const [datasetFirstColumn, setDatasetFirstColumn] = useState<string | null>(null);

  // Fetch dataset's first column name
  useEffect(() => {
    if (!predictor?.dataset?.dataset_id) {
      setDatasetFirstColumn(null);
      return;
    }

    const fetchFirstColumn = async () => {
      try {
        const preview = await api.get<{ columns: string[] }>(
          `/api/datasets/${predictor.dataset.dataset_id}/preview/`
        );
        if (preview.columns && preview.columns.length > 0) {
          setDatasetFirstColumn(preview.columns[0]);
        }
      } catch (err) {
        console.error("Failed to fetch dataset columns:", err);
        setDatasetFirstColumn(null);
      }
    };

    fetchFirstColumn();
  }, [predictor?.dataset?.dataset_id]);

  // --- Retrain In Place Handler ---
  const handleRetrainInPlace = () => {
    setShowWarningModal(true);
  };

  const confirmRetrainInPlace = async () => {
    setShowWarningModal(false);
    setIsRetraining(true);
    setShowRetrainModal(true);
    setRetrainStep("training");
    setRetrainError(null);

    try {
      // Update predictor status to "training" first
      await updatePredictor(predictor.predictor_id, {
        ml_training_status: "training",
      });

      // Start async retraining with existing settings
      await retrainPredictorAsync(
        predictor.predictor_id,
        predictor.model_id || "",
        {
          selected_features: predictor.features,
          parameters: {
            num_time_points: predictor.num_time_points || undefined,
            regularization: predictor.regularization,
            objective_function: predictor.objective_function,
            marginal_loss_type: predictor.marginal_loss_type,
            c_param_search_scope: predictor.c_param_search_scope,
            cox_feature_selection: predictor.cox_feature_selection,
            mrmr_feature_selection: predictor.mrmr_feature_selection,
            mtlr_predictor: predictor.mtlr_predictor,
            tune_parameters: predictor.tune_parameters,
            use_smoothed_log_likelihood: predictor.use_smoothed_log_likelihood,
            use_predefined_folds: predictor.use_predefined_folds,
            run_cross_validation: predictor.run_cross_validation !== false,
            standardize_features: predictor.standardize_features !== false,
          },
        }
      );

      // Keep modal open - it will track progress via TrainingModal component
      // The modal handles completion and navigation
    } catch (err: any) {
      console.error("Retrain failed:", err);
      setRetrainStep("error");
      setRetrainError(err.message || "Failed to retrain predictor");
      setIsRetraining(false);
    }
  };

  // --- MTLR File Handler ---
  const handleViewMtlrFile = async () => {
    if (!predictor.model_id) {
      alert("No model ID found for this predictor.");
      return;
    }

    setIsLoadingMtlr(true);
    try {
      const content = await getPredictorMtlrFile(predictor.predictor_id);
      setMtlrFileContent(content);
      setShowMtlrModal(true);
    } catch (err: any) {
      console.error("Failed to load MTLR file:", err);
      alert(`Failed to load MTLR file: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoadingMtlr(false);
    }
  };

  const handleDownloadMtlrFile = () => {
    if (!mtlrFileContent) return;

    const blob = new Blob([mtlrFileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mtlr_model_${predictor.model_id}.mtlr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* "Options" & "Results" */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-neutral-800">Options</h3>
          <p className="mt-2 text-xs text-neutral-500">
            Current predictor settings
          </p>

          {/* Scrollable content area with max-height matching Training Results */}
          <div className="mt-4 max-h-[400px] space-y-4 overflow-y-auto pr-2">
            {((predictor as any).model ||
              (predictor as any).post_process ||
              (predictor as any).n_exp !== undefined) && (
              <>
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    Model & General
                  </h4>
                  <div className="space-y-2 rounded-md bg-neutral-50 p-3">
                    {(predictor as any).model && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Model:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).model}
                        </span>
                      </div>
                    )}
                    {(predictor as any).post_process && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Post Process:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).post_process}
                        </span>
                      </div>
                    )}
                    {(predictor as any).n_exp !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Experiments:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).n_exp}
                        </span>
                      </div>
                    )}
                    {(predictor as any).seed !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Seed:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).seed}
                        </span>
                      </div>
                    )}
                    {(predictor as any).time_bins && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Time Bins:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).time_bins}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Separator line */}
                <div className="border-t border-neutral-200" />
              </>
            )}

            {/* Conformalization Settings */}
            {((predictor as any).error_f ||
              (predictor as any).decensor_method) && (
              <>
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    Conformalization
                  </h4>
                  <div className="space-y-2 rounded-md bg-neutral-50 p-3">
                    {(predictor as any).error_f && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Error Function:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).error_f}
                        </span>
                      </div>
                    )}
                    {(predictor as any).decensor_method && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Decensor:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).decensor_method}
                        </span>
                      </div>
                    )}
                    {(predictor as any).mono_method && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Monotonization:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).mono_method}
                        </span>
                      </div>
                    )}
                    {(predictor as any).n_quantiles !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Quantiles:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).n_quantiles}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Separator line */}
                <div className="border-t border-neutral-200" />
              </>
            )}

            {/* Neural Network Architecture */}
            {((predictor as any).neurons ||
              (predictor as any).activation) && (
              <>
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    Neural Network
                  </h4>
                  <div className="space-y-2 rounded-md bg-neutral-50 p-3">
                    {(predictor as any).neurons && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Hidden Layers:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {Array.isArray((predictor as any).neurons)
                            ? (predictor as any).neurons.join(", ")
                            : (predictor as any).neurons}
                        </span>
                      </div>
                    )}
                    {(predictor as any).activation && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Activation:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).activation}
                        </span>
                      </div>
                    )}
                    {(predictor as any).dropout !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">
                          Dropout:
                        </span>
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          {(predictor as any).dropout}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Separator line */}
                <div className="border-t border-neutral-200" />
              </>
            )}

            {/* Training Hyperparameters */}
            {((predictor as any).n_epochs || (predictor as any).lr) && (
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Training
                </h4>
                <div className="space-y-2 rounded-md bg-neutral-50 p-3">
                  {(predictor as any).n_epochs !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">
                        Epochs:
                      </span>
                      <span className="font-mono text-sm font-medium text-neutral-900">
                        {(predictor as any).n_epochs}
                      </span>
                    </div>
                  )}
                  {(predictor as any).batch_size !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">
                        Batch Size:
                      </span>
                      <span className="font-mono text-sm font-medium text-neutral-900">
                        {(predictor as any).batch_size}
                      </span>
                    </div>
                  )}
                  {(predictor as any).lr !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">
                        Learning Rate:
                      </span>
                      <span className="font-mono text-sm font-medium text-neutral-900">
                        {(predictor as any).lr}
                      </span>
                    </div>
                  )}
                  {(predictor as any).early_stop !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">
                        Early Stop:
                      </span>
                      <span className="font-mono text-sm font-medium text-neutral-900">
                        {(predictor as any).early_stop ? "Yes" : "No"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-base font-semibold text-neutral-900">
            Training Results
          </h3>
          {predictor.ml_model_metrics ? (
            <div className="space-y-4">
              {/* Training Information Section */}
              <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-100 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Training Information
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Label</span>
                    <span className="font-mono text-sm font-medium text-neutral-900">
                      {datasetFirstColumn || "-"}
                    </span>
                  </div>
                  <div className="h-px bg-neutral-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Duration</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {predictor.ml_model_metrics.train_duration
                        ? (() => {
                            const seconds = predictor.ml_model_metrics.train_duration;
                            if (seconds >= 86400) {
                              return `${(seconds / 86400).toFixed(2)}d`;
                            } else if (seconds >= 3600) {
                              return `${(seconds / 3600).toFixed(2)}h`;
                            } else if (seconds >= 60) {
                              return `${(seconds / 60).toFixed(2)}min`;
                            } else {
                              return `${seconds.toFixed(2)}s`;
                            }
                          })()
                        : "N/A"}
                    </span>
                  </div>
                  <div className="h-px bg-neutral-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Started</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {predictor.ml_model_metrics.train_start_time
                        ? (() => {
                            // Ensure the timestamp is treated as UTC
                            const timestamp = predictor.ml_model_metrics.train_start_time;
                            // If the timestamp doesn't end with 'Z', append it to indicate UTC
                            const utcTimestamp = timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`;
                            return new Date(utcTimestamp).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            });
                          })()
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Model Artifacts Section */}
              <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-100 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  Model Artifacts
                </h4>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-xs text-neutral-600">
                      Model Version
                    </div>
                    <div className="break-all rounded border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs text-neutral-900">
                      {predictor.model_id || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-neutral-600">
                      MTLR Model File
                    </div>
                    <div className="flex items-center gap-2">
                      {predictor.model_id ? (
                        <button
                          onClick={handleViewMtlrFile}
                          disabled={isLoadingMtlr}
                          className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title="View MTLR model file"
                          aria-label="View MTLR model file"
                        >
                          {isLoadingMtlr ? (
                            <span className="flex items-center justify-center gap-2">
                              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
                              <span>Loading…</span>
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <Eye className="h-4 w-4" />
                              <span>View File</span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-center text-sm text-neutral-500">
                          N/A
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center">
              <p className="text-sm text-neutral-500">
                No training results available yet.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* MTLR File Modal */}
      {showMtlrModal && mtlrFileContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 p-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                MTLR Model File
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadMtlrFile}
                  className="inline-flex items-center gap-1.5 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white transition hover:bg-neutral-700"
                  title="Download MTLR model file"
                  aria-label="Download MTLR model file"
                >
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setShowMtlrModal(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words rounded bg-neutral-50 p-4 font-mono text-xs text-neutral-900">
                {mtlrFileContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h3 className="mb-2 text-base font-semibold text-neutral-900">
            Retrain Options
          </h3>
          <p className="mb-6 text-sm text-neutral-600">
            Choose how you want to retrain this predictor
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Retrain with Selected Options */}
            <div className="group relative">
              <button
                onClick={() =>
                  navigate(`/predictors/${predictor.predictor_id}/select-features`)
                }
                className="w-full rounded-lg border-2 border-neutral-300 bg-white px-6 py-4 text-left transition hover:border-neutral-900 hover:bg-neutral-50"
              >
                <div className="mb-1 font-semibold text-neutral-900">
                  Retrain with Selected Options
                </div>
                <div className="text-xs text-neutral-600">
                  Create a new predictor with custom features
                </div>
              </button>
              <div className="invisible absolute left-0 top-full z-10 mt-2 w-full rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg group-hover:visible">
                Re-train the predictor using only a subset of the features
              </div>
            </div>

            {/* Re-train Predictor */}
            <div className="group relative">
              <button
                onClick={handleRetrainInPlace}
                disabled={isRetraining}
                className="w-full rounded-lg border-2 border-neutral-300 bg-white px-6 py-4 text-left transition hover:border-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-1 font-semibold text-neutral-900">
                  Re-train Predictor
                </div>
                <div className="text-xs text-neutral-600">
                  {isRetraining
                    ? "Retraining..."
                    : "Re-run training with current settings"}
                </div>
              </button>
              <div className="invisible absolute left-0 top-full z-10 mt-2 w-full rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg group-hover:visible">
                Delete all results and re-run the entire training process on
                this data set, using existing settings
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                <svg
                  className="h-6 w-6 text-neutral-900"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Confirm Re-training
              </h3>
            </div>
            <p className="mb-6 text-sm text-neutral-600">
              This will delete all existing training results and re-run the
              entire training process on this data set using the current
              settings. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowWarningModal(false)}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRetrainInPlace}
                className="rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
              >
                Continue Re-training
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retrain Modal - Using TrainingModal for async progress tracking */}
      {showRetrainModal && retrainStep === "training" && (
        <TrainingModal
          predictorId={predictor.predictor_id}
          onClose={() => {
            setShowRetrainModal(false);
            setIsRetraining(false);
            window.location.reload();
          }}
          autoNavigateOnComplete={false}
        />
      )}

      {/* Retrain Error Modal */}
      {showRetrainModal && retrainStep === "error" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">
                ✕
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                Re-training Failed
              </h3>
              <p className="mt-2 text-sm text-red-600">{retrainError}</p>
              <button
                onClick={() => {
                  setShowRetrainModal(false);
                  setRetrainError(null);
                  setIsRetraining(false);
                }}
                className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CrossValidationTab({ predictor }: { predictor: PredictorDetail }) {
  const [activeView, setActiveView] = useState<
    "statistics" | "individual" | "dcalibration" | "kaplanmeier" | "comparison"
  >("statistics");
  const [survivalCurves, setSurvivalCurves] =
    useState<SurvivalCurvesData | null>(null);
  const [isLoadingCurves, setIsLoadingCurves] = useState(false);
  const [curvesError, setCurvesError] = useState<string | null>(null);

  const handleViewIndividualPredictions = useCallback(async () => {
    // Switch to individual view immediately
    setActiveView("individual");

    if (!predictor.model_id) {
      setCurvesError("This predictor has not been trained yet.");
      return;
    }

    if (survivalCurves) {
      return;
    }

    setIsLoadingCurves(true);
    setCurvesError(null);
    try {
      const data = await getPredictorSurvivalCurves(
        predictor.predictor_id
      );
      setSurvivalCurves(data);
    } catch (err) {
      console.error("Failed to load survival curves", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load survival curves data. Please try again.";
      setCurvesError(errorMessage);
    } finally {
      setIsLoadingCurves(false);
    }
  }, [predictor.predictor_id, predictor.model_id, survivalCurves]);

  return (
    <div className="space-y-6">
      {/* centered actions row */}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => setActiveView("statistics")}
          className={`rounded-md px-3 py-1.5 text-xs sm:text-sm ${
            activeView === "statistics"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          5-Fold Cross-Validation Statistics
        </button>
        <button
          onClick={handleViewIndividualPredictions}
          className={`rounded-md px-3 py-1.5 text-xs sm:text-sm ${
            activeView === "individual"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Individual Predictions
        </button>
        <button
          onClick={() => setActiveView("dcalibration")}
          className={`rounded-md px-3 py-1.5 text-xs sm:text-sm ${
            activeView === "dcalibration"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          D-Calibration Histogram
        </button>
        <button
          onClick={() => setActiveView("kaplanmeier")}
          className={`rounded-md px-3 py-1.5 text-xs sm:text-sm ${
            activeView === "kaplanmeier"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Kaplan Meier Visualization
        </button>
        <button
          onClick={() => setActiveView("comparison")}
          className={`rounded-md px-3 py-1.5 text-xs sm:text-sm ${
            activeView === "comparison"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Compare Predictors
        </button>
      </div>

      {activeView === "comparison" ? (
        <PredictorComparisonTable
          predictorId={predictor.predictor_id}
          predictorName={predictor.name}
        />
      ) : activeView === "kaplanmeier" ? (
        <Card>
          <KaplanMeierVisualization
            predictorId={predictor.predictor_id}
            predictorName={predictor.name}
            timeUnit={predictor.time_unit}
          />
        </Card>
      ) : activeView === "dcalibration" ? (
        <Card>
          <DCalibrationHistogram
            predictorId={predictor.predictor_id}
            predictorName={predictor.name}
          />
        </Card>
      ) : activeView === "individual" ? (
        <Card>
          {curvesError ? (
            <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
              <p className="text-red-600">{curvesError}</p>
            </div>
          ) : isLoadingCurves ? (
            <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
              <p className="mt-2">Loading survival curves...</p>
            </div>
          ) : survivalCurves ? (
            <IndividualSurvivalCurves
              data={survivalCurves}
              timeUnit={predictor.time_unit}
              predictorId={predictor.predictor_id}
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
              <p>No survival curves data available.</p>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card id="predictor-cv-metrics-section">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-800">
                5-Fold Cross-Validation Statistics*
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePrintSection("predictor-cv-metrics-section");
                  }}
                  aria-label="Print cross-validation statistics"
                  title="Print cross-validation statistics"
                  className="rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:translate-y-[0.5px]"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadCvMetricsCsv(predictor);
                  }}
                  aria-label="Download cross-validation metrics as a CSV file"
                  title="Download cross-validation metrics (CSV)"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 active:translate-y-[0.5px]"
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {!predictor.ml_model_metrics ? (
              <div className="py-8 text-center text-sm text-neutral-500">
                <p>
                  No metrics available. This predictor may not have been trained
                  yet.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-neutral-800">
                          Metric
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-neutral-800">
                          Value (mean ± std)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          Concordance Index (C-index)
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.Cindex,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          Integrated Brier Score (IBS)
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.IBS,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          MAE Hinge
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.MAE_Hinge,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          MAE PO
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.MAE_PO,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          KM Calibration
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.KM_cal,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          X-Calibration Statistics
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.xCal_stats,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          WSC X-Calibration Statistics
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.wsc_xCal_stats,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          D-Calibration p-value
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.dcal_p,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          D-Calibration χ² statistic
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.dcal_Chi,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          Training Time (seconds)
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.train_times,
                            3
                          )}
                        </td>
                      </tr>
                      <tr className="odd:bg-white even:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-800">
                          Inference Time (seconds)
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-700">
                          {formatMetricWithStd(
                            predictor.ml_model_metrics.infer_times,
                            3
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  * Values shown as mean ± standard deviation across
                  cross-validation folds.
                </p>
              </>
            )}
          </Card>

          {/* THE FOLLOWING SECTION WAS NOT IMPLEMENTED. Commented this out in case it may be in the future. */}

          {/* <Card>
            ...
          </Card> */}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  onJump,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-800">
      {page > 1 && (
        <button
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 shadow-sm hover:bg-neutral-50"
          onClick={onPrev}
        >
          PREV
        </button>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className={`rounded-md border border-neutral-300 px-2 py-1 shadow-sm ${
            n === page ? "bg-neutral-200" : "bg-white hover:bg-neutral-50"
          }`}
          onClick={() => onJump(n)}
        >
          {n}
        </button>
      ))}
      {page < totalPages && (
        <button
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 shadow-sm hover:bg-neutral-50"
          onClick={onNext}
        >
          NEXT
        </button>
      )}
    </div>
  );
}
