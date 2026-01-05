/**
 * View Dataset (Read-only)
 * - Grey/neutral palette to match Dashboard / DatasetUpload.
 * - Sticky header offset by global navbar height.
 * - Single centered card with sectioned content.
 */

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDataset,
  getDatasetStats,
  downloadDatasetFile,
  isUserOwner,
  type Dataset,
  type DatasetStats,
} from "../lib/datasets";
import LinkedPredictorsList from "../components/LinkedPredictorsList";
import {
  formatInteger,
  formatWithUnit,
  InfoItem,
  FeatureCorrelationTable,
  EventHistogramChart,
} from "./PredictorDetailPage";
import { useAuth } from "../auth/AuthContext";
import { CheckCircle2, Printer } from "lucide-react";

const MAX_HISTOGRAM_BARS = 40;

export default function DatasetView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const datasetId = id ? parseInt(id, 10) : null;

  const { user } = useAuth();
  const currentUserId = (user as any)?.id ?? (user as any)?.pk;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Dataset statistics
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Back handling: prefer history, fall back to Dashboard (Datasets tab)
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/dashboard?tab=datasets", { replace: true });
  };

  // Print handler for a specific section only
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

  // Fetch dataset details
  useEffect(() => {
    if (!datasetId) {
      setError("Invalid dataset ID");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await getDataset(datasetId);
        setDataset(data);
      } catch (err: any) {
        if (err?.status === 404) setError("Dataset not found");
        else if (err?.status === 403)
          setError("You don't have permission to view this dataset");
        else setError("Failed to load dataset");
      } finally {
        setLoading(false);
      }
    })();
  }, [datasetId]);

  // Fetch dataset stats
  useEffect(() => {
    if (!datasetId) return;
    setIsLoadingStats(true);
    getDatasetStats(datasetId)
      .then((data) => setStats(data))
      .catch((error) => {
        console.error("Failed to load dataset statistics", error);
        setStatsError("Failed to load dataset metrics.");
      })
      .finally(() => setIsLoadingStats(false));
  }, [datasetId]);

  const handleRefreshStats = useCallback(async () => {
    if (!datasetId) return;
    setIsRefreshing(true);
    setStatsError(null);
    try {
      const fresh = await getDatasetStats(datasetId, { refresh: true });
      setStats(fresh);
    } catch (error) {
      console.error("Failed to refresh dataset statistics", error);
      setStatsError("Failed to refresh dataset metrics. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  }, [datasetId]);

  const handleDownload = async () => {
    if (!dataset || !datasetId || downloading) return;

    const isOwner = isUserOwner(dataset.owner, currentUserId);
    const isAllowedAccess = dataset.allow_admin_access ?? false;

    if (!isOwner && !isAllowedAccess) {
      alert(
        "Download blocked: External access to this dataset has been disabled."
      );
      return;
    }

    console.log("🔒 Security Check:", {
      datasetOwner: dataset.owner,
      myUserId: currentUserId,
      isOwnerResult: isOwner,
      allowAdmin: isAllowedAccess,
      RESULT:
        isOwner || isAllowedAccess
          ? "✅ PASSED (Request sending...)"
          : "❌ BLOCKED",
    });

    try {
      setDownloading(true);
      const { blob, filename } = await downloadDatasetFile(datasetId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Download failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setDownloading(false);
    }
  };

  // Derived values for rendering
  const generalStats = stats?.general_stats;
  const timeUnitLabel = generalStats?.time_unit || dataset?.time_unit || null;

  const hasTimeStats =
    generalStats &&
    [
      generalStats.time_min,
      generalStats.time_max,
      generalStats.time_mean,
      generalStats.time_median,
    ].some((v) => v !== null && v !== undefined);

  const histogramBins = useMemo(
    () => stats?.event_time_histogram?.slice(0, MAX_HISTOGRAM_BARS) ?? [],
    [stats]
  );

  const uploadedAtDisplay =
    dataset?.uploaded_at &&
    new Date(dataset.uploaded_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const ownerDisplay =
    dataset && currentUserId && isUserOwner(dataset.owner, currentUserId)
      ? "You"
      : dataset?.owner_name ?? "Unknown owner";

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 grid place-items-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
          <div className="mt-2 text-sm text-neutral-700">
            Loading dataset…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-100 grid place-items-center">
        <div className="rounded-md border bg-white px-7 py-5 text-center shadow-sm">
          <div className="text-neutral-900 text-base font-semibold">
            {error}
          </div>
          <button
            onClick={() =>
              navigate("/dashboard?tab=datasets", { replace: true })
            }
            className="mt-4 inline-flex items-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:translate-y-[0.5px]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Sticky sub-header with centered dataset info */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
          >
            Back
          </button>

          <div className="flex-1 min-w-0 px-4 text-center">
            <div className="truncate text-sm font-semibold sm:text-base">
              {dataset.dataset_name}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-neutral-200">
              <span className="font-medium">{ownerDisplay}</span>
              {uploadedAtDisplay && (
                <>
                  {" "}
                  • Uploaded {uploadedAtDisplay}
                </>
              )}
              {timeUnitLabel && (
                <>
                  {" "}
                  • Time unit:{" "}
                  <span className="lowercase">{timeUnitLabel}</span>
                </>
              )}
            </div>
          </div>

          {/* Spacer to keep center content visually centered */}
          <div className="w-[76px]" />
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Body — single centered card, like DatasetUpload */}
      <main className="mx-auto max-w-3xl px-2 pb-24 pt-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Info Grid */}
          <section className="grid gap-4 md:grid-cols-2">
            {/* Dataset Info */}
            <div className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">
                Dataset information
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                    Time unit
                  </label>
                  <div className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm capitalize text-neutral-900">
                    {timeUnitLabel || "Not specified"}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                    Visibility
                  </label>
                  <div className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm">
                    <span
                      className={`rounded-full border px-2 py-[2px] text-[11px] font-medium ${
                        dataset.is_public
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-neutral-900 bg-neutral-900 text-white"
                      }`}
                    >
                      {dataset.is_public ? "Public" : "Private"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* File Info */}
            <div className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">
                File information
              </h2>

              {dataset.has_file ? (
                <>
                  <div className="rounded-md border border-neutral-300 bg-white p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl" aria-hidden="true">
                        📄
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-neutral-900">
                          {dataset.file_display_name ||
                            dataset.original_filename ||
                            "Dataset file"}
                        </div>
                        {dataset.file_size_display && (
                          <div className="mt-1 text-xs text-neutral-600">
                            {dataset.file_size_display}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-6 border-t border-neutral-200 pt-3 text-sm">
                    <div>
                      <div className="text-[11px] text-neutral-500">
                        Features
                      </div>
                      <div className="text-sm font-medium text-neutral-900">
                        {dataset.num_features ?? "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-500">
                        Labels (samples)
                      </div>
                      <div className="text-sm font-medium text-neutral-900">
                        {dataset.num_labels ?? "N/A"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="mt-3 w-full rounded-md border border-black/10 bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloading ? "Downloading…" : "Download file"}
                  </button>
                </>
              ) : (
                <div className="rounded-md border border-dashed border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-700">
                  No file is associated with this dataset.
                </div>
              )}
            </div>
          </section>

          {/* Notes */}
          {dataset.notes && (
            <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-50 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">
                Notes
              </h2>
              <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800 whitespace-pre-wrap">
                {dataset.notes}
              </div>
            </section>
          )}

          {/* Data processing */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              Data processing
            </h2>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <div className="mb-1 text-sm font-medium text-emerald-900">
                    Automatic feature imputation
                  </div>
                  <p className="text-xs md:text-sm text-emerald-900/80">
                    Missing numeric values were replaced with column means, and
                    missing categorical values were filled with the most
                    frequent category for each feature.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Dataset metrics (summary + time stats only) */}
          <section className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">
                Dataset metrics
              </h2>
              {datasetId && (
                <button
                  onClick={handleRefreshStats}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh metrics"}
                </button>
              )}
            </div>

            {isLoadingStats ? (
              <p className="text-sm text-neutral-600">
                Loading dataset statistics…
              </p>
            ) : statsError ? (
              <p className="text-sm text-red-600">{statsError}</p>
            ) : stats ? (
              <div className="space-y-4">
                {/* Two boxes: summary vs time stats */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Summary box */}
                  <div className="rounded-md border border-neutral-200 bg-white p-3">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                      Summary
                    </h3>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <InfoItem
                        label="# Samples"
                        value={formatInteger(generalStats?.num_samples)}
                      />
                      <InfoItem
                        label="# Censored"
                        value={formatInteger(generalStats?.num_censored)}
                      />
                      <InfoItem
                        label="# Events"
                        value={formatInteger(generalStats?.num_events)}
                      />
                      <InfoItem
                        label="# Features"
                        value={formatInteger(generalStats?.num_features)}
                      />
                      <InfoItem
                        label="# Numeric features"
                        value={formatInteger(
                          generalStats?.num_numeric_features
                        )}
                      />
                      <InfoItem label="Time unit" value={timeUnitLabel} />
                    </dl>
                  </div>

                  {/* Time stats box */}
                  {hasTimeStats && (
                    <div className="rounded-md border border-neutral-200 bg-white p-3">
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                        Time statistics
                      </h3>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <InfoItem
                          label="Time min"
                          value={formatWithUnit(
                            generalStats?.time_min,
                            timeUnitLabel
                          )}
                        />
                        <InfoItem
                          label="Time max"
                          value={formatWithUnit(
                            generalStats?.time_max,
                            timeUnitLabel
                          )}
                        />
                        <InfoItem
                          label="Time mean"
                          value={formatWithUnit(
                            generalStats?.time_mean,
                            timeUnitLabel
                          )}
                        />
                        <InfoItem
                          label="Time median"
                          value={formatWithUnit(
                            generalStats?.time_median,
                            timeUnitLabel
                          )}
                        />
                      </dl>
                    </div>
                  )}
                </div>

                <p className="text-xs text-neutral-600">
                  Censored subjects are ignored for these calculations.
                </p>
              </div>
            ) : (
              <p className="text-sm text-neutral-600">
                Statistics are not available for this dataset yet. Click
                &ldquo;Refresh metrics&rdquo; to generate them.
              </p>
            )}
          </section>

          {/* Feature correlations (separate card) */}
          <section
            id="dataset-feature-correlations-section"
            className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">
                Feature correlations
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePrintSection("dataset-feature-correlations-section");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-200 active:translate-y-[0.5px]"
              >
                <Printer className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            {stats ? (
              <FeatureCorrelationTable
                rows={stats.feature_correlations ?? []}
              />
            ) : (
              <p className="text-xs text-neutral-600">
                Run dataset metrics first to see feature correlations.
              </p>
            )}
          </section>

          {/* Event time distribution (graph in its own card) */}
          <section
            id="dataset-event-time-section"
            className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">
                Event time distribution
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePrintSection("dataset-event-time-section");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-200 active:translate-y-[0.5px]"
              >
                <Printer className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            {stats ? (
              <EventHistogramChart
                bins={histogramBins}
                timeUnit={timeUnitLabel}
              />
            ) : (
              <p className="text-xs text-neutral-600">
                Run dataset metrics first to see the event time histogram.
              </p>
            )}
          </section>

          {/* Predictors using this dataset */}
          <section className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              Predictors using this dataset
            </h2>
            {datasetId && <LinkedPredictorsList datasetId={datasetId} />}
          </section>
        </div>
      </main>
    </div>
  );
}
