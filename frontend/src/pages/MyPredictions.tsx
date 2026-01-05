/**
 * My Predictions Page
 *
 * Displays a list of all predictions created by the current user.
 * Provides filtering, sorting, searching, and management capabilities for saved predictions.
 *
 * Features:
 * - Comprehensive table view of all user predictions
 * - Search functionality across name, dataset, and model
 * - Filter by labeled status (all/labeled/unlabeled)
 * - Sort by name, created date, or model name (asc/desc)
 * - Delete confirmation with error handling
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/use_predictor/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "../components/use_predictor/table";
import {
  listMyPredictions,
  deletePrediction,
  type Prediction,
} from "../lib/predictions";
import { Eye, Trash2 } from "lucide-react";

export default function MyPredictions() {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [labeledFilter, setLabeledFilter] = useState<
    "all" | "labeled" | "unlabeled"
  >("all");
  const [sortBy, setSortBy] = useState<"name" | "created" | "model">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadPredictions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPredictions = async () => {
    setLoading(true);
    try {
      const data = await listMyPredictions(searchQuery || undefined);
      setPredictions(data);
    } catch (error) {
      console.error("Failed to load predictions", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPredictions();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleDelete = async (id: number) => {
    try {
      await deletePrediction(id);
      setPredictions((prev) =>
        prev.filter((p) => p.prediction_id !== id),
      );
      setDeletingId(null);
    } catch (error) {
      console.error("Failed to delete prediction", error);
      alert("Failed to delete prediction");
    }
  };

  const handleView = (prediction: Prediction) => {
    // Go to read-only view page, passing the whole prediction
    navigate(`/predictions/${prediction.prediction_id}`, {
      state: {
        prediction,
      },
    });
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleString();
  };

  const filteredAndSortedPredictions = useMemo(() => {
    let filtered = [...predictions];

    if (labeledFilter === "labeled") {
      filtered = filtered.filter((p) => p.is_labeled);
    } else if (labeledFilter === "unlabeled") {
      filtered = filtered.filter((p) => !p.is_labeled);
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "created") {
        comparison =
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime();
      } else if (sortBy === "model") {
        comparison = a.predictor.name.localeCompare(b.predictor.name);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [predictions, labeledFilter, sortBy, sortOrder]);

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-4">
          <div className="text-lg font-semibold tracking-wide text-center">
            My Predictions
          </div>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="space-y-6 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">
                Saved predictions
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                Review, explore, and manage the survival predictions you&apos;ve
                run across your datasets.
              </p>
            </div>
            <Button
              onClick={() => navigate("/use-predictor")}
              className="border border-black/10 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black hover:text-white"
            >
              + New prediction
            </Button>
          </div>

          <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Search by name, dataset, or model"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/70"
                />
              </div>

              <div className="flex flex-1 flex-col gap-1 md:max-w-[11rem]">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Dataset type
                </label>
                <select
                  value={labeledFilter}
                  onChange={(e) =>
                    setLabeledFilter(
                      e.target.value as "all" | "labeled" | "unlabeled",
                    )
                  }
                  className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/70"
                >
                  <option value="all">All predictions</option>
                  <option value="labeled">Labeled only</option>
                  <option value="unlabeled">Unlabeled only</option>
                </select>
              </div>

              <div className="flex flex-1 flex-col gap-1 md:max-w-[11rem]">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Sort by
                </label>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "name" | "created" | "model")
                  }
                  className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/70"
                >
                  <option value="created">Created date</option>
                  <option value="name">Name</option>
                  <option value="model">Model</option>
                </select>
              </div>

              <div className="flex flex-1 flex-col gap-1 md:max-w-[11rem]">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Order
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(e.target.value as "asc" | "desc")
                  }
                  className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/70"
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-neutral-50">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-sm text-neutral-600">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
                <span>Loading your predictions…</span>
              </div>
            ) : filteredAndSortedPredictions.length === 0 ? (
              <div className="px-6 py-10 text-center text-neutral-600">
                <p className="mb-1 text-sm font-medium">
                  No predictions found.
                </p>
                <p className="text-xs">
                  {searchQuery
                    ? "Try a different search term or clear your filters."
                    : "Run your first prediction from the Use Predictor page to see it here."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white/60">
                      <TableHead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Name
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Model
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Dataset
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Created
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Labeled
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
                        C-index
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
                        IBS
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedPredictions.map((prediction) => (
                      <TableRow
                        key={prediction.prediction_id}
                        className="bg-white hover:bg-neutral-50"
                      >
                        <TableCell className="max-w-xs truncate text-sm font-medium text-neutral-900">
                          {prediction.name}
                        </TableCell>
                        <TableCell className="text-sm text-neutral-800">
                          {prediction.predictor.name}
                        </TableCell>
                        <TableCell className="text-sm text-neutral-800">
                          {prediction.dataset.dataset_name}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-600">
                          {formatDate(prediction.created_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={[
                              "inline-flex rounded-full px-2 py-[3px] text-[11px] font-medium",
                              prediction.is_labeled
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border border-neutral-200 bg-neutral-50 text-neutral-700",
                            ].join(" ")}
                          >
                            {prediction.is_labeled ? "True" : "False"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm text-neutral-800">
                          {prediction.c_index !== null
                            ? prediction.c_index.toFixed(3)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm text-neutral-800">
                          {prediction.ibs_score !== null
                            ? prediction.ibs_score.toFixed(3)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-black/10 text-xs text-neutral-800 hover:bg-neutral-100"
                              onClick={() => handleView(prediction)}
                            >
                              <Eye className="h-5 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-200 bg-red-50 text-xs text-red-700 hover:bg-red-100"
                              onClick={() =>
                                setDeletingId(prediction.prediction_id)
                              }
                            >
                              <Trash2 className="h-5 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </div>

      {deletingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">
              Delete prediction?
            </h3>
            <p className="mb-6 text-sm text-neutral-600">
              Are you sure you want to delete this prediction? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-black/10 text-sm text-neutral-800 hover:bg-neutral-100"
                onClick={() => setDeletingId(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDelete(deletingId)}
                className="border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
