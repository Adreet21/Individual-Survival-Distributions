import { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SurvivalCurvesData, PredictionsSummaryData } from "../lib/predictors";
import { getPredictorPredictionsSummary } from "../lib/predictors";
import PredictionsSummaryTable from "./PredictionsSummaryTable";
import { Download, FileDown } from "lucide-react";

interface IndividualSurvivalCurvesProps {
  data: SurvivalCurvesData;
  timeUnit?: string | null;
  predictorId: number;
}

const COLORS = [
  "#1d4ed8", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#8b5cf6",
  "#e11d48", "#0d9488", "#ca8a04", "#9333ea", "#be123c",
  "#0e7490", "#a16207", "#7e22ce", "#be185d", "#155e75",
];

export default function IndividualSurvivalCurves({
  data,
  timeUnit,
  predictorId,
}: IndividualSurvivalCurvesProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  const [displayMode, setDisplayMode] = useState<"random" | "selected">(
    "random",
  );
  const [numRandomCurves, setNumRandomCurves] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<Set<string>>(
    new Set(),
  );
  const [predictionsData, setPredictionsData] =
    useState<PredictionsSummaryData | null>(null);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);

  // Load predictions summary data
  useEffect(() => {
    setIsLoadingPredictions(true);
    setPredictionsError(null);
    getPredictorPredictionsSummary(predictorId)
      .then(setPredictionsData)
      .catch((err) => {
        console.error("Failed to load predictions summary", err);
        setPredictionsError("Failed to load predictions table data.");
      })
      .finally(() => setIsLoadingPredictions(false));
  }, [predictorId]);

  const allIdentifiers = useMemo(() => Object.keys(data.curves), [data]);

  const filteredIdentifiers = useMemo(() => {
    if (!searchQuery) return allIdentifiers;
    const term = searchQuery.toLowerCase();
    return allIdentifiers.filter((id) => id.toLowerCase().includes(term));
  }, [allIdentifiers, searchQuery]);

  const displayedIdentifiers = useMemo(() => {
    if (displayMode === "random") {
      const shuffled = [...allIdentifiers].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, numRandomCurves);
    }
    return Array.from(selectedIdentifiers);
  }, [displayMode, allIdentifiers, numRandomCurves, selectedIdentifiers]);

  const chartData = useMemo(() => {
    // Find all unique time points across selected curves
    const timePointsSet = new Set<number>();

    displayedIdentifiers.forEach((id) => {
      data.curves[id]?.times.forEach((t) => timePointsSet.add(t));
    });

    const sortedTimes = Array.from(timePointsSet).sort((a, b) => a - b);

    // Create data points for each time with interpolation for smooth curves
    return sortedTimes.map((time) => {
      const point: Record<string, number> = { time };

      displayedIdentifiers.forEach((id) => {
        const curve = data.curves[id];
        if (!curve) return;

        // Find the survival probability at this time point with linear interpolation
        let survivalProb = 100;

        for (let i = 0; i < curve.times.length; i++) {
          if (curve.times[i] === time) {
            // Exact match
            survivalProb = curve.survival_probabilities[i];
            break;
          } else if (curve.times[i] > time) {
            // Interpolate between previous and current point
            if (i > 0) {
              const t0 = curve.times[i - 1];
              const t1 = curve.times[i];
              const p0 = curve.survival_probabilities[i - 1];
              const p1 = curve.survival_probabilities[i];

              const ratio = (time - t0) / (t1 - t0);
              survivalProb = p0 + ratio * (p1 - p0);
            } else {
              survivalProb = curve.survival_probabilities[i];
            }
            break;
          } else {
            // Keep the last known value
            survivalProb = curve.survival_probabilities[i];
          }
        }

        point[`id_${id}`] = survivalProb;
      });

      // Overall Kaplan–Meier-like curve: average of individual curves at each time
      const individualProbs = displayedIdentifiers
        .map((id) => point[`id_${id}`])
        .filter((p) => p !== undefined);

      if (individualProbs.length > 0) {
        point.kaplanMeier =
          individualProbs.reduce((sum, p) => sum + p, 0) / individualProbs.length;
      }

      return point;
    });
  }, [data, displayedIdentifiers]);

  const handleToggleIdentifier = (id: string) => {
    const next = new Set(selectedIdentifiers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIdentifiers(next);
  };

  const handleSelectAll = () => {
    setSelectedIdentifiers(new Set(filteredIdentifiers));
  };

  const handleDeselectAll = () => {
    setSelectedIdentifiers(new Set());
  };

  const handleDownloadChart = () => {
    if (!chartRef.current) return;

    const svgElement = chartRef.current.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement("a");
        link.download = `survival-curves-${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      });
    };

    img.src = url;
  };

  const handleDownloadCSV = () => {
    if (!chartData.length) return;

    const headers = ["Time", "Overall Kaplan-Meier", ...displayedIdentifiers];
    const rows = chartData.map((point) => {
      const row = [point.time, point.kaplanMeier ?? ""];
      displayedIdentifiers.forEach((id) => {
        row.push(point[`id_${id}`] ?? "");
      });
      return row.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `survival-curves-data-${Date.now()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-md border bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">
              Display Mode:
            </label>
            <select
              value={displayMode}
              onChange={(e) =>
                setDisplayMode(e.target.value as "random" | "selected")
              }
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            >
              <option value="random">Random Sample</option>
              <option value="selected">Selected Identifiers</option>
            </select>
          </div>

          {displayMode === "random" && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-700">
                Number of curves:
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={numRandomCurves}
                onChange={(e) =>
                  setNumRandomCurves(
                    Math.max(
                      1,
                      Math.min(50, parseInt(e.target.value, 10) || 10),
                    ),
                  )
                }
                className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
          )}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleDownloadChart}
              disabled={!displayedIdentifiers.length}
              title="Download chart as PNG"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Download chart as PNG</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCSV}
              disabled={!displayedIdentifiers.length}
              title="Download data as CSV"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Download data as CSV</span>
            </button>
          </div>
        </div>

        {displayMode === "selected" && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search identifiers..."
                className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:underline"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-sm text-blue-600 hover:underline"
              >
                Deselect All
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-md border bg-white">
              {filteredIdentifiers.length === 0 ? (
                <p className="p-4 text-center text-sm text-neutral-500">
                  No identifiers found
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 md:grid-cols-4">
                  {filteredIdentifiers.map((id) => (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-neutral-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIdentifiers.has(id)}
                        onChange={() => handleToggleIdentifier(id)}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                      <span className="text-sm">{id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-neutral-500">
              {selectedIdentifiers.size} of {allIdentifiers.length} identifiers
              selected
            </p>
          </div>
        )}
      </div>

      {/* Chart */}
      {displayedIdentifiers.length === 0 ? (
        <div className="flex h-96 items-center justify-center rounded-md border bg-neutral-50">
          <p className="text-sm text-neutral-500">
            {displayMode === "selected"
              ? "Select identifiers to display their survival curves"
              : "No curves to display"}
          </p>
        </div>
      ) : (
        <div ref={chartRef} className="rounded-md border bg-white p-4">
          <h3 className="mb-4 text-center text-sm font-semibold text-neutral-700">
            Individual Survival Curves
            {displayMode === "random" &&
              ` (${displayedIdentifiers.length} random samples)`}
          </h3>
          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 30, bottom: 60, left: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={[0, "auto"]}
                  label={{
                    value: `Time${timeUnit ? ` (${timeUnit})` : ""}`,
                    position: "insideBottom",
                    offset: -10,
                    style: { fill: "#4b5563", fontSize: 12 },
                  }}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 100]}
                  label={{
                    value: "Survival Probability (%)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#4b5563", fontSize: 12 },
                  }}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  labelFormatter={(label) =>
                    `Time: ${label}${
                      timeUnit ? ` ${timeUnit}` : ""
                    }`
                  }
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    maxHeight: 100,
                    overflowY: "auto",
                    paddingTop: "30px",
                    marginTop: "20px",
                  }}
                  iconType="line"
                />
                {/* Overall curve */}
                <Line
                  type="monotone"
                  dataKey="kaplanMeier"
                  name="Overall Kaplan-Meier"
                  stroke="#000000"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
                {/* Individual curves */}
                {displayedIdentifiers.map((id, index) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={`id_${id}`}
                    name={id}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Each curve represents the predicted survival probability over time for
        an individual subject.
        {displayMode === "random" &&
          " Curves are randomly sampled from all available subjects."}
      </p>

      {/* Predictions Summary Table */}
      <div className="mt-8 rounded-md border bg-white p-4">
        {isLoadingPredictions ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
            <p className="ml-3 text-sm text-neutral-500">
              Loading predictions table...
            </p>
          </div>
        ) : predictionsError ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-red-600">{predictionsError}</p>
          </div>
        ) : predictionsData ? (
          <PredictionsSummaryTable
            predictions={predictionsData.predictions}
          />
        ) : (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-neutral-500">
              No predictions data available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
