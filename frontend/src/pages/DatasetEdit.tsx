/**
 * Edit Dataset
 *
 * UX notes:
 * - Similar to DatasetUpload but for editing existing datasets
 * - File cannot be changed (show current file info)
 * - Name field checks availability (excluding current dataset)
 * - Pre-populate all fields with current values
 * - Save updates the dataset metadata
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDataset,
  updateDataset,
  listMyDatasets,
  listDatasetPermissions,
  grantDatasetViewer,
  revokeDatasetPermission,
  type Dataset,
  type DatasetPermission,
} from "../lib/datasets";
import LinkedPredictorsList from "../components/LinkedPredictorsList";
import {
  UserSearchInput,
  type UserSuggestion,
} from "../components/UserSearchInput";
import { resolveUsernameToId } from "../lib/users";

type TimeUnit = "year" | "month" | "day" | "hour";

type ShareRow = {
  id: number;
  username: string;
  role: "viewer";
  userId?: number;
  permissionId?: number;
  isProcessing?: boolean;
};

export default function DatasetEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const datasetId = id ? parseInt(id) : null;

  // form state
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("month");
  const [isPublic, setIsPublic] = useState(false);

  // dataset info
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [originalName, setOriginalName] = useState("");

  // sharing state
  const [shareRows, setShareRows] = useState<ShareRow[]>([]);
  const [sharingError, setSharingError] = useState<string | null>(null);

  // meta state
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // local detection to decide whether to warn
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (!dataset) {
      setIsDirty(false);
      return;
    }
    const hasChanges =
      name.trim() !== dataset.dataset_name ||
      notes.trim() !== (dataset.notes || "") ||
      timeUnit !== dataset.time_unit ||
      isPublic !== dataset.is_public;
    setIsDirty(hasChanges);
  }, [name, notes, timeUnit, isPublic, dataset]);

  // Load dataset data
  useEffect(() => {
    if (!datasetId) {
      setError("Invalid dataset ID");
      setLoading(false);
      return;
    }

    async function loadDataset() {
      try {
        const data = await getDataset(datasetId!);
        setDataset(data);
        setName(data.dataset_name);
        setOriginalName(data.dataset_name);
        setNotes(data.notes || "");
        setTimeUnit(data.time_unit);
        setIsPublic(data.is_public);
      } catch (err: any) {
        if (err?.status === 404) {
          setError("Dataset not found");
        } else if (err?.status === 403) {
          setError("You don't have permission to edit this dataset");
        } else {
          setError("Failed to load dataset");
        }
      } finally {
        setLoading(false);
      }
    }

    loadDataset();
  }, [datasetId]);

  // Load dataset permissions
  useEffect(() => {
    if (!datasetId) {
      setShareRows([{ id: 1, username: "", role: "viewer" }]);
      return;
    }

    (async () => {
      try {
        const permissions: DatasetPermission[] = await listDatasetPermissions(
          datasetId
        );
        const mapped: ShareRow[] = permissions.map((perm, idx) => ({
          id: idx + 1,
          username: perm.user.username,
          role: "viewer",
          userId: perm.user.id,
          permissionId: perm.id,
        }));
        if (mapped.length === 0) {
          mapped.push({ id: 1, username: "", role: "viewer" });
        }
        setShareRows(mapped);
        setSharingError(null);
      } catch (err) {
        console.error("Failed to load dataset permissions", err);
        setSharingError("Failed to load sharing settings.");
        setShareRows([{ id: 1, username: "", role: "viewer" }]);
      }
    })();
  }, [datasetId]);

  // check name availability (client-side, excluding current dataset)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const trimmed = name.trim();
      if (!trimmed || trimmed === originalName) {
        setNameTaken(null);
        return;
      }
      setChecking(true);
      try {
        const mine = await listMyDatasets();
        const exists = mine.some(
          (d) =>
            d.dataset_name.toLowerCase() === trimmed.toLowerCase() &&
            d.dataset_id !== datasetId
        );
        if (!cancelled) setNameTaken(exists);
      } catch {
        if (!cancelled) setNameTaken(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, originalName, datasetId]);

  // "valid" when the required bits are present and changed
  const pendingShareRows = useMemo(
    () => shareRows.filter((row) => !row.permissionId && row.username.trim()),
    [shareRows]
  );

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (nameTaken) return false;
    if (!isDirty && pendingShareRows.length === 0) return false;
    return true;
  }, [name, nameTaken, isDirty, pendingShareRows]);

  // Save - update dataset
  const onSave = async () => {
    if (!canSave || saving || !datasetId) return;
    setSaving(true);
    try {
      const datasetHasChanges = isDirty;
      const pendingShares = pendingShareRows;

      if (datasetHasChanges) {
        const updateData = {
          dataset_name: name.trim(),
          notes: notes.trim() || undefined,
          time_unit: timeUnit,
          is_public: isPublic,
        };
        await updateDataset(datasetId, updateData);
      }

      const failedShares: string[] = [];
      if (pendingShares.length > 0) {
        const existingUserIds = new Set(
          shareRows
            .filter((row) => row.permissionId && typeof row.userId === "number")
            .map((row) => row.userId as number)
        );
        const processedUserIds = new Set<number>();

        for (const row of pendingShares) {
          const username = row.username.trim();
          if (!username) continue;

          let userId = row.userId;
          if (!userId) {
            const resolvedId = await resolveUsernameToId(username);
            userId = resolvedId ?? undefined;
          }
          if (!userId) {
            failedShares.push(username);
            continue;
          }
          if (existingUserIds.has(userId) || processedUserIds.has(userId)) {
            continue;
          }

          try {
            await grantDatasetViewer(datasetId, userId);
            processedUserIds.add(userId);
          } catch (grantErr) {
            console.error("Failed to grant dataset access", grantErr);
            failedShares.push(username);
          }
        }
      }

      if (failedShares.length) {
        alert(
          `Dataset updated, but sharing failed for: ${failedShares.join(
            ", "
          )}. Please check the usernames and try again.`
        );
      }

      navigate("/dashboard", { state: { tab: "datasets" } });
    } catch (err: any) {
      let errorMessage = "Failed to update dataset. Please try again.";

      if (err?.details) {
        if (typeof err.details === "object") {
          const errors = Object.entries(err.details)
            .map(
              ([field, messages]) =>
                `${field}: ${
                  Array.isArray(messages) ? messages.join(", ") : messages
                }`
            )
            .join("\n");
          errorMessage = `Validation errors:\n${errors}`;
        } else if (typeof err.details === "string") {
          errorMessage = err.details;
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const onBack = () => {
    if (isDirty || pendingShareRows.length > 0) {
      setShowLeavePrompt(true);
    } else {
      navigate("/dashboard", { state: { tab: "datasets" } });
    }
  };

  function addShareRow() {
    setSharingError(null);
    setShareRows((prev) => {
      const nextId = (prev.at(-1)?.id ?? 0) + 1;
      return [...prev, { id: nextId, username: "", role: "viewer" }];
    });
  }

  function removeShareRowFromState(rowId: number) {
    setShareRows((prev) => {
      const filtered = prev.filter((row) => row.id !== rowId);
      if (filtered.length === 0) {
        return [{ id: 1, username: "", role: "viewer" }];
      }
      return filtered;
    });
  }

  function updateShareRow(id: number, patch: Partial<ShareRow>) {
    setSharingError(null);
    setShareRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function handleUserSelect(id: number, user: UserSuggestion) {
    updateShareRow(id, { username: user.username, userId: user.id });
  }

  async function removeShareRow(row: ShareRow) {
    if (row.permissionId) {
      updateShareRow(row.id, { isProcessing: true });
      try {
        await revokeDatasetPermission(row.permissionId);
        removeShareRowFromState(row.id);
        setSharingError(null);
      } catch (err) {
        console.error("Failed to revoke dataset access", err);
        setSharingError(`Failed to revoke access for ${row.username}.`);
        updateShareRow(row.id, { isProcessing: false });
      }
      return;
    }

    removeShareRowFromState(row.id);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-neutral-100 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
          <div className="mt-2 text-sm text-neutral-600">Loading dataset...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] bg-neutral-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-lg font-semibold">{error}</div>
          <button
            onClick={() =>
              navigate("/dashboard", { state: { tab: "datasets" } })
            }
            className="mt-4 inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky header (matches DatasetUpload) */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">Edit Dataset</div>
          <button
            onClick={onSave}
            disabled={!canSave || saving}
            className="inline-flex items-center rounded-md border border-black/10 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Page heading */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              Update the dataset’s name, notes, time unit, and sharing settings.
              The underlying file stays the same.
            </p>
          </section>

          {/* Name */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => {
                if (e.target.value.length <= 50) {
                  setName(e.target.value);
                }
              }}
              maxLength={50}
              className="w-full rounded-md border border-neutral-400 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              placeholder="A concise dataset name"
            />
            <div className="flex justify-between items-start min-h-[1.25rem] text-xs">
              <div>
                {name && name.trim() !== originalName ? (
                  checking ? (
                    <span className="text-neutral-500">
                      Checking availability…
                    </span>
                  ) : nameTaken === true ? (
                    <span className="text-red-600">
                      This name is already taken.
                    </span>
                  ) : nameTaken === false ? (
                    <span className="text-green-600">
                      Name is available. Proceed!
                    </span>
                  ) : (
                    <span className="text-neutral-500">
                      Could not verify name; you can still proceed.
                    </span>
                  )
                ) : (
                  <span className="text-neutral-500">
                    This maps to <code>dataset_name</code>.
                  </span>
                )}
              </div>
              <span
                className={`text-xs ${
                  name.length > 45
                    ? "text-red-600"
                    : name.length > 40
                    ? "text-orange-600"
                    : "text-neutral-400"
                }`}
              >
                {name.length}/50
              </span>
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setNotes(e.target.value);
                }
              }}
              maxLength={200}
              rows={4}
              className="w-full rounded-md border border-neutral-400 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              placeholder="Optional notes for collaborators about this dataset (max 2 sentences)."
            />
            <div className="flex justify-end">
              <span
                className={`text-xs ${
                  notes.length > 180
                    ? "text-red-600"
                    : notes.length > 160
                    ? "text-orange-600"
                    : "text-neutral-400"
                }`}
              >
                {notes.length}/200
              </span>
            </div>
          </section>

          {/* Current File Info */}
          <section className="space-y-3 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Current file
            </div>
            <div className="rounded-md border border-neutral-300 bg-white p-3">
              {dataset?.has_file ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📄</span>
                    <div>
                      <div className="text-sm font-medium text-neutral-900">
                        {dataset.file_display_name || dataset.original_filename}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {dataset.file_size_display} • Uploaded{" "}
                        {new Date(
                          dataset.uploaded_at
                        ).toLocaleDateString()}
                      </div>

                      <div className="mt-2 flex gap-4 border-t border-black/5 pt-2">
                        <div>
                          <div className="text-xs text-neutral-500">
                            Features
                          </div>
                          <div className="text-sm font-medium text-neutral-800">
                            {dataset.num_features ?? "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">
                            Labels (Samples)
                          </div>
                          <div className="text-sm font-medium text-neutral-800">
                            {dataset.num_labels ?? "N/A"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-600">
                    Note: Files cannot be changed after upload. To use a
                    different file, create a new dataset.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-neutral-600">
                  No file associated with this dataset.
                </div>
              )}
            </div>
          </section>

          {/* Time Unit */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-50/80 p-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Time Unit
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-black/10 bg-white">
              {(["year", "month", "day", "hour"] as TimeUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setTimeUnit(unit)}
                  className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                    timeUnit === unit
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-800 hover:bg-neutral-50"
                  } ${unit !== "year" ? "border-l border-black/10" : ""}`}
                >
                  {unit}
                </button>
              ))}
            </div>
            <div className="rounded-md bg-neutral-200 p-2 text-xs text-neutral-700">
              Specify the time scale used by this dataset (e.g., survival
              durations recorded in months).
            </div>
          </section>

          {/* Visibility + Sharing grouped */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50/80 p-4">
            <h2 className="block uppercase text-sm font-semibold text-neutral-900">
              Visibility &amp; sharing
            </h2>

            {/* Visibility */}
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span className="text-xs font-medium text-neutral-800">
                  Make Dataset Public
                </span>
              </label>
              <div className="rounded-md bg-neutral-200 p-2 text-xs text-neutral-700">
                If enabled, other users can discover and view this dataset.
                Viewers can use datasets, but only the owner can modify or
                delete it.
              </div>
            </div>

            {/* Sharing */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-800">
                Share with other users
              </h3>
              {sharingError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {sharingError}
                </div>
              )}
              <div className="rounded-md border border-neutral-200 bg-white">
                <div className="grid grid-cols-2 border-b bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-800">
                  <div>Users</div>
                  <div>Permissions</div>
                </div>

                <div className="divide-y">
                  {shareRows.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-neutral-500">
                      No viewers have been added yet.
                    </div>
                  ) : (
                    shareRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-2 items-center gap-2 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-50 disabled:opacity-50"
                            title="Remove"
                            onClick={() => removeShareRow(row)}
                            disabled={saving || row.isProcessing}
                          >
                            ✕
                          </button>
                          {row.permissionId ? (
                            <div>
                              <div className="text-sm font-medium">
                                {row.username}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Existing viewer
                              </div>
                            </div>
                          ) : (
                            <UserSearchInput
                              value={row.username}
                              onValueChange={(val) =>
                                updateShareRow(row.id, {
                                  username: val,
                                  userId: undefined,
                                })
                              }
                              onSelect={(user) =>
                                handleUserSelect(row.id, user)
                              }
                              placeholder="Search username"
                              disabled={saving}
                            />
                          )}
                        </div>
                        <div className="text-sm text-neutral-700">Viewer</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between border-t bg-neutral-100 px-3 py-2">
                  <button
                    onClick={addShareRow}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium transition hover:bg-neutral-50 disabled:opacity-50"
                    disabled={saving}
                  >
                    + Add
                  </button>
                  <div className="text-[11px] text-neutral-600">
                    Viewers can use this dataset but cannot edit or delete it.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Connected Predictors */}
          <section className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Predictors using this dataset
            </h2>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              {datasetId ? (
                <LinkedPredictorsList datasetId={datasetId} />
              ) : (
                <p className="text-sm text-neutral-500">
                  Could not load predictors.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Leave prompt */}
      {showLeavePrompt && (
        <ConfirmLeave
          onCancel={() => setShowLeavePrompt(false)}
          onContinue={() =>
            navigate("/dashboard", { state: { tab: "datasets" } })
          }
        />
      )}
    </div>
  );
}

/** "are you sure?" modal */
function ConfirmLeave({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <h3 className="text-base font-semibold">Leave without saving?</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Your changes will not be saved if you return to the Dashboard.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
