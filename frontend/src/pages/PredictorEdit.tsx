/**
 * Edit Predictor
 *
 * UX notes:
 * - Similar to DatasetEdit but for editing existing predictors
 * - Pre-populate all fields with current values
 * - Name field checks availability (excluding current predictor)
 * - Rich text editor for notes/description
 * - Time unit selector
 * - Public visibility toggles
 * - Save updates the predictor metadata
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  listMyPredictors,
  getPredictor,
  updatePredictor,
  listPredictorPermissions,
  grantPredictorViewer,
  revokePredictorPermission,
  type Predictor,
  type PredictorPermission,
} from "../lib/predictors";
import {
  UserSearchInput,
  type UserSuggestion,
} from "../components/UserSearchInput";
import { resolveUsernameToId } from "../lib/users";

type TimeUnit = "year" | "month" | "day" | "hour";

type ShareRow = {
  id: number;
  username: string;
  role: "owner" | "viewer";
  userId?: number;
  permissionId?: number;
  isProcessing?: boolean;
};

export default function PredictorEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const predictorId = id ? parseInt(id) : null;

  // form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("day");
  const [isPrivate, setIsPrivate] = useState(false);

  // predictor info
  const [predictor, setPredictor] = useState<Predictor | null>(null);
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
    if (!predictor) {
      setIsDirty(false);
      return;
    }
    const hasChanges =
      name.trim() !== predictor.name ||
      description.trim() !== (predictor.description || "") ||
      timeUnit !== predictor.time_unit ||
      isPrivate !== predictor.is_private;
    setIsDirty(hasChanges);
  }, [name, description, timeUnit, isPrivate, predictor]);

  // Load predictor data
  useEffect(() => {
    if (!predictorId) {
      setError("Invalid predictor ID");
      setLoading(false);
      return;
    }

    async function loadPredictor() {
      try {
        const data = await getPredictor(predictorId!);
        setPredictor(data);
        setName(data.name);
        setOriginalName(data.name);
        setDescription(data.description || "");
        setTimeUnit(data.time_unit || "day");
        setIsPrivate(data.is_private || false);
      } catch (err: any) {
        if (err?.status === 404) {
          setError("Predictor not found");
        } else if (err?.status === 403) {
          setError("You don't have permission to edit this predictor");
        } else {
          setError("Failed to load predictor");
        }
      } finally {
        setLoading(false);
      }
    }

    loadPredictor();
  }, [predictorId]);

  // load permissions
  useEffect(() => {
    if (!predictorId) {
      setShareRows([{ id: 1, username: "", role: "viewer" }]);
      return;
    }

    (async () => {
      try {
        const permissions: PredictorPermission[] =
          await listPredictorPermissions(predictorId);
        const mapped: ShareRow[] = permissions.map((perm, idx) => ({
          id: idx + 1,
          username: perm.user.username,
          role: perm.role,
          userId: perm.user.id,
          permissionId: perm.id,
        }));
        if (mapped.length === 0) {
          mapped.push({ id: 1, username: "", role: "viewer" });
        }
        setShareRows(mapped);
        setSharingError(null);
      } catch (err) {
        console.error("Failed to load predictor permissions", err);
        setSharingError("Failed to load sharing settings.");
        setShareRows([{ id: 1, username: "", role: "viewer" }]);
      }
    })();
  }, [predictorId]);

  // check name availability (client-side, excluding current predictor)
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
        const predictors = await listMyPredictors();
        // Check if name exists (excluding current predictor)
        const exists = predictors.some(
          (p) =>
            p.name.toLowerCase() === trimmed.toLowerCase() &&
            p.predictor_id !== predictorId
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
  }, [name, originalName, predictorId]);

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

  // Save - update predictor
  const onSave = async () => {
    if (!canSave || saving || !predictorId) return;
    setSaving(true);
    try {
      const predictorHasChanges = isDirty;
      const pendingShares = pendingShareRows;

      if (predictorHasChanges) {
        const updateData = {
          name: name.trim(),
          description: description.trim() || undefined,
          time_unit: timeUnit,
          is_private: isPrivate,
        };
        await updatePredictor(predictorId, updateData);
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

          let userId: number | null | undefined = row.userId ?? undefined;
          if (!userId) {
            userId = await resolveUsernameToId(username);
          }
          if (!userId) {
            failedShares.push(username);
            continue;
          }
          if (existingUserIds.has(userId) || processedUserIds.has(userId)) {
            continue;
          }

          try {
            await grantPredictorViewer(predictorId, userId, row.role);
            processedUserIds.add(userId);
          } catch (grantErr) {
            console.error("Failed to grant predictor access", grantErr);
            failedShares.push(username);
          }
        }
      }

      if (failedShares.length) {
        alert(
          `Predictor updated, but sharing failed for: ${failedShares.join(
            ", "
          )}. Please check the usernames and try again.`
        );
      }

      navigate("/dashboard", { state: { tab: "predictors" } });
    } catch (err: any) {
      let errorMessage = "Failed to update predictor. Please try again.";

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
      navigate("/dashboard", { state: { tab: "predictors" } });
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

  function handleRoleChange(id: number, role: "owner" | "viewer") {
    updateShareRow(id, { role });
  }

  async function removeShareRow(row: ShareRow) {
    if (row.permissionId) {
      updateShareRow(row.id, { isProcessing: true });
      try {
        await revokePredictorPermission(row.permissionId);
        removeShareRowFromState(row.id);
        setSharingError(null);
      } catch (err) {
        console.error("Failed to revoke predictor access", err);
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
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-700 mx-auto" />
          <div className="mt-2 text-sm text-gray-600">Loading predictor...</div>
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
              navigate("/dashboard", { state: { tab: "predictors" } })
            }
            className="mt-4 inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 active:translate-y-[0.5px]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky header (matches PredictorCreate) */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">
            Editing Predictor {predictor?.name ? `"${predictor.name}"` : ""}
          </div>
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
              Update your predictor’s name, notes, and sharing
              settings. Changes will apply to all future uses of this predictor.
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
                if (e.target.value.length <= 100) {
                  setName(e.target.value);
                }
              }}
              maxLength={100}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              placeholder="Enter predictor name"
            />
            <div className="flex justify-between items-start min-h-[1.25rem] text-xs">
              <div>
                {name && name.trim() !== originalName ? (
                  checking ? (
                    <span className="text-gray-500">Checking availability…</span>
                  ) : nameTaken === true ? (
                    <span className="text-red-600">
                      This name is already taken.
                    </span>
                  ) : nameTaken === false ? (
                    <span className="text-green-600">
                      Name is available. Proceed!
                    </span>
                  ) : null
                ) : (
                  <span className="text-gray-500">
                    This maps to <code>name</code>.
                  </span>
                )}
              </div>
              <span
                className={`text-xs ${
                  name.length > 80
                    ? "text-orange-600"
                    : name.length > 90
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {name.length}/100
              </span>
            </div>
          </section>

          {/* Notes / Description */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Notes{" "}
              <span className="font-normal normal-case text-gray-500">
                (optional)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setDescription(e.target.value);
                }
              }}
              maxLength={500}
              rows={6}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              placeholder="Add notes about this predictor..."
            />
            <div className="flex justify-end">
              <span
                className={`text-xs ${
                  description.length > 400
                    ? "text-orange-600"
                    : description.length > 450
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {description.length}/500
              </span>
            </div>
          </section>

          {/* 
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Time Unit
            </label>
            <div className="inline-flex overflow-hidden rounded-md border border-black/10 bg-white">
              {(["year", "month", "day", "hour"] as TimeUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setTimeUnit(unit)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    timeUnit === unit
                      ? "bg-black text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  } ${unit !== "year" ? "border-l border-black/10" : ""}`}
                >
                  {unit}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-600">
              Specify the time scale used by this predictor (e.g., survival
              durations recorded in months).
            </div>
          </section> */}

          {/* Visibility + Sharing grouped */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50/80 p-4">
            <h2 className="block uppercase text-sm font-semibold text-neutral-900">
              Visibility &amp; sharing
            </h2>

            {/* Public Visibility */}
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!isPrivate}
                  onChange={(e) => setIsPrivate(!e.target.checked)}
                  className="h-4 w-4 accent-black"
                />
                <span className="text-xs font-medium text-neutral-800">
                  Make Predictor Public
                </span>
              </label>
              <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-200 p-2 text-xs text-neutral-700">
                By checking this, you allow all users to use this predictor.
                Training results (including access to the dataset used) may also
                be visible. Leave unchecked to keep it private to you and
                collaborators.
              </div>
            </div>

            {/* Sharing */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-700">
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
                    <div className="px-3 py-2 text-xs text-gray-500">
                      No additional collaborators yet.
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
                              <div className="text-xs text-gray-500 capitalize">
                                Existing {row.role}
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
                        <div>
                          {row.permissionId ? (
                            <span className="text-sm text-gray-700 capitalize">
                              {row.role}
                            </span>
                          ) : (
                            <select
                              value={row.role}
                              onChange={(e) =>
                                handleRoleChange(
                                  row.id,
                                  e.target.value as "owner" | "viewer"
                                )
                              }
                              className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm capitalize disabled:bg-gray-100"
                              disabled={saving}
                            >
                              <option value="owner">Owner</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          )}
                        </div>
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
                    Owners can edit &amp; retrain. Viewers can run predictions
                    only.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Leave prompt */}
      {showLeavePrompt && (
        <ConfirmLeave
          onCancel={() => setShowLeavePrompt(false)}
          onContinue={() =>
            navigate("/dashboard", { state: { tab: "predictors" } })
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
      <div className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg">
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
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
