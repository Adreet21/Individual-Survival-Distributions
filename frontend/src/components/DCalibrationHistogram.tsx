import { useState, useMemo, useEffect, useRef } from "react";
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
import type { FullPredictionsData } from "../lib/predictors";
import { getPredictorFullPredictionsData } from "../lib/predictors";
import { Download } from "lucide-react";

interface DCalibrationHistogramProps {
  predictorId: number;
  predictorName: string;
}

interface BinData {
  binLabel: string;
  binStart: number;
  binEnd: number;
  uncensoredPercent: number;
  censoredPercent: number;
  uncensoredCount: number;
  censoredCount: number;
  totalCount: number;
}

export default function DCalibrationHistogram({
  predictorId,
  predictorName,
}: DCalibrationHistogramProps) {
  const [numBins, setNumBins] = useState(10);
  const [fullPredictions, setFullPredictions] =
    useState<FullPredictionsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement | null>(null);

  // Load full predictions data
  useEffect(() => {
    if (!predictorId) return;

    setIsLoading(true);
    setError(null);
    getPredictorFullPredictionsData(predictorId)
      .then(setFullPredictions)
      .catch((err) => {
        console.error("Failed to load full predictions", err);
        setError("Failed to load calibration data.");
      })
      .finally(() => setIsLoading(false));
  }, [predictorId]);

  const { binsData, hosmerLemeshow } = useMemo(() => {
    if (!fullPredictions) {
      return {
        binsData: [] as BinData[],
        hosmerLemeshow: { chiSquare: 0, pValue: 0 },
      };
    }

    const { prob_at_actual_time, actual_events } = fullPredictions;

    const totalSubjects = prob_at_actual_time.length;
    const binWidth = 100 / numBins;
    const bins: BinData[] = [];

    for (let i = 0; i < numBins; i++) {
      const binStart = i * binWidth;
      const binEnd = (i + 1) * binWidth;
      const binLabel = `[${binStart.toFixed(0)},${binEnd.toFixed(0)})`;

      let uncensoredCount = 0;
      let censoredCount = 0;

      prob_at_actual_time.forEach((prob, idx) => {
        if (prob >= binStart && prob < binEnd) {
          if (actual_events[idx] === 1) uncensoredCount++;
          else censoredCount++;
        }
      });

      // Include 100 in last bin
      if (i === numBins - 1) {
        prob_at_actual_time.forEach((prob, idx) => {
          if (prob === 100) {
            if (actual_events[idx] === 1) uncensoredCount++;
            else censoredCount++;
          }
        });
      }

      const totalCount = uncensoredCount + censoredCount;

      const uncensoredPercent = (uncensoredCount / totalSubjects) * 100;
      const censoredPercent = (censoredCount / totalSubjects) * 100;

      bins.push({
        binLabel,
        binStart,
        binEnd,
        uncensoredPercent,
        censoredPercent,
        uncensoredCount,
        censoredCount,
        totalCount,
      });
    }

    let chiSquare = 0;
    bins.forEach((bin) => {
      if (bin.totalCount > 0) {
        const binMidpoint = (bin.binStart + bin.binEnd) / 2 / 100;
        const expectedEvents = binMidpoint * bin.totalCount;
        const observedEvents = bin.uncensoredCount;

        if (expectedEvents > 0) {
          chiSquare +=
            Math.pow(observedEvents - expectedEvents, 2) / expectedEvents;
        }

        const expectedCensored = (1 - binMidpoint) * bin.totalCount;
        const observedCensored = bin.censoredCount;

        if (expectedCensored > 0) {
          chiSquare +=
            Math.pow(observedCensored - expectedCensored, 2) /
            expectedCensored;
        }
      }
    });

    const degreesOfFreedom = numBins - 2;
    const pValue = calculateChiSquarePValue(chiSquare, degreesOfFreedom);

    return {
      binsData: bins,
      hosmerLemeshow: { chiSquare, pValue },
    };
  }, [fullPredictions, numBins]);

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
        link.download = `d-calibration-histogram-${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      });
    };

    img.src = url;
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
        <p className="ml-3 text-sm text-neutral-500">
          Loading calibration data...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!fullPredictions || binsData.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-neutral-500">
          No calibration data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-800">
          Calibration Histogram for Predictor &quot;{predictorName}&quot;
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Number of Bins:
          <input
            type="number"
            min={5}
            max={20}
            value={numBins}
            onChange={(e) =>
              setNumBins(
                Math.max(
                  5,
                  Math.min(20, parseInt(e.target.value, 10) || 10),
                ),
              )
            }
            className="w-20 rounded-md border border-neutral-300 px-2 py-1"
          />
        </label>
        <div className="text-sm text-neutral-600">
          Hosmer-Lemeshow statistics:{" "}
          <span className="font-semibold">
            {hosmerLemeshow.chiSquare.toFixed(3)}
          </span>
          {" | "}
          Hosmer-Lemeshow p-value:{" "}
          <span className="font-semibold">
            {hosmerLemeshow.pValue.toFixed(3)}
          </span>
        </div>
      </div>

      <div ref={chartRef} className="rounded-md border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-center text-sm font-semibold text-neutral-700">
            Histogram (Sideways) of &quot;Probability of Event&quot;
            <br />
            <span className="text-xs font-normal text-neutral-500">
              By Censored Status
            </span>
          </h3>
          <button
            type="button"
            onClick={handleDownloadChart}
            title="Download chart as PNG"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Download chart as PNG</span>
          </button>
        </div>
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={binsData}
              layout="vertical"
              margin={{ top: 10, right: 30, bottom: 20, left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                domain={[0, 100]}
                label={{
                  value: "Percentage in bin",
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="binLabel"
                label={{
                  value: "Predicted Probability of Actual Event",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#4b5563", fontSize: 12 },
                }}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 12,
                  paddingTop: "30px",
                }}
                iconType="square"
              />
              <Bar
                dataKey="uncensoredPercent"
                name="Uncensored"
                fill="#3b82f6"
                stackId="stack"
                isAnimationActive={false}
              />
              <Bar
                dataKey="censoredPercent"
                name="Censored"
                fill="#dc2626"
                stackId="stack"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-4 text-center text-xs text-neutral-500">
          Click on the legend to show/hide each group.
        </p>
      </div>
    </div>
  );
}

// Custom tooltip component
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload as BinData;
  const binPercent = data.uncensoredPercent + data.censoredPercent;

  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-neutral-700">Bin: {data.binLabel}</p>
      <p className="text-neutral-600">
        Total in bin: {data.totalCount} ({binPercent.toFixed(1)}% of all
        subjects)
      </p>
      <p className="text-blue-600">
        Uncensored: {data.uncensoredCount} (
        {data.uncensoredPercent.toFixed(1)}% of all)
      </p>
      <p className="text-red-600">
        Censored: {data.censoredCount} ({data.censoredPercent.toFixed(1)}% of
        all)
      </p>
    </div>
  );
}

// Approximate chi-square p-value calculation
function calculateChiSquarePValue(chiSquare: number, df: number): number {
  if (df <= 0 || chiSquare < 0) return 1;

  // Wilson-Hilferty approximation
  const z = Math.pow(chiSquare / df, 1 / 3) - (1 - 2 / (9 * df));
  const denominator = Math.sqrt(2 / (9 * df));
  const normalZ = z / denominator;

  const pValue = 1 - normalCDF(normalZ);

  return Math.max(0, Math.min(1, pValue));
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-(x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return x > 0 ? 1 - prob : prob;
}
