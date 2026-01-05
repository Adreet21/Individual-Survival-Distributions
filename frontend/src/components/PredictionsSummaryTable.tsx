import { useState, useMemo } from "react";
import type { PredictionSummaryRow } from "../lib/predictors";

interface PredictionsSummaryTableProps {
  predictions: PredictionSummaryRow[];
}

export default function PredictionsSummaryTable({
  predictions,
}: PredictionsSummaryTableProps) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof PredictionSummaryRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filter predictions based on search
  const filteredPredictions = useMemo(() => {
    if (!searchQuery) return predictions;
    const term = searchQuery.toLowerCase();
    return predictions.filter((pred) =>
      pred.identifier.toString().includes(term)
    );
  }, [predictions, searchQuery]);

  // Sort predictions
  const sortedPredictions = useMemo(() => {
    if (!sortColumn) return filteredPredictions;

    return [...filteredPredictions].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [filteredPredictions, sortColumn, sortDirection]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedPredictions.length / rowsPerPage));
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedPredictions = sortedPredictions.slice(
    startIndex,
    startIndex + rowsPerPage
  );

  // Reset to page 1 when filters change
  useMemo(() => {
    setPage(1);
  }, [rowsPerPage, searchQuery, sortColumn, sortDirection]);

  const handleSort = (column: keyof PredictionSummaryRow) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const formatNumber = (value: number | null, decimals = 2): string => {
    if (value === null || value === undefined || isNaN(value)) return "-";
    return value.toFixed(decimals);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-700">
          Individual Predictions
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Rows per page:
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search identifier..."
            className="w-48 rounded-md border border-neutral-300 px-3 py-1 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-100">
            <tr>
              <th
                onClick={() => handleSort("identifier")}
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Identifier {sortColumn === "identifier" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("censored")}
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Censored? {sortColumn === "censored" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("event_time")}
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Event Time {sortColumn === "event_time" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("predicted_prob_event")}
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Predicted % P<sub>i</sub>(Event<sub>i</sub>) {sortColumn === "predicted_prob_event" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("predicted_median_survival")}
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Predicted Median Survival {sortColumn === "predicted_median_survival" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("predicted_mean_survival")}
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Predicted Mean Survival {sortColumn === "predicted_mean_survival" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("absolute_error")}
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200"
              >
                Absolute Error {sortColumn === "absolute_error" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {paginatedPredictions.map((pred, index) => (
              <tr
                key={pred.identifier}
                className={index % 2 === 0 ? "bg-white" : "bg-neutral-50"}
              >
                <td className="px-4 py-3 text-neutral-800">{pred.identifier}</td>
                <td className="px-4 py-3">
                  <span
                    className={`font-medium ${
                      pred.censored === "yes" ? "text-green-600" : "text-neutral-600"
                    }`}
                  >
                    {pred.censored}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {formatNumber(pred.event_time, 1)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {formatNumber(pred.predicted_prob_event, 1)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {formatNumber(pred.predicted_median_survival, 2)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {formatNumber(pred.predicted_mean_survival, 2)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {formatNumber(pred.absolute_error, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>
          Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, sortedPredictions.length)} of{" "}
          {sortedPredictions.length} entries
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            First
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
