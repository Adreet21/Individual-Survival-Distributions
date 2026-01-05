import { useState, useEffect, useMemo } from "react";
import {
  getComparablePredictors,
  comparePredictorsCvStats,
  type ComparablePredictor,
  type PredictorCvComparison,
} from "../lib/predictors";
import { FileDown } from "lucide-react";

interface PredictorComparisonTableProps {
  predictorId: number;
  predictorName: string;
}

// Helper to format metric values with mean ± std
function formatMetricWithStd(values: any, decimals: number = 3): string {
  if (values === undefined || values === null) {
    return "—";
  }

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

  if (typeof values === "number") {
    return `${values.toFixed(decimals)}`;
  }

  return "—";
}

// Metric definitions 
const METRICS = [
  { key: "Cindex", label: "Concordance Index (C-index)", decimals: 3 },
  { key: "IBS", label: "Integrated Brier Score (IBS)", decimals: 3 },
  { key: "MAE_Hinge", label: "MAE Hinge", decimals: 3 },
  { key: "MAE_PO", label: "MAE PO", decimals: 3 },
  { key: "KM_cal", label: "KM Calibration", decimals: 3 },
  { key: "xCal_stats", label: "X-Calibration Statistics", decimals: 3 },
  { key: "wsc_xCal_stats", label: "WSC X-Calibration Statistics", decimals: 3 },
  { key: "dcal_p", label: "D-Calibration p-value", decimals: 3 },
  { key: "dcal_Chi", label: "D-Calibration χ² statistic", decimals: 3 },
  { key: "train_times", label: "Training Time (seconds)", decimals: 3 },
  { key: "infer_times", label: "Inference Time (seconds)", decimals: 3 },
];

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function downloadComparisonCsv(comparisons: PredictorCvComparison[]) {
  if (typeof document === "undefined") return;
  if (!comparisons.length) return;

  const header = ["Metric", ...comparisons.map((c) => c.name)];
  const rows: string[][] = [header];

  METRICS.forEach(({ key, label, decimals }) => {
    const row: string[] = [label];
    comparisons.forEach((comp) => {
      const metric = comp.ml_model_metrics?.[key];
      row.push(formatMetricWithStd(metric, decimals));
    });
    rows.push(row);
  });

  const csv = rows
    .map((cols) => cols.map(escapeCsvCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "predictor-comparison-cv-metrics.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PredictorComparisonTable({
  predictorId,
  predictorName,
}: PredictorComparisonTableProps) {
  const [availablePredictors, setAvailablePredictors] = useState<
    ComparablePredictor[]
  >([]);
  const [selectedPredictorIds, setSelectedPredictorIds] = useState<
    Set<number>
  >(new Set([predictorId]));
  const [comparisons, setComparisons] = useState<PredictorCvComparison[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(true);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState<string>("");

  // Load available predictors on mount
  useEffect(() => {
    async function loadAvailablePredictors() {
      setIsLoadingAvailable(true);
      setError(null);
      try {
        const data = await getComparablePredictors(predictorId);
        setAvailablePredictors(
          data.comparable_predictors.filter((p) => p.has_cv_stats)
        );
        setDatasetName(data.base_predictor.dataset_name);
      } catch (err) {
        console.error("Failed to load comparable predictors", err);
        setError("Failed to load available predictors for comparison.");
      } finally {
        setIsLoadingAvailable(false);
      }
    }

    loadAvailablePredictors();
  }, [predictorId]);

  // Handle comparing selected predictors
  const handleCompare = async () => {
    if (selectedPredictorIds.size < 2) {
      setError(
        "Please select at least 2 predictors to compare (including the current one)."
      );
      return;
    }

    setIsLoadingComparison(true);
    setError(null);
    try {
      const data = await comparePredictorsCvStats(
        Array.from(selectedPredictorIds)
      );
      setComparisons(data.comparisons);
    } catch (err) {
      console.error("Failed to compare predictors", err);
      setError("Failed to load comparison statistics. Please try again.");
    } finally {
      setIsLoadingComparison(false);
    }
  };

  const handleTogglePredictor = (id: number) => {
    const newSelected = new Set(selectedPredictorIds);
    if (id === predictorId) {
      // Don't allow deselecting the current predictor
      return;
    }
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPredictorIds(newSelected);
  };

  // Determine best/worst values for highlighting
  const metricHighlights = useMemo(() => {
    if (!comparisons.length) return null;

    const highlights: Record<
      string,
      { best: number | null; worst: number | null; higherIsBetter: boolean }
    > = {};

    METRICS.forEach(({ key }) => {
      const values = comparisons
        .map((comp) => {
          if (!comp.ml_model_metrics || !comp.ml_model_metrics[key]) return null;
          const metric = comp.ml_model_metrics[key];
          if (typeof metric === "object" && "mean" in metric) {
            return metric.mean as number;
          }
          return null;
        })
        .filter((v): v is number => v !== null && !isNaN(v));

      if (values.length > 0) {
        // For most metrics, higher is better (except error/loss metrics)
        const lowerIsBetter = [
          "IBS",
          "MAE_Hinge",
          "MAE_PO",
          "train_times",
          "infer_times",
          "dcal_Chi",
        ].includes(key);
        highlights[key] = {
          best: lowerIsBetter ? Math.min(...values) : Math.max(...values),
          worst: lowerIsBetter ? Math.max(...values) : Math.min(...values),
          higherIsBetter: !lowerIsBetter,
        };
      }
    });

    return highlights;
  }, [comparisons]);

  if (isLoadingAvailable) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-sm text-neutral-500">
        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
        <p>Loading comparable predictors…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <h3 className="text-sm font-semibold text-neutral-700">
          Compare with Other Predictors
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Select predictors from the same dataset ({datasetName}) to compare
          cross-validation statistics.
        </p>

        {availablePredictors.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            No other predictors with CV statistics are available on this
            dataset.
          </p>
        ) : (
          <>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md border bg-white">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-neutral-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Select
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Predictor Name
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Owner
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {/* Current predictor (always selected) */}
                  <tr className="bg-blue-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={true}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-neutral-800">
                      {predictorName}{" "}
                      <span className="text-xs text-blue-600">(current)</span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">-</td>
                    <td className="px-3 py-2 text-neutral-600">-</td>
                  </tr>

                  {/* Other predictors */}
                  {availablePredictors.map((pred) => (
                    <tr key={pred.predictor_id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedPredictorIds.has(pred.predictor_id)}
                          onChange={() =>
                            handleTogglePredictor(pred.predictor_id)
                          }
                          className="h-4 w-4 rounded border-neutral-300 text-black focus:ring-black"
                        />
                      </td>
                      <td className="px-3 py-2 text-neutral-800">{pred.name}</td>
                      <td className="px-3 py-2 text-neutral-600">
                        {pred.owner}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">
                        {new Date(pred.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                {selectedPredictorIds.size} predictor
                {selectedPredictorIds.size === 1 ? "" : "s"} selected
              </p>
              <button
                onClick={handleCompare}
                disabled={
                  selectedPredictorIds.size < 2 || isLoadingComparison
                }
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingComparison ? (
                  <span className="flex items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
                    <span>Comparing…</span>
                  </span>
                ) : (
                  "Compare Selected"
                )}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Comparison Results */}
      {comparisons.length > 0 && (
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              Cross-Validation Statistics Comparison
            </h3>
            <button
              type="button"
              onClick={() => downloadComparisonCsv(comparisons)}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 active:translate-y-[0.5px]"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="sticky left-0 px-3 py-2 text-left font-semibold text-neutral-700 bg-neutral-100">
                    Metric
                  </th>
                  {comparisons.map((comp) => (
                    <th
                      key={comp.predictor_id}
                      className="px-3 py-2 text-right font-semibold text-neutral-700"
                    >
                      <div
                        className="max-w-[180px] truncate"
                        title={comp.name}
                      >
                        {comp.name}
                      </div>
                      {comp.predictor_id === predictorId && (
                        <span className="text-xs font-normal text-blue-600">
                          (current)
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {METRICS.map(({ key, label, decimals }, idx) => (
                  <tr
                    key={key}
                    className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                  >
                    <td className="sticky left-0 bg-inherit px-3 py-2 text-neutral-800">
                      {label}
                    </td>
                    {comparisons.map((comp) => {
                      const value = comp.ml_model_metrics?.[key];
                      const formattedValue = formatMetricWithStd(
                        value,
                        decimals
                      );

                      const meanValue =
                        value &&
                        typeof value === "object" &&
                        "mean" in value
                          ? (value.mean as number)
                          : null;
                      const highlight = metricHighlights?.[key];
                      const isBest =
                        highlight &&
                        meanValue !== null &&
                        meanValue === highlight.best;
                      const isWorst =
                        highlight &&
                        meanValue !== null &&
                        meanValue === highlight.worst;

                      return (
                        <td
                          key={comp.predictor_id}
                          className={`px-3 py-2 text-right font-mono ${
                            isBest
                              ? "bg-green-50 font-semibold text-green-700"
                              : isWorst
                              ? "text-red-600"
                              : "text-neutral-600"
                          }`}
                        >
                          {formattedValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            * Values shown as mean ± standard deviation across cross-validation
            folds.
            <span className="ml-2 font-semibold text-green-700">
              Best values highlighted in green.
            </span>
          </p>

          {/* Show errors for individual predictors */}
          {comparisons.some((c) => c.error) && (
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold text-neutral-700">
                Errors:
              </h4>
              {comparisons
                .filter((c) => c.error)
                .map((c) => (
                  <p key={c.predictor_id} className="text-xs text-red-600">
                    {c.name}: {c.error}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
