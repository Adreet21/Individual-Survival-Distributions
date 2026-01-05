/**
 * Create New Predictor
 *
 * UX goals (mirrors Upload Dataset):
 * - Sticky grey header with Back / title / Save
 *   - "Back" warns if there are unsaved changes
 * - Name + Notes fields
 * - Dataset picker (owner or viewer datasets) with SearchBar
 *   - Scrollable embedded pane; clicking a dataset selects it
 * - Visibility: public / private toggle (matches datasets)
 * - Manage permissions table:
 *   - Add usernames and choose role (Owner / Viewer)
 *
 * Flow:
 * 1. Fill out form → Click "Train & Save"
 * 2. Trains ML model (async)
 * 3. Creates or updates predictor in database (draft / final)
 * 4. User can navigate to predictor detail page from TrainingModal
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import { FolderSelector } from "../components/folder";
import { listMyDatasets, getDatasetStats } from "../lib/datasets";
import { toDatasetItem } from "../lib/mappers";
import {
  createPredictor,
  listMyPredictors,
  getPredictor,
  updatePredictor,
  grantPredictorViewer,
  trainPredictorAsync,
} from "../lib/predictors";
import {
  UserSearchInput,
  type UserSuggestion,
} from "../components/UserSearchInput";
import { resolveUsernameToId } from "../lib/users";
import { AlertModal } from "../components/AlertModal";
import TrainingModal from "../components/TrainingModal";
import { AlertTriangle, AlertCircle, ChevronDown, X } from "lucide-react";

type PermRow = {
  id: number;
  username: string;
  role: "owner" | "viewer";
  userId?: number;
};

type TrainingStep = "idle" | "creating" | "training" | "complete" | "error";

export default function PredictorCreate() {
  const navigate = useNavigate();
  const { id: draftId } = useParams();
  const isDraftMode = Boolean(draftId);
  const location = useLocation();
  const cameFromUsePredictor = location.state?.from === "use-predictor";

  // form state
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
      isPublic?: boolean;
    }[]
  >([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    null
  );

  // permissions rows
  const [rows, setRows] = useState<PermRow[]>([
    { id: 1, username: "", role: "owner" },
  ]);

  // training state
  const [trainingStep, setTrainingStep] = useState<TrainingStep>("idle");
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [createdPredictorId, setCreatedPredictorId] = useState<number | undefined>(
    undefined
  );
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  // Advanced settings - Model Selection
  const [selectedModel, setSelectedModel] = useState<string>("MTLR");

  // General/Experiment Settings
  const [postProcess, setPostProcess] = useState<"CSD" | "CSD-iPOT">("CSD");
  const [nExp, setNExp] = useState<number>(10);
  const [seed, setSeed] = useState<number>(0);
  const [timeBins, setTimeBins] = useState<number | undefined>(undefined);

  // Conformalization Settings
  const [decensorMethod, setDecensorMethod] = useState<
    "uncensored" | "margin" | "PO" | "sampling"
  >("sampling");
  const [monoMethod, setMonoMethod] = useState<
    "ceil" | "floor" | "bootstrap"
  >("bootstrap");
  const [interpolate, setInterpolate] = useState<"Linear" | "Pchip">("Pchip");
  const [nQuantiles, setNQuantiles] = useState<number>(9);
  const [useTrain, setUseTrain] = useState<boolean>(true);
  const [nSample, setNSample] = useState<number>(1000);

  // Neural Network Architecture
  const [neurons, setNeurons] = useState<number[]>([64, 64]);
  const [norm, setNorm] = useState<boolean>(true);
  const [dropout, setDropout] = useState<number>(0.4);
  const [activation, setActivation] = useState<string>("ReLU");

  // Training Hyperparameters
  const [nEpochs, setNEpochs] = useState<number>(10000);
  const [earlyStop, setEarlyStop] = useState<boolean>(true);
  const [batchSize, setBatchSize] = useState<number>(256);
  const [lr, setLr] = useState<number>(0.001);
  const [weightDecay, setWeightDecay] = useState<number>(0.1);
  const [lam, setLam] = useState<number>(0);

  // Helper function to check if model uses neural network
  const isNeuralNetworkModel = () => {
    return [
      "MTLR",
      "CoxPH",
      "DeepHit",
      "CoxTime",
      "CQRNN",
      "LogNormalNN",
    ].includes(selectedModel);
  };

  // feature selection state
  const [availableFeatures, setAvailableFeatures] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(
    new Set()
  );
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);

  // meta state
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);

  // name availability
  const [checking, setChecking] = useState(false);
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);

  // alert modal
  const [alertState, setAlertState] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // detection for the leave prompt
  const dirtyRef = useRef(false);

  // Load draft if in draft mode
  useEffect(() => {
    if (!draftId) return;

    async function loadDraft() {
      try {
        const p = await getPredictor(Number(draftId));
        if (!p) return;

        setName(p.name);
        setNotes(p.description);
        setSelectedDatasetId(String(p.dataset_id));
        setSelectedFolderId(p.folder_id ? String(p.folder_id) : null);
        setIsPublic(!p.is_private);

        setRows(
          (p.permissions ?? []).map((perm: any) => ({
            id: perm.user.id,
            username: perm.user.username,
            role: perm.role,
            userId: perm.user.id,
          }))
        );
      } catch (e) {
        console.error("Failed to load draft predictor:", e);
      }
    }

    void loadDraft();
  }, [draftId]);

  // mark as dirty if any fields changed
  useEffect(() => {
    dirtyRef.current =
      !!name.trim() ||
      !!notes.trim() ||
      !!selectedDatasetId ||
      isPublic ||
      !!selectedFolderId ||
      rows.some((r) => r.username.trim());
  }, [name, notes, selectedDatasetId, isPublic, selectedFolderId, rows]);

  // name availability check
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
        const mine = await listMyPredictors();
        const exists = mine.some(
          (p: any) =>
            ((p.name ?? p.predictor_name ?? "") + "").toLowerCase() ===
            trimmed.toLowerCase()
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

  // load datasets
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = await listMyDatasets();
        if (cancelled) return;
        const ui = api.map((d) => {
          const m = toDatasetItem(d);
          return { id: m.id, title: m.title, notes: m.notes, owner: m.owner };
        });
        setDatasets(ui);
      } catch {
        if (!cancelled) setDatasets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch features when dataset is selected
  useEffect(() => {
    if (!selectedDatasetId) {
      setAvailableFeatures([]);
      setSelectedFeatures(new Set());
      setFeaturesError(null);
      return;
    }

    let cancelled = false;
    setFeaturesLoading(true);
    setFeaturesError(null);

    (async () => {
      try {
        const stats = await getDatasetStats(Number(selectedDatasetId));
        if (cancelled) return;

        // Extract feature names from feature_correlations
        const features =
          stats.feature_correlations?.map((fc: any) => fc.feature) ?? [];
        setAvailableFeatures(features);
        setSelectedFeatures(new Set(features)); // default: all selected
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load dataset features:", err);
        setFeaturesError(
          "Failed to load features. You can still proceed with training."
        );
        setAvailableFeatures([]);
        setSelectedFeatures(new Set());
      } finally {
        if (!cancelled) setFeaturesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasets.filter((d) =>
      q ? d.title.toLowerCase().includes(q) : true
    );
  }, [datasets, query]);

  const canSave =
    !!name.trim() &&
    !nameTaken &&
    !!selectedDatasetId &&
    trainingStep === "idle";

  const isProcessing = trainingStep !== "idle";

  // Train-and-save flow (supports draft + advanced settings)
  async function onTrainAndSave() {
    if (!canSave) return;

    setTrainingStep("creating");
    setTrainingError(null);

    try {
      const datasetId = Number(selectedDatasetId);

      // Step 1: Create predictor first (with "training" status)
      const created = await createPredictor({
        name: name.trim(),
        description: notes.trim(),
        dataset_id: Number(selectedDatasetId),
        folder_id: selectedFolderId || undefined,
        is_private: !isPublic,
        model_id: null,
        ml_trained_at: null,
        ml_training_status: "training",
        ml_model_metrics: {},
        ml_selected_features: null,
      } as any);

      setCreatedPredictorId(created.predictor_id);

      // Step 2: Grant permissions
      for (const row of rows) {
        const username = row.username.trim();
        if (!username) continue;
        let userId: number | undefined = row.userId;
        if (userId == null) {
          const resolvedId = await resolveUsernameToId(username); // number | null
          if (resolvedId == null) {
            continue;
          }
          userId = resolvedId; 
        }

        try {
          await grantPredictorViewer(created.predictor_id, userId, row.role);
        } catch (e) {
          console.error("Grant failed", e);
        }
      }


      // Step 3: Start async training
      setTrainingStep("training");
      await trainPredictorAsync(datasetId, created.predictor_id, {
        parameters: {
          // Model & Experiment
          model: selectedModel,
          post_process: postProcess,
          n_exp: nExp,
          seed,
          ...(["MTLR", "CoxPH", "CQRNN", "LogNormalNN"].includes(
            selectedModel
          ) &&
            typeof timeBins === "number" && { time_bins: timeBins }),

          // Conformalization
          error_f: "Quantile",
          decensor_method: decensorMethod,
          mono_method: monoMethod,
          interpolate,
          n_quantiles: nQuantiles,
          use_train: useTrain,
          n_sample: decensorMethod === "sampling" ? nSample : undefined,

          // Neural Network Architecture and Training Hyperparameters (only if applicable)
          ...(isNeuralNetworkModel() && {
            neurons,
            norm,
            dropout,
            activation,
            n_epochs: nEpochs,
            early_stop: earlyStop,
            batch_size: batchSize,
            lr,
            weight_decay: weightDecay,
          }),
          ...(selectedModel === "LogNormalNN" && { lam }),

          // Feature selection
          selected_features:
            selectedFeatures.size > 0
              ? Array.from(selectedFeatures)
              : undefined,
        },
      });

      // Step 4: Show training modal to track progress
      setShowTrainingModal(true);
    } catch (error: any) {
      setTrainingStep("error");
      setTrainingError(
        error?.message ||
          "Failed to create predictor and start training. Please try again."
      );
      console.error("Training error:", error);
    }
  }

  // Save as draft (no training)
  async function saveDraft() {
    // If this came from the leave prompt, close that first so the alert
    // appears on top and the user can only hit "OK".
    setShowLeavePrompt(false);

    const trimmedName = name.trim();

    if (!trimmedName) {
      setAlertState({
        title: "Name required",
        message:
          "Please add a name before saving this predictor as a draft. You can always rename it later.",
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
      const payload: any = {
        name: trimmedName,
        description: notes.trim(),
        dataset_id: Number(selectedDatasetId),
        folder_id: selectedFolderId || undefined,
        is_private: true,
        ml_training_status: "not_trained" as "not_trained",
        ml_trained_at: null,
        ml_model_metrics: {},
        ml_selected_features: null,
        model_id: null,
      };

      if (isDraftMode && draftId) {
        await updatePredictor(Number(draftId), payload);
      } else {
        await createPredictor(payload);
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

  function onBack() {
    if (trainingStep !== "idle") {
      // Don't allow navigation during training or creation
      return;
    }
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
            {isDraftMode ? "Edit Predictor Draft" : "Create New Predictor"}
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

      {/* Notification Banner - Only shown when redirected from use-predictor */}
      {cameFromUsePredictor && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-neutral-700" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-neutral-900">
                  No trained predictors available
                </h3>
                <p className="mt-1 text-sm text-neutral-700">
                  You must create and train a predictor before you can make
                  predictions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Page heading */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <header className="space-y-1">
              <p className="text-sm text-neutral-600">
                Name your predictor, choose a dataset, then configure who can
                see and use it.
              </p>
            </header>
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
              placeholder="Optional description (maps to backend 'description')."
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
              ownedOnly={true}
            />
            <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">
              Organize your predictor by adding it to a folder. You can create a
              new folder or select an existing one.
            </div>
          </section>

          {/* Dataset picker */}
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
              You must select one dataset to train/use this predictor.
            </div>
          </section>

          {/* Feature Selection (Collapsible) - only show when dataset is selected */}
          {selectedDatasetId && (
            <FeatureSelectionSection
              disabled={isProcessing}
              availableFeatures={availableFeatures}
              selectedFeatures={selectedFeatures}
              setSelectedFeatures={setSelectedFeatures}
              isLoading={featuresLoading}
              error={featuresError}
            />
          )}

          {/* Advanced Settings (Collapsible) */}
          <AdvancedSettingsSection
            disabled={isProcessing}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            postProcess={postProcess}
            setPostProcess={setPostProcess}
            nExp={nExp}
            setNExp={setNExp}
            seed={seed}
            setSeed={setSeed}
            timeBins={timeBins}
            setTimeBins={setTimeBins}
            decensorMethod={decensorMethod}
            setDecensorMethod={setDecensorMethod}
            monoMethod={monoMethod}
            setMonoMethod={setMonoMethod}
            interpolate={interpolate}
            setInterpolate={setInterpolate}
            nQuantiles={nQuantiles}
            setNQuantiles={setNQuantiles}
            useTrain={useTrain}
            setUseTrain={setUseTrain}
            nSample={nSample}
            setNSample={setNSample}
            neurons={neurons}
            setNeurons={setNeurons}
            norm={norm}
            setNorm={setNorm}
            dropout={dropout}
            setDropout={setDropout}
            activation={activation}
            setActivation={setActivation}
            nEpochs={nEpochs}
            setNEpochs={setNEpochs}
            earlyStop={earlyStop}
            setEarlyStop={setEarlyStop}
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            lr={lr}
            setLr={setLr}
            weightDecay={weightDecay}
            setWeightDecay={setWeightDecay}
            lam={lam}
            setLam={setLam}
            isNeuralNetworkModel={isNeuralNetworkModel}
          />

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
                By enabling this, all users will be able to discover and use
                this predictor. Disable to keep it private to you (and the users
                you share with).
              </div>
            </div>

            {/* Manage permissions */}
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
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50"
                          title="Remove"
                          onClick={() => removeRow(r.id)}
                          disabled={isProcessing}
                          aria-label="Remove user"
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
                          disabled={isProcessing}
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
                    Owners can edit &amp; retrain. Viewers can only use the
                    predictor.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Creating Predictor Modal */}
      {trainingStep === "creating" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
              <h3 className="text-lg font-semibold">Creating predictor…</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Setting up your predictor in the database.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Training Modal (async, shared component) */}
      {showTrainingModal && createdPredictorId !== undefined && (
        <TrainingModal
          predictorId={createdPredictorId}
          onClose={() => {
            setShowTrainingModal(false);
            navigate("/dashboard", { state: { tab: "predictors" } });
          }}
          autoNavigateOnComplete={false}
        />
      )}

      {/* Error Modal */}
      {trainingStep === "error" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-800">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Training failed
              </h3>
              <p className="mt-2 text-sm text-neutral-700">{trainingError}</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => {
                    setTrainingStep("idle");
                    setTrainingError(null);
                  }}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLeavePrompt && (
        <ConfirmLeave
          onCancel={() => setShowLeavePrompt(false)}
          onContinue={() =>
            navigate("/dashboard", { state: { tab: "predictors" } })
          }
          onSaveDraft={saveDraft}
        />
      )}

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

interface AdvancedSettingsProps {
  disabled: boolean;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  postProcess: "CSD" | "CSD-iPOT";
  setPostProcess: (v: "CSD" | "CSD-iPOT") => void;
  nExp: number;
  setNExp: (v: number) => void;
  seed: number;
  setSeed: (v: number) => void;
  timeBins: number | undefined;
  setTimeBins: (v: number | undefined) => void;
  decensorMethod: "uncensored" | "margin" | "PO" | "sampling";
  setDecensorMethod: (v: "uncensored" | "margin" | "PO" | "sampling") => void;
  monoMethod: "ceil" | "floor" | "bootstrap";
  setMonoMethod: (v: "ceil" | "floor" | "bootstrap") => void;
  interpolate: "Linear" | "Pchip";
  setInterpolate: (v: "Linear" | "Pchip") => void;
  nQuantiles: number;
  setNQuantiles: (v: number) => void;
  useTrain: boolean;
  setUseTrain: (v: boolean) => void;
  nSample: number;
  setNSample: (v: number) => void;
  neurons: number[];
  setNeurons: (v: number[]) => void;
  norm: boolean;
  setNorm: (v: boolean) => void;
  dropout: number;
  setDropout: (v: number) => void;
  activation: string;
  setActivation: (v: string) => void;
  nEpochs: number;
  setNEpochs: (v: number) => void;
  earlyStop: boolean;
  setEarlyStop: (v: boolean) => void;
  batchSize: number;
  setBatchSize: (v: number) => void;
  lr: number;
  setLr: (v: number) => void;
  weightDecay: number;
  setWeightDecay: (v: number) => void;
  lam: number;
  setLam: (v: number) => void;
  isNeuralNetworkModel: () => boolean;
}

function AdvancedSettingsSection(props: AdvancedSettingsProps) {
  const {
    disabled,
    selectedModel,
    setSelectedModel,
    postProcess,
    setPostProcess,
    nExp,
    setNExp,
    seed,
    setSeed,
    timeBins,
    setTimeBins,
    decensorMethod,
    setDecensorMethod,
    monoMethod,
    setMonoMethod,
    interpolate,
    setInterpolate,
    nQuantiles,
    setNQuantiles,
    useTrain,
    setUseTrain,
    nSample,
    setNSample,
    neurons,
    setNeurons,
    norm,
    setNorm,
    dropout,
    setDropout,
    activation,
    setActivation,
    nEpochs,
    setNEpochs,
    earlyStop,
    setEarlyStop,
    batchSize,
    setBatchSize,
    lr,
    setLr,
    weightDecay,
    setWeightDecay,
    lam,
    setLam,
    isNeuralNetworkModel,
  } = props;

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        disabled={disabled}
        className="flex w-full items-center justify-between text-left disabled:opacity-60"
      >
        <h2 className="block text-sm font-semibold uppercase text-neutral-900">
          Advanced Settings
        </h2>
        <ChevronDown
          className={`h-4 w-4 text-neutral-600 transition-transform ${
            showAdvanced ? "rotate-180" : ""
          }`}
        />
      </button>

      {showAdvanced && (
        <div className="space-y-6 pt-4">
          {/* Model Selection */}
          <div className="border-b border-neutral-300 pb-4">
            <label
              htmlFor="model_type"
              className="mb-2 block text-sm font-medium text-neutral-700"
            >
              Model Type
            </label>
            <select
              id="model_type"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={disabled}
              className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
            >
              <option value="MTLR">MTLR</option>
              <option value="DeepHit" disabled>
                DeepHit (Coming Soon)
              </option>
              <option value="CoxPH" disabled>
                CoxPH (Coming Soon)
              </option>
              <option value="AFT" disabled>
                AFT (Coming Soon)
              </option>
              <option value="GB" disabled>
                GB (Coming Soon)
              </option>
              <option value="CoxTime" disabled>
                CoxTime (Coming Soon)
              </option>
              <option value="CQRNN" disabled>
                CQRNN (Coming Soon)
              </option>
              <option value="LogNormalNN" disabled>
                LogNormalNN (Coming Soon)
              </option>
              <option value="KM" disabled>
                KM (Coming Soon)
              </option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Select the survival model to use
            </p>
          </div>

          {/* General Settings */}
          <div className="border-b border-neutral-300 pb-4">
            <h4 className="mb-3 text-sm font-semibold text-neutral-800">
              General Settings
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="post_process"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Post Process
                </label>
                <select
                  id="post_process"
                  value={postProcess}
                  onChange={(e) =>
                    setPostProcess(e.target.value as "CSD" | "CSD-iPOT")
                  }
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                >
                  <option value="CSD">CSD</option>
                  <option value="CSD-iPOT">CSD-iPOT</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Post-processing method for predictions
                </p>
              </div>
              <div>
                <label
                  htmlFor="n_exp"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Number of Experiments
                </label>
                <input
                  type="number"
                  id="n_exp"
                  value={nExp}
                  onChange={(e) => setNExp(Number(e.target.value))}
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Number of experimental runs
                </p>
              </div>
              <div>
                <label
                  htmlFor="seed"
                  className="block text sm font-medium text-neutral-700"
                >
                  Random Seed
                </label>
                <input
                  type="number"
                  id="seed"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Seed for reproducibility
                </p>
              </div>
              {["MTLR", "CoxPH", "CQRNN", "LogNormalNN"].includes(
                selectedModel
              ) && (
                <div>
                  <label
                    htmlFor="time_bins"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Time Bins
                  </label>
                  <input
                    type="number"
                    id="time_bins"
                    value={timeBins ?? ""}
                    onChange={(e) =>
                      setTimeBins(
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                    disabled={disabled}
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Number of time bins for survival analysis
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Conformalization Settings */}
          <div className="border-b border-neutral-300 pb-4">
            <h4 className="mb-3 text-sm font-semibold text-neutral-800">
              Conformalization Settings
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="error_f"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Error Function
                </label>
                <input
                  type="text"
                  id="error_f"
                  value="Quantile"
                  disabled
                  className="mt-1 block w-full rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Error function for conformal prediction
                </p>
              </div>
              <div>
                <label
                  htmlFor="decensor_method"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Decensor Method
                </label>
                <select
                  id="decensor_method"
                  value={decensorMethod}
                  onChange={(e) =>
                    setDecensorMethod(
                      e.target.value as
                        | "uncensored"
                        | "margin"
                        | "PO"
                        | "sampling"
                    )
                  }
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                >
                  <option value="uncensored">Uncensored</option>
                  <option value="margin">Margin</option>
                  <option value="PO">PO</option>
                  <option value="sampling">Sampling</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Method for handling censored data
                </p>
              </div>
              <div>
                <label
                  htmlFor="mono_method"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Monotonization Method
                </label>
                <select
                  id="mono_method"
                  value={monoMethod}
                  onChange={(e) =>
                    setMonoMethod(
                      e.target.value as "ceil" | "floor" | "bootstrap"
                    )
                  }
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                >
                  <option value="ceil">Ceil</option>
                  <option value="floor">Floor</option>
                  <option value="bootstrap">Bootstrap</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Method for ensuring monotonicity
                </p>
              </div>
              <div>
                <label
                  htmlFor="interpolate"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Interpolation
                </label>
                <select
                  id="interpolate"
                  value={interpolate}
                  onChange={(e) =>
                    setInterpolate(e.target.value as "Linear" | "Pchip")
                  }
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                >
                  <option value="Linear">Linear</option>
                  <option value="Pchip">Pchip</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Interpolation method for predictions
                </p>
              </div>
              <div>
                <label
                  htmlFor="n_quantiles"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Number of Quantiles
                </label>
                <input
                  type="number"
                  id="n_quantiles"
                  value={nQuantiles}
                  onChange={(e) => setNQuantiles(Number(e.target.value))}
                  disabled={disabled}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Common values: 4, 9, 19, 39, 49, 99
                </p>
              </div>
              {decensorMethod === "sampling" && (
                <div>
                  <label
                    htmlFor="n_sample"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Sample Size
                  </label>
                  <input
                    type="number"
                    id="n_sample"
                    value={nSample}
                    onChange={(e) => setNSample(Number(e.target.value))}
                    disabled={disabled}
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Number of samples when using sampling method
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={useTrain}
                    onChange={(e) => setUseTrain(e.target.checked)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                    id="use_train"
                  />
                  <label htmlFor="use_train" className="ml-2 text-sm">
                    Use Training Data
                  </label>
                </div>
                <p className="ml-6 mt-1 text-xs text-neutral-500">
                  Include training data in conformal prediction
                </p>
              </div>
            </div>
          </div>

          {/* Neural Network Architecture */}
          <div className="border-b border-neutral-300 pb-4">
            <h4 className="mb-3 text-sm font-semibold text-neutral-800">
              Neural Network Architecture
              {!isNeuralNetworkModel() && (
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  (Only for neural network models)
                </span>
              )}
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="neurons"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Hidden Layers (comma-separated)
                </label>
                <input
                  type="text"
                  id="neurons"
                  value={neurons.join(",")}
                  onChange={(e) => {
                    const values = e.target.value
                      .split(",")
                      .map((v) => parseInt(v.trim()))
                      .filter((n) => !isNaN(n));
                    setNeurons(values.length > 0 ? values : [64, 64]);
                  }}
                  disabled={disabled || !isNeuralNetworkModel()}
                  placeholder="e.g., 64,64"
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Layer sizes separated by commas
                </p>
              </div>
              <div>
                <label
                  htmlFor="activation"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Activation Function
                </label>
                <select
                  id="activation"
                  value={activation}
                  onChange={(e) => setActivation(e.target.value)}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                >
                  <option value="ReLU">ReLU</option>
                  <option value="LeakyReLU">LeakyReLU</option>
                  <option value="PReLU">PReLU</option>
                  <option value="Tanh">Tanh</option>
                  <option value="Sigmoid">Sigmoid</option>
                  <option value="ELU">ELU</option>
                  <option value="SELU">SELU</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Non-linearity between layers
                </p>
              </div>
              <div>
                <label
                  htmlFor="dropout"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Dropout Rate
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  id="dropout"
                  value={dropout}
                  onChange={(e) => setDropout(Number(e.target.value))}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Probability of dropping neurons (0-1)
                </p>
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={norm}
                    onChange={(e) => setNorm(e.target.checked)}
                    disabled={disabled || !isNeuralNetworkModel()}
                    className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                    id="norm"
                  />
                  <label htmlFor="norm" className="ml-2 text-sm">
                    Use Batch Normalization
                  </label>
                </div>
                <p className="ml-6 mt-1 text-xs text-neutral-500">
                  Normalize activations for stability
                </p>
              </div>
            </div>
          </div>

          {/* Training Hyperparameters */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-neutral-800">
              Training Hyperparameters
              {!isNeuralNetworkModel() && (
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  (Only for neural network models)
                </span>
              )}
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="n_epochs"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Number of Epochs
                </label>
                <input
                  type="number"
                  id="n_epochs"
                  value={nEpochs}
                  onChange={(e) => setNEpochs(Number(e.target.value))}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Maximum training iterations
                </p>
              </div>
              <div>
                <label
                  htmlFor="batch_size"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Batch Size
                </label>
                <input
                  type="number"
                  id="batch_size"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Samples per gradient update
                </p>
              </div>
              <div>
                <label
                  htmlFor="lr"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Learning Rate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  id="lr"
                  value={lr}
                  onChange={(e) => setLr(Number(e.target.value))}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Step size for gradient descent
                </p>
              </div>
              <div>
                <label
                  htmlFor="weight_decay"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Weight Decay
                </label>
                <input
                  type="number"
                  step="0.01"
                  id="weight_decay"
                  value={weightDecay}
                  onChange={(e) => setWeightDecay(Number(e.target.value))}
                  disabled={disabled || !isNeuralNetworkModel()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  L2 regularization strength
                </p>
              </div>
              {selectedModel === "LogNormalNN" && (
                <div>
                  <label
                    htmlFor="lam"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Lambda (λ)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="lam"
                    value={lam}
                    onChange={(e) => setLam(Number(e.target.value))}
                    disabled={disabled}
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Regularization weight for d-calibration
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={earlyStop}
                    onChange={(e) => setEarlyStop(e.target.checked)}
                    disabled={disabled || !isNeuralNetworkModel()}
                    className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                    id="early_stop"
                  />
                  <label htmlFor="early_stop" className="ml-2 text-sm">
                    Enable Early Stopping
                  </label>
                </div>
                <p className="ml-6 mt-1 text-xs text-neutral-500">
                  Stop training if validation performance plateaus
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface FeatureSelectionProps {
  disabled: boolean;
  availableFeatures: string[];
  selectedFeatures: Set<string>;
  setSelectedFeatures: (features: Set<string>) => void;
  isLoading: boolean;
  error: string | null;
}

function FeatureSelectionSection({
  disabled,
  availableFeatures,
  selectedFeatures,
  setSelectedFeatures,
  isLoading,
  error,
}: FeatureSelectionProps) {
  const [showFeatures, setShowFeatures] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  const filteredFeatures = useMemo(() => {
    if (!searchQuery) return availableFeatures;
    return availableFeatures.filter((f) =>
      f.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, availableFeatures]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredFeatures.length / pageSize)),
    [filteredFeatures.length, pageSize]
  );

  const currentFeatures = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFeatures.slice(start, start + pageSize);
  }, [filteredFeatures, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const handleToggleFeature = (feature: string) => {
    const newSelected = new Set(selectedFeatures);
    if (newSelected.has(feature)) newSelected.delete(feature);
    else newSelected.add(feature);
    setSelectedFeatures(newSelected);
  };

  const handleSelectAll = () => setSelectedFeatures(new Set(availableFeatures));
  const handleDeselectAll = () => setSelectedFeatures(new Set());

  return (
    <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
      <button
        type="button"
        onClick={() => setShowFeatures(!showFeatures)}
        disabled={disabled}
        className="flex w-full items-center justify-between text-left disabled:opacity-60"
      >
        <div>
          <h2 className="block text-sm font-semibold uppercase text-neutral-900">
            Feature Selection
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {selectedFeatures.size} / {availableFeatures.length} features
            selected
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-neutral-600 transition-transform ${
            showFeatures ? "rotate-180" : ""
          }`}
        />
      </button>

      {showFeatures && (
        <div className="pt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
              <span className="ml-2 text-sm text-neutral-500">
                Loading features…
              </span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" />
              <span>{error}</span>
            </div>
          ) : availableFeatures.length === 0 ? (
            <div className="rounded-md bg-neutral-100 p-3 text-center text-sm text-neutral-500">
              No features available for this dataset.
            </div>
          ) : (
            <div className="rounded-md border border-neutral-300 bg-white">
              {/* Search and actions bar */}
              <div className="flex items-center gap-2 border-b bg-neutral-50 p-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={disabled}
                  className="flex-1 rounded-md border border-neutral-300 p-2 text-sm disabled:bg-gray-100"
                  placeholder="Search for features..."
                />
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={disabled}
                  className="text-sm text-neutral-800 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={disabled}
                  className="text-sm text-neutral-800 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Deselect all
                </button>
              </div>

              {/* Feature list */}
              <div className="max-h-72 overflow-y-auto">
                {currentFeatures.map((feature) => (
                  <label
                    key={feature}
                    className="flex cursor-pointer items-center gap-3 border-t p-3 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeatures.has(feature)}
                      onChange={() => handleToggleFeature(feature)}
                      disabled={disabled}
                      className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                    />
                    <span className="font-mono text-sm">{feature}</span>
                  </label>
                ))}
                {currentFeatures.length === 0 && (
                  <p className="p-4 text-center text-sm text-neutral-500">
                    No features found.
                  </p>
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t bg-neutral-50 p-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>Entries per page:</span>
                  <select
                    className="rounded-md border border-neutral-300 p-1 text-sm disabled:bg-gray-100"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    disabled={disabled}
                  >
                    {[5, 10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  {page > 1 && (
                    <button
                      type="button"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={disabled}
                    >
                      Prev
                    </button>
                  )}
                  <span className="px-2 text-sm text-neutral-600">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages && (
                    <button
                      type="button"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={disabled}
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
