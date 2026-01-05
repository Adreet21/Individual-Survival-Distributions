/**
 * PredictionSaveModal Component
 * 
 * Modal dialog for saving prediction results to the database.
 * Displays prediction results in a tabbed interface and allows users to name and save the prediction.
 * 
 * Features:
 * - Name input for the prediction
 * - Preview of survival curves
 * - Tabbed interface for labeled datasets (Individual Predictions, D-Calibration, Kaplan-Meier)
  * - Automatic extraction of C-index and IBS metrics from prediction data
 * - Error handling and loading states
 * - Navigation to My Predictions page after successful save
 * 
 * @example
 * ```tsx
 * <PredictionSaveModal
 *   predictionData={mlApiResponse}
 *   survivalCurvesData={transformedCurves}
 *   predictorId={5}
 *   predictorName="Cancer Risk Model"
 *   datasetId={12}
 *   timeUnit="months"
 *   isLabeled={true}
 *   onClose={() => setShowModal(false)}
 * />
 * ```
 */

/**
 * edited full-page version of the old PredictionSaveModal.
 * Opened after running a prediction, lets the user:
 * - Name the prediction
 * - Preview curves/metrics
 * - Save it to "My Predictions"
 * - Or go back without saving with a warning
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPrediction } from "../lib/predictions";
import IndividualSurvivalCurves from "../components/IndividualSurvivalCurves";
import DCalibrationHistogram from "../components/DCalibrationHistogram";
import KaplanMeierVisualization from "../components/KaplanMeierVisualization";
import type { SurvivalCurvesData } from "../lib/predictors";
import { AlertTriangle } from "lucide-react";

/** Location state passed from UsePredictor when navigating here */
interface PredictionSaveLocationState {
  predictionData: any;
  survivalCurvesData: SurvivalCurvesData | null;
  predictorId: number;
  predictorName: string;
  datasetId: number;
  timeUnit: string | null;
  isLabeled: boolean;
}

type Tab = "individual" | "dcalibration" | "kaplan-meier";

export default function PredictionSavePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PredictionSaveLocationState | undefined;

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("individual");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);

  // For "dirty" detection
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = !!name.trim();
  }, [name]);

  // Refs for chart wrappers so we can export canvases
  const dcalRef = useRef<HTMLDivElement | null>(null);
  const kmRef = useRef<HTMLDivElement | null>(null);

  // If user somehow hits this page without state, show a simple fallback
  if (!state || !state.predictionData) {
    return (
      <div className="min-h-[60vh] bg-neutral-100">
        <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-7 py-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
            >
              Back
            </button>
            <div className="text-lg font-semibold tracking-wide">
              Save Prediction
            </div>
            <div className="w-[96px]" />
          </div>
          <div className="h-1 w-full bg-neutral-600" />
        </div>

        <div className="mx-auto max-w-5xl px-7 py-6">
          <div className="rounded-xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-neutral-700" />
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">
                  No prediction data available
                </h2>
                <p className="mt-1 text-sm text-neutral-700">
                  This page is meant to be opened right after running a
                  prediction. Please run a prediction again from{" "}
                  <button
                    onClick={() => navigate("/use-predictor")}
                    className="underline underline-offset-2"
                  >
                    Use Predictor
                  </button>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const {
    predictionData,
    survivalCurvesData,
    predictorId,
    predictorName,
    datasetId,
    timeUnit,
    isLabeled,
  } = state;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a name for this prediction");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Extract statistics from prediction data if available
      const metrics = predictionData?.metrics;
      const cIndex =
        metrics?.concordance_index ||
        predictionData?.predictions?.statistics?.c_index ||
        null;
      const ibsScore =
        metrics?.integrated_brier_score ||
        predictionData?.predictions?.statistics?.ibs ||
        null;

      await createPrediction({
        name: name.trim(),
        predictor_id: predictorId,
        dataset_id: datasetId,
        prediction_data: predictionData,
        is_labeled: isLabeled,
        c_index: cIndex,
        ibs_score: ibsScore,
      });

      // Navigate to My Predictions page
      navigate("/my-predictions");
    } catch (err: any) {
      console.error("Failed to save prediction", err);
      setError(err?.message || "Failed to save prediction");
      setSaving(false);
    }
  };

  function onBack() {
    if (saving) return;
    if (dirtyRef.current) setShowLeavePrompt(true);
    else navigate(-1);
  }

  // shared button styling helper
  const tabButtonClass = (tab: Tab) =>
    `rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition ${
      activeTab === tab
        ? "bg-neutral-900 text-white shadow-sm"
        : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
    }`;

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-7 py-3">
          <button
            onClick={onBack}
            disabled={saving}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">
            Save Prediction
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center rounded-md border border-black/10 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save prediction"}
          </button>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-7 py-6">
        <div className="space-y-6 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Intro / warning */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              This prediction is <span className="font-semibold">not saved</span>{" "}
              yet. Give it a name and click{" "}
              <span className="font-semibold">Save prediction</span> to add it
              to your <span className="font-semibold">My Predictions</span>{" "}
              page, or go back if you don&apos;t want to keep it.
            </p>
            <p className="text-xs text-neutral-600">
              Predictor: <span className="font-semibold">{predictorName}</span>
            </p>
          </section>

          {/* Name input */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Prediction name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., AML Survival – Test Cohort"
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              autoFocus
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">
                {error}
              </p>
            )}
            {!error && (
              <p className="text-xs text-neutral-500">
                This name will appear in your{" "}
                <span className="font-semibold">My Predictions</span> list.
              </p>
            )}
          </section>

          {/* Tabs for labeled predictions */}
          {isLabeled && survivalCurvesData && (
            <section className="space-y-6">
              {/* Tab bar – pill style */}
              <div className="flex flex-wrap items-center justify-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("individual")}
                  className={tabButtonClass("individual")}
                >
                  Individual predictions
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("dcalibration")}
                  className={tabButtonClass("dcalibration")}
                >
                  D-calibration histogram
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("kaplan-meier")}
                  className={tabButtonClass("kaplan-meier")}
                >
                  Kaplan–Meier visualization
                </button>
              </div>

              <div className="rounded-lg border border-black/10 bg-neutral-50 p-4">
                {activeTab === "individual" && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-neutral-900">
                      Individual survival curves
                    </h3>
                    {/* Bounded container so internal pagination / controls stay on-screen */}
                    <div className="max-w-full overflow-x-auto">
                      <div className="origin-top-left transform scale-[0.95]">
                        <IndividualSurvivalCurves
                          data={survivalCurvesData}
                          timeUnit={timeUnit}
                          predictorId={predictorId}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "dcalibration" && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900">
                        D-calibration histogram
                      </h3>
                    </div>
                    <div className="max-w-full overflow-x-auto">
                      <div
                        ref={dcalRef}
                        className="origin-top-left transform scale-[0.95]"
                      >
                        <DCalibrationHistogram
                          predictorId={predictorId}
                          predictorName={predictorName}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "kaplan-meier" && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Kaplan–Meier visualization
                      </h3>
                    </div>
                    <div className="max-w-full overflow-x-auto">
                      <div
                        ref={kmRef}
                        className="origin-top-left transform scale-[0.95]"
                      >
                        <KaplanMeierVisualization
                          predictorId={predictorId}
                          predictorName={predictorName}
                          timeUnit={timeUnit}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Unlabeled preview (no tabs) */}
          {!isLabeled && survivalCurvesData && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                Prediction preview
              </h3>
              <div className="rounded-lg border border-black/10 bg-neutral-50 p-4">
                <div className="max-w-full overflow-x-auto">
                  <div className="origin-top-left transform scale-[0.95]">
                    <IndividualSurvivalCurves
                      data={survivalCurvesData}
                      timeUnit={timeUnit}
                      predictorId={predictorId}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Saving overlay – dashboard-style spinner */}
      {saving && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
              <h3 className="text-sm font-semibold text-neutral-900">
                Saving prediction…
              </h3>
              <p className="mt-2 text-xs text-neutral-600">
                We&apos;re storing your results so you can revisit them on the{" "}
                <span className="font-semibold">My Predictions</span> page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leave-without-saving dialog */}
      {showLeavePrompt && (
        <ConfirmLeavePrediction
          onCancel={() => setShowLeavePrompt(false)}
          onDiscard={() => navigate(-1)}
        />
      )}
    </div>
  );
}

function ConfirmLeavePrediction({
  onCancel,
  onDiscard,
}: {
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg">
        <h3 className="text-base font-semibold">
          Leave without saving this prediction?
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          If you go back now, this prediction will{" "}
          <span className="font-semibold">not be saved</span>. If you want to
          keep it, close this dialog and click{" "}
          <span className="font-semibold">Save prediction</span> instead.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-50"
          >
            Stay &amp; save
          </button>
          <button
            onClick={onDiscard}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            Discard prediction
          </button>
        </div>
      </div>
    </div>
  );
}
