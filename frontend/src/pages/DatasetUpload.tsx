/**
 * Upload Dataset
 *
 * UX notes:
 * - Sticky grey header with Back / title / Save
 * - "Back" warns if there are unsaved changes
 * - Name field checks availability (client-side for now via listMyDatasets)
 * - Notes is UI-only (persist when backend adds a field)
 * - File format help is collapsible
 * - File upload is a simple input (drop / click); replace with real uploader later
 * - Time unit buttons (Year / Month / Day / Hour)
 * - Public/Private toggle with a help blurb
 * - Save - creates dataset object, then returns to Dashboard on the Datasets tab
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  createDataset,
  grantDatasetViewer,
  listMyDatasets,
  type CreateDatasetRequest,
} from "../lib/datasets";
import { FolderSelector } from "../components/folder";
import {
  UserSearchInput,
  type UserSuggestion,
} from "../components/UserSearchInput";
import { resolveUsernameToId } from "../lib/users";
import { AlertTriangle, CloudUpload, X } from "lucide-react";

type PermRow = {
  id: number; // local row id
  username: string; // text the user typed (later - lookup user id)
  role: "owner" | "viewer"; // UI role
  userId?: number;
};

type TimeUnit = "year" | "month" | "day" | "hour";

export default function DatasetUpload() {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromUsePredictor  =
    location.state?.from === "use-predictor";

  // form state
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showFormatHelp, setShowFormatHelp] = useState(true);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("month");
  const [isPublic, setIsPublic] = useState(false);
  const [allowAdminAccess, setAllowAdminAccess] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // permissions rows (UI-only for now)
  const [rows, setRows] = useState<PermRow[]>([
    { id: 1, username: "", role: "viewer" },
  ]);

  // meta state
  const [checking, setChecking] = useState(false);
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);

  // local detection to decide whether to warn
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current =
      !!name.trim() ||
      !!notes.trim() ||
      !!file ||
      isPublic ||
      timeUnit !== "month" ||
      !!selectedFolderId ||
      rows.some((r) => r.username.trim());
  }, [name, notes, file, isPublic, timeUnit, selectedFolderId, rows]);

  // check name availability (client-side)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const trimmed = name.trim();
      if (!trimmed) {
        setNameTaken(null);
        return;
      }
      setChecking(true);
      try {
        const mine = await listMyDatasets(); // API wrapper
        const exists = mine.some(
          (d) => d.dataset_name.toLowerCase() === trimmed.toLowerCase()
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
  }, [name]);

  // “valid” when the required bits are present
  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (nameTaken) return false;
    if (!file) return false;
    return true;
  }, [name, nameTaken, file]);

  // Save - create dataset object with file upload
  const onSave = async () => {
    if (!canSave || saving || !file) return;
    setSaving(true);
    try {
      const request: CreateDatasetRequest = {
        dataset_name: name.trim(),
        file: file,
        notes: notes.trim() || undefined,
        time_unit: timeUnit,
        is_public: isPublic,
        allow_admin_access: allowAdminAccess,
        folder_id: selectedFolderId || undefined,
      };

      const created = await createDataset(request);

      if (created.warnings && created.warnings.length > 0) {
        const warningMessage =
          "Dataset created, but with warnings:\n\n" +
          created.warnings.join("\n\n");
        alert(warningMessage);
      }

      const datasetId = created.dataset_id;
      const failedGrants: string[] = [];

      for (const row of rows) {
        const username = row.username.trim();
        if (!username) continue;
        if (row.role !== "viewer") continue; // datasets only support viewer grants post-creation

        let userId = row.userId;
        if (!userId) {
          const resolvedId = await resolveUsernameToId(username);
          userId = resolvedId ?? undefined;
        }
        if (!userId) {
          failedGrants.push(username);
          continue;
        }

        try {
          await grantDatasetViewer(datasetId, userId);
        } catch (grantErr) {
          console.error("Failed to grant dataset access:", grantErr);
          failedGrants.push(username);
        }
      }

      navigate("/dashboard", {
        state: {
          tab: "datasets",
          justCreatedId: created.dataset_id,
          folderAssigned: selectedFolderId ? true : false,
          folderName: selectedFolderId ? "folder" : undefined,
        },
      });

      if (failedGrants.length) {
        alert(
          `Dataset created, but sharing failed for: ${failedGrants.join(
            ", "
          )}. Please check the usernames and try again.`
        );
      }
    } catch (err: any) {
      let errorMessage = "Failed to save dataset. Please try again.";

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
    if (dirtyRef.current) {
      setShowLeavePrompt(true);
    } else {
      navigate("/dashboard", { state: { tab: "datasets" } });
    }
  };

  // manage-permissions table handlers
  function addRow() {
    setRows((r) => [
      ...r,
      { id: (r.at(-1)?.id ?? 0) + 1, username: "", role: "viewer" },
    ]);
  }
  function removeRow(id: number) {
    setRows((r) => r.filter((x) => x.id !== id));
  }
  function updateRow(id: number, patch: Partial<PermRow>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function handleUserSelect(id: number, user: UserSuggestion) {
    updateRow(id, { username: user.username, userId: user.id });
  }

  // simple drop handler (visual only)
  const onDrop: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  };

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header (match PredictorCreate) */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px]"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">
            Upload Dataset
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

      {/* Notification Banner - Only shown when redirected from use-predictor */}
      {cameFromUsePredictor  && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-neutral-700" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-neutral-900">
                  No datasets available
                </h3>
                <p className="mt-1 text-sm text-neutral-700">
                  You must upload a dataset before you can create predictors or
                  make predictions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body — single centered column (match PredictorCreate) */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Page heading */}
          <section className="space-y-2 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              Upload a CSV dataset, set its time unit, and configure how others
              can access it. You can’t change the file after upload.
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
            <div className="flex min-h-[1.25rem] items-start justify-between text-xs">
              <div>
                {name ? (
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
              placeholder="Optional description"
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

          {/* Folder Selection */}
          <section className="space-y-4 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
            <h2 className="block text-sm font-semibold uppercase text-neutral-900">
              Organization
            </h2>
            <FolderSelector
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
              disabled={saving}
              placeholder="Select a folder (optional)"
            />
            <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">
              Organize your dataset by adding it to a folder. You can create a
              new folder or select an existing one.
            </div>
          </section>

          {/* Delimited Dataset / File format + uploader */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
                Delimited Dataset
              </div>
              <button
                onClick={() => setShowFormatHelp((v) => !v)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium transition hover:bg-neutral-100"
              >
                {showFormatHelp ? "Hide format help" : "Show format help"}
              </button>
            </div>

            {showFormatHelp && (
              <div className="rounded-md border border-neutral-400 bg-neutral-200 p-3 text-xs text-neutral-800">
                <div className="font-medium">File format</div>
                <p className="mt-1 leading-relaxed">
                  Data files must be in comma-separated value (CSV) format. Each
                  line in the file describes one sample in your dataset. The
                  first column should be the survival time (or other variable to
                  predict). The second column should be a binary value
                  describing whether this data is censored (0=uncensored,
                  1=censored; u=uncensored, c=censored). The remaining columns
                  are the rest of the features for each sample. Columns can be
                  numeric or categorical.
                </p>
              </div>
            )}

            {/* Upload box */}
            <label
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="grid cursor-pointer place-items-center rounded-md border-2 border-dashed border-neutral-300 bg-white py-10 text-center transition hover:bg-neutral-50"
            >
              <input
                type="file"
                accept=".csv,.tsv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div>
                <CloudUpload className="mx-auto h-8 w-8 text-neutral-500" />
                <div className="mt-2 text-sm text-neutral-900">
                  {file ? (
                    <strong>{file.name}</strong>
                  ) : (
                    "Click to choose a file or drag it here"
                  )}
                </div>
                <div className="text-xs text-neutral-500">CSV recommended</div>
              </div>
            </label>
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

          {/* Visibility + Admin + Permissions grouped */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50/80 p-4">
            <h2 className="block text-sm font-semibold uppercase text-neutral-900">
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
              <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-200 p-2 text-xs text-neutral-700">
                If enabled, other users can discover and view this dataset.
                Viewers can use datasets, but only the owner can modify or
                delete them.
              </div>
            </div>

            {/* Admin Access */}
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={allowAdminAccess}
                  onChange={(e) => setAllowAdminAccess(e.target.checked)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <span className="text-xs font-medium text-neutral-800">
                  Allow administrators to access this dataset
                </span>
              </label>
              <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-200 p-2 text-xs text-neutral-700">
                If enabled, system administrators can view and manage this
                dataset for moderation. If disabled, all users will be blocked
                from downloading the dataset.
              </div>
            </div>

            {/* Manage permissions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-700">
                Customize visibility and permissions
              </h3>
              <div className="rounded-md border border-neutral-200 bg-white">
                <div className="grid grid-cols-2 border-b bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-800">
                  <div>Users</div>
                  <div>Permissions</div>
                </div>

                {/* rows */}
                <div className="divide-y">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-2 items-center gap-2 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
                          title="Remove"
                          aria-label="Remove user"
                          onClick={() => removeRow(r.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <UserSearchInput
                          value={r.username}
                          onValueChange={(val) =>
                            updateRow(r.id, {
                              username: val,
                              userId: undefined,
                            })
                          }
                          onSelect={(user) => handleUserSelect(r.id, user)}
                          placeholder="Search username"
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <select
                          value={r.role}
                          onChange={(e) =>
                            updateRow(r.id, {
                              role: e.target.value as PermRow["role"],
                            })
                          }
                          className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                        >
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {/* add row */}
                <div className="flex items-center justify-between border-t bg-neutral-100 px-3 py-2">
                  <button
                    onClick={addRow}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium transition hover:bg-neutral-50"
                  >
                    + Add
                  </button>
                  <div className="text-[11px] text-neutral-600">
                    Viewers can use the dataset for predictor training.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Leave prompt */}
          {showLeavePrompt && (
            <ConfirmLeave
              onCancel={() => setShowLeavePrompt(false)}
              onContinue={() =>
                navigate("/dashboard", { state: { tab: "datasets" } })
              }
            />
          )}

          {saving && <SavingOverlay />}
        </div>
      </div>
    </div>
  );
}

/** "are you sure?" modal — match PredictorCreate modal style */
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
          Your data will not be saved if you return to the Dashboard.
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

function SavingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
          <h3 className="text-lg font-semibold">Uploading dataset…</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Larger files can take a minute. Please stay on this page until it&apos;s
            done.
          </p>
        </div>
      </div>
    </div>
  );
}

