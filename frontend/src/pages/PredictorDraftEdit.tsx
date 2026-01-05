import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import { FolderSelector } from "../components/folder";
import { listMyDatasets } from "../lib/datasets";
import { toDatasetItem } from "../lib/mappers";
import {
  getPredictor,
  updatePredictor,
  grantPredictorViewer,
  trainPredictor,
  listMyPredictors,
} from "../lib/predictors";
import type { Predictor } from "../lib/predictors";
import {
  UserSearchInput,
  type UserSuggestion,
} from "../components/UserSearchInput";
import { resolveUsernameToId } from "../lib/users";
import AuthLoadingScreen from "../auth/AuthLoadingScreen";
import { AlertModal } from "../components/AlertModal";

type PermRow = {
  id: number;
  username: string;
  role: "owner" | "viewer";
  userId?: number;
};

type TrainingStep = "idle" | "creating" | "training" | "complete" | "error";

export default function PredictorDraftEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const draftId = Number(id);

  // core state
  const [loading, setLoading] = useState(true);
  const [predictor, setPredictor] = useState<Predictor | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // dataset selection
  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<
    {
      id: string;
      title: string;
      notes?: string;
      owner: boolean;
    }[]
  >([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    null
  );

  // permissions
  const [rows, setRows] = useState<PermRow[]>([]);

  // training modal
  const [trainingStep, setTrainingStep] = useState<TrainingStep>("idle");
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [createdPredictorId, setCreatedPredictorId] = useState<number | null>(
    null
  );

  // leave-prompt
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const dirtyRef = useRef(false);

  // name availability
  const [checking, setChecking] = useState(false);
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);

  // alerts
  const [alertState, setAlertState] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // ---------------------------------------------
  // Load the Draft Predictor
  // ---------------------------------------------
  useEffect(() => {
    async function load() {
      const p = await getPredictor(draftId);
      if (!p) return;

      setPredictor(p);

      setName(p.name);
      setNotes(p.description);
      setIsPublic(!p.is_private);
      setSelectedDatasetId(p.dataset_id ? String(p.dataset_id) : null);
      setSelectedFolderId(p.folder_id ? String(p.folder_id) : null);

      const perms = Array.isArray(p.permissions) ? p.permissions : [];
      setRows(
        perms.map((perm) => ({
          id: perm.user.id,
          username: perm.user.username,
          role: perm.role,
          userId: perm.user.id,
        }))
      );

      setLoading(false);
    }
    void load();
  }, [draftId]);

  // ---------------------------------------------
  // Load datasets
  // ---------------------------------------------
  useEffect(() => {
    (async () => {
      const api = await listMyDatasets();
      const ui = api.map((d) => {
        const m = toDatasetItem(d);
        return {
          id: String(m.id),
          title: m.title,
          notes: m.notes,
          owner: m.owner,
        };
      });
      setDatasets(ui);
    })();
  }, []);

  useEffect(() => {
    if (predictor?.dataset_id) {
      setSelectedDatasetId(String(predictor.dataset_id));
    }
  }, [datasets, predictor]);

  useEffect(() => {
    dirtyRef.current =
      !!name.trim() ||
      !!notes.trim() ||
      !!selectedDatasetId ||
      !!selectedFolderId ||
      rows.some((r) => r.username.trim());
  }, [name, notes, selectedDatasetId, selectedFolderId, rows]);

  // ---------------------------------------------
  // Name Availability Check (similar to PredictorCreate)
  // ---------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkName() {
      const trimmed = name.trim();
      if (!trimmed) {
        setNameTaken(null);
        return;
      }

      setChecking(true);
      try {
        const mine = await listMyPredictors();
        const exists = mine.some(
          (p: any) =>
            ((p.name ?? p.predictor_name ?? "") + "").toLowerCase() ===
              trimmed.toLowerCase() && p.predictor_id !== draftId // allow own draft
        );
        if (!cancelled) setNameTaken(exists);
      } catch {
        if (!cancelled) setNameTaken(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    const t = setTimeout(checkName, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, draftId]);

  // dataset filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasets.filter((d) =>
      q ? d.title.toLowerCase().includes(q) : true
    );
  }, [datasets, query]);

  // allow save?
  const canSave =
    !!name.trim() && !nameTaken && !!selectedDatasetId && trainingStep === "idle";

  const isProcessing = trainingStep !== "idle";

  // ---------------------------------------------
  // Save as Draft
  // ---------------------------------------------
  async function saveDraft() {
    // Any time the user clicks "Save as Draft" from the leave modal,
    // hide that modal first so the alert becomes the only thing visible.
    setShowLeavePrompt(false);

    const trimmedName = name.trim();

    if (!trimmedName) {
      setAlertState({
        title: "Name required",
        message:
          "Please add a name before saving this predictor draft. You can always rename it later.",
      });
      return;
    }

    if (!selectedDatasetId) {
      setAlertState({
        title: "Dataset required",
        message:
          "Please select a dataset before saving this predictor draft. The model needs data to train on.",
      });
      return;
    }

    try {
      const draft = await updatePredictor(draftId, {
        name: trimmedName,
        description: notes.trim(),
        dataset_id: Number(selectedDatasetId),
        folder_id: selectedFolderId || undefined,
        is_private: true,
        ml_training_status: "not_trained",
        ml_trained_at: null,
        ml_model_metrics: {},
        ml_selected_features: null,
        model_id: null,
      });

for (const row of rows) {
  const username = row.username.trim();
  if (!username) continue;

  let userId: number | undefined = row.userId;

  if (userId == null) {
    const resolvedId = await resolveUsernameToId(username); 
    if (resolvedId == null) {
      continue;
    }
    userId = resolvedId;
  }
  try {
    await grantPredictorViewer(draft.predictor_id, userId, row.role);
  } catch (e) {
    console.error("Grant failed", e);
  }
}


      navigate("/dashboard", { state: { tab: "predictors" } });
    } catch (e) {
      setAlertState({
        title: "Unable to save draft",
        message:
          "Something went wrong while saving this predictor draft. Please try again in a moment.",
      });
    }
  }

  // ---------------------------------------------
  // Train & Save (similar to create flow)
  // ---------------------------------------------
  async function onTrainAndSave() {
    if (!canSave) return;

    setTrainingStep("training");
    setTrainingError(null);

    try {
      const datasetId = Number(selectedDatasetId);

      // Step 1 — train model
      const trainingResult = await trainPredictor(datasetId, {
        parameters: {
          n_epochs: 100,
          dropout: 0.2,
          neurons: [64, 64],
          n_exp: 10,
        },
      });

      if (!trainingResult || !trainingResult.model_id) {
        throw new Error("Training did not return a valid model_id");
      }

      setTrainingStep("creating");

      // Step 2 — update the draft into a fully trained predictor
      const finalPredictor = await updatePredictor(draftId, {
        name: name.trim(),
        description: notes.trim(),
        dataset_id: datasetId,
        folder_id: selectedFolderId || undefined,
        is_private: !isPublic,
        ml_training_status: "trained",
        ml_model_metrics: trainingResult.metrics || {},
        ml_selected_features: trainingResult.selected_features,
        model_id: trainingResult.model_id,
        ml_trained_at: trainingResult.trained_at,
      });

      setCreatedPredictorId(finalPredictor.predictor_id);

      // Step 3 — permissions
      for (const row of rows) {
        const username = row.username.trim();
        if (!username) continue;

        let userId: number | undefined = row.userId;

        if (userId == null) {
          const resolvedId = await resolveUsernameToId(username); 
          if (resolvedId == null) {
            continue;
          }
          userId = resolvedId; 
        }
        try {
          await grantPredictorViewer(
            finalPredictor.predictor_id,
            userId,
            row.role
          );
        } catch {
          // swallow
        }
      }


      // Step 4 — success
      setTrainingStep("complete");

      setTimeout(() => {
        navigate(`/predictors/${finalPredictor.predictor_id}`);
      }, 2000);
    } catch (err: any) {
      setTrainingStep("error");
      setTrainingError(err.message || "Failed to train predictor");
    }
  }

  function onBack() {
    if (isProcessing) return;
    if (dirtyRef.current) setShowLeavePrompt(true);
    else navigate("/dashboard", { state: { tab: "predictors" } });
  }

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

  // 🔄 use the shared fancy loading screen here
  if (loading) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            disabled={isProcessing}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">
            Edit Predictor Draft
          </div>
          <button
            onClick={onTrainAndSave}
            disabled={!canSave}
            className="inline-flex items-center rounded-md border border-black/10 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {trainingStep === "creating"
              ? "Creating…"
              : trainingStep === "training"
              ? "Training…"
              : "Train & Save"}
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
              You&apos;re editing a predictor draft. Choose a dataset, organize
              it into a folder, adjust visibility and permissions, then train
              and publish your predictor.
            </p>
          </section>

          {/* Name */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isProcessing}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
              placeholder="A concise predictor name"
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
                    This maps to <code>name</code>.
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isProcessing}
              rows={4}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
              placeholder="Optional description of this predictor draft."
            />
          </section>

          {/* Folder Selection */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <h2 className="block text-sm font-semibold uppercase text-neutral-900">
              Organization
            </h2>
            <FolderSelector
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
              disabled={isProcessing}
              placeholder="Select a folder (optional)"
            />
            <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">
              Organize this predictor draft by adding it to a folder. You can
              always move it later.
            </div>
          </section>

          {/* Dataset Picker */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="block pl-1 text-sm font-semibold uppercase text-neutral-900">
                Choose a dataset
              </label>
              <div className="w-64">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="Search datasets…"
                  onClear={() => setQuery("")}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-auto rounded-md border border-black/10 bg-white">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-neutral-500">
                  No datasets match your search.
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((ds) => {
                    const selected = selectedDatasetId === ds.id;
                    return (
                      <li key={ds.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedDatasetId(ds.id)}
                          disabled={isProcessing}
                          className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-neutral-200 disabled:cursor-not-allowed ${
                            selected ? "bg-neutral-200" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{ds.title}</div>
                            <div className="text-[11px] text-neutral-600">
                              {ds.owner ? "Owner" : "Viewer"}
                            </div>
                          </div>
                          {ds.notes && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-neutral-600">
                              {ds.notes}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="text-xs text-neutral-500">
              You must select one dataset to train and finalize this predictor.
            </div>
          </section>

          {/* Visibility + Permissions grouped */}
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
                  disabled={isProcessing}
                  className="h-4 w-4 accent-neutral-900 disabled:opacity-50"
                />
                <span className="text-xs font-medium text-neutral-800">
                  Make Predictor Public
                </span>
              </label>
              <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-200 p-2 text-xs text-neutral-700">
                If enabled, the finalized predictor will be discoverable and
                usable by other users. Leave off to keep it private to you and
                any collaborators you add below.
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-600">
                Customize visibility and permissions
              </h3>
              <div className="rounded-md border border-neutral-200 bg-white">
                <div className="grid grid-cols-2 border-b bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-800">
                  <div>Users</div>
                  <div>Permissions</div>
                </div>

                <div className="divide-y">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-2 items-center gap-2 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-50 disabled:opacity-50"
                          onClick={() => removeRow(r.id)}
                          disabled={isProcessing}
                          title="Remove"
                        >
                          ✕
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
                          disabled={isProcessing}
                          placeholder="Search username"
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
                          disabled={isProcessing}
                          className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:bg-gray-100"
                        >
                          <option value="owner">Owner</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t bg-neutral-100 px-3 py-2">
                  <button
                    onClick={addRow}
                    disabled={isProcessing}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    + Add
                  </button>
                  <div className="text-[11px] text-neutral-600">
                    Owners can edit &amp; retrain. Viewers can use the predictor
                    only.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Training Modal */}
      {isProcessing && (
        <TrainingModal
          step={trainingStep}
          error={trainingError}
          onRetry={() => {
            setTrainingStep("idle");
            setTrainingError(null);
          }}
          onViewPredictor={() => {
            if (createdPredictorId) {
              navigate(`/predictors/${createdPredictorId}`);
            }
          }}
        />
      )}

      {/* Leave Prompt */}
      {showLeavePrompt && (
        <ConfirmLeave
          onCancel={() => setShowLeavePrompt(false)}
          onContinue={() =>
            navigate("/dashboard", { state: { tab: "predictors" } })
          }
          onSaveDraft={saveDraft}
        />
      )}

      {/* Alert Modal */}
      {alertState && (
        <AlertModal
          open={!!alertState}
          title={alertState.title}
          message={alertState.message}
          onClose={() => setAlertState(null)}
        />
      )}
    </div>
  );
}

/* ----------------
   Training Modal 
------------------- */
function TrainingModal({
  step,
  error,
  onRetry,
  onViewPredictor,
}: {
  step: TrainingStep;
  error: string | null;
  onRetry: () => void;
  onViewPredictor: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {step === "creating" && (
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
            <h3 className="text-lg font-semibold">Creating Predictor...</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Saving your trained model and metadata.
            </p>
          </div>
        )}

        {step === "training" && (
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <h3 className="text-lg font-semibold">Training ML Model...</h3>
            <p className="mt-2 text-sm text-neutral-600">
              This may take several minutes depending on dataset size. Please
              don&apos;t close this page.
            </p>
            <div className="mt-4 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
              🛠 Training in progress... The model is learning from your
              dataset.
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
              ✓
            </div>
            <h3 className="text-lg font-semibold">Training Complete!</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Your predictor draft has been trained and finalized.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Redirecting to predictor details...
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">
              ✕
            </div>
            <h3 className="text-lg font-semibold">Training Failed</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-red-600">
              {error}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={onRetry}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:translate-y-[0.5px]"
              >
                Try Again
              </button>
              <button
                onClick={onViewPredictor}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:translate-y-[0.5px]"
              >
                View Predictor (if created)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------
   Leave Prompt 
----------------- */
function ConfirmLeave({
  onCancel,
  onContinue,
  onSaveDraft,
}: {
  onCancel: () => void;
  onContinue: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg">
        <h3 className="text-base font-semibold">Leave without saving?</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Your changes will be lost if you return to the Dashboard.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={onSaveDraft}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
          >
            Save as Draft
          </button>
          <button
            onClick={onContinue}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
