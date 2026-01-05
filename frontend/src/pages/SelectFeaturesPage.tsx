/**
 * Select Features Page for Retraining Predictor
 *
 * Allows users to select features and configure settings for creating a new
 * predictor based on an existing one with custom feature selection.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPredictor, trainPredictor, createPredictor } from "../lib/predictors";
import { getDatasetStats } from "../lib/datasets";
import { ChevronDown, AlertTriangle } from "lucide-react";

interface PredictorData {
  predictor_id: number;
  name: string;
  dataset: {
    dataset_id: number;
    dataset_name: string;
  };
  regularization: "l1" | "l2";
  objective_function: "log-likelihood" | "l2 marginal loss" | "log-likelihood & L2ML";
  marginal_loss_type: "weighted" | "unweighted";
  c_param_search_scope: "basic" | "fine" | "extremely fine";
  cox_feature_selection: boolean;
  mrmr_feature_selection: boolean;
  mtlr_predictor: "stable" | "testing1";
  tune_parameters: boolean;
  use_smoothed_log_likelihood: boolean;
  use_predefined_folds: boolean;
  num_time_points: number | null;
  run_cross_validation: boolean;
  standardize_features: boolean;
  features: string[];
}

type TrainingStep = "idle" | "training" | "creating" | "complete" | "error";

export default function SelectFeaturesPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // Loading / error for whole page
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Predictor data
  const [predictor, setPredictor] = useState<PredictorData | null>(null);

  // Feature selection
  const [availableFeatures, setAvailableFeatures] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);

  // Advanced settings - Model Selection
  const [selectedModel, setSelectedModel] = useState<string>("MTLR");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // General/Experiment Settings
  const [postProcess, setPostProcess] = useState<"CSD" | "CSD-iPOT">("CSD");
  const [nExp, setNExp] = useState<number>(10);
  const [seed, setSeed] = useState<number>(0);
  const [timeBins, setTimeBins] = useState<number | null>(null);

  // Conformalization Settings
  const [decensorMethod, setDecensorMethod] = useState<
    "uncensored" | "margin" | "PO" | "sampling"
  >("sampling");
  const [monoMethod, setMonoMethod] = useState<"ceil" | "floor" | "bootstrap">(
    "bootstrap"
  );
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

  // New predictor fields
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  // Helper function to check if model uses neural network
  const isNeuralNetworkModel = () => {
    return ["MTLR", "CoxPH", "DeepHit", "CoxTime", "CQRNN", "LogNormalNN"].includes(
      selectedModel
    );
  };

  // Training state
  const [trainingStep, setTrainingStep] = useState<TrainingStep>("idle");
  const [trainingError, setTrainingError] = useState<string | null>(null);

  // Load predictor and features on mount
  useEffect(() => {
    async function loadData() {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        setFeaturesLoading(true);
        setFeaturesError(null);

        const predictorData = (await getPredictor(Number(id))) as any;
        setPredictor(predictorData);

        // Load dataset features
        const stats = await getDatasetStats(predictorData.dataset.dataset_id);
        const features = stats.feature_correlations?.map((fc: any) => fc.feature) ?? [];

        // Filter out "time" and "censored"
        const filteredFeatures = features.filter(
          (f: string) => f !== "time" && f !== "censored"
        );
        setAvailableFeatures(filteredFeatures);

        // Select all features by default
        const initialSelected = new Set(filteredFeatures);
        setSelectedFeatures(initialSelected);

        // Suggested name
        setName(`${predictorData.name}_F${filteredFeatures.length}`);
      } catch (err: any) {
        console.error("Failed to load predictor data:", err);
        setError(err.message || "Failed to load predictor data");
        setFeaturesError("Failed to load features. You can still retry later.");
      } finally {
        setFeaturesLoading(false);
        setLoading(false);
      }
    }

    void loadData();
  }, [id]);

  const canRetrain =
    !!name.trim() && selectedFeatures.size > 0 && trainingStep === "idle";

  // Retrain handler
  const handleRetrain = async () => {
    if (!predictor || selectedFeatures.size === 0 || !name.trim()) return;

    setTrainingStep("training");
    setTrainingError(null);

    try {
      // Train the model with new parameters
      const trainingResult = await trainPredictor(predictor.dataset.dataset_id, {
        parameters: {
          // Model & Experiment
          model: selectedModel,
          post_process: postProcess,
          n_exp: nExp,
          seed,
          ...(["MTLR", "CoxPH", "CQRNN", "LogNormalNN"].includes(selectedModel) &&
            timeBins !== null && { time_bins: timeBins }),

          // Conformalization
          error_f: "Quantile",
          decensor_method: decensorMethod,
          mono_method: monoMethod,
          interpolate,
          n_quantiles: nQuantiles,
          use_train: useTrain,
          n_sample: decensorMethod === "sampling" ? nSample : undefined,

          // Neural Network Architecture (only if applicable)
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
          selected_features: Array.from(selectedFeatures),
        },
      });

      if (!trainingResult || !trainingResult.model_id) {
        throw new Error("Training did not return a valid model_id");
      }

      // Create new predictor
      setTrainingStep("creating");

      let parsedFeatures = trainingResult.selected_features;
      if (typeof parsedFeatures === "string") {
        try {
          parsedFeatures = JSON.parse(parsedFeatures);
        } catch (e) {
          console.warn("Could not parse selected_features as JSON");
        }
      }

      const created = await createPredictor({
        name: name.trim(),
        description: notes.trim(),
        dataset_id: predictor.dataset.dataset_id,
        is_private: true,
        model_id: trainingResult.model_id,
        ml_trained_at: trainingResult.trained_at || new Date().toISOString(),
        ml_training_status: "trained",
        ml_model_metrics: trainingResult.metrics || {},
        ml_selected_features: parsedFeatures || null,

        // Store all the new parameters with predictor
        model: selectedModel,
        post_process: postProcess,
        n_exp: nExp,
        seed,
        time_bins:
          ["MTLR", "CoxPH", "CQRNN", "LogNormalNN"].includes(selectedModel) &&
          timeBins !== null
            ? timeBins
            : undefined,
        error_f: "Quantile",
        decensor_method: decensorMethod,
        mono_method: monoMethod,
        interpolate,
        n_quantiles: nQuantiles,
        use_train: useTrain,
        n_sample: decensorMethod === "sampling" ? nSample : undefined,
        neurons: isNeuralNetworkModel() ? neurons : undefined,
        norm: isNeuralNetworkModel() ? norm : undefined,
        dropout: isNeuralNetworkModel() ? dropout : undefined,
        activation: isNeuralNetworkModel() ? activation : undefined,
        n_epochs: isNeuralNetworkModel() ? nEpochs : undefined,
        early_stop: isNeuralNetworkModel() ? earlyStop : undefined,
        batch_size: isNeuralNetworkModel() ? batchSize : undefined,
        lr: isNeuralNetworkModel() ? lr : undefined,
        weight_decay: isNeuralNetworkModel() ? weightDecay : undefined,
        lam: selectedModel === "LogNormalNN" ? lam : undefined,
      });

      setTrainingStep("complete");

      setTimeout(() => {
        navigate(`/predictors/${created.predictor_id}`);
      }, 2000);
    } catch (err: any) {
      setTrainingStep("error");
      console.error("Retrain failed:", err);
      setTrainingError(err.message || "Failed to re-train predictor");
    }
  };

  if (loading) {
    return (
      <div className="bg-neutral-100">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
            <p className="mt-4 text-sm text-neutral-600">
              Loading predictor data…
            </p>
          </div>
        </div>
      </div>
    );
  }


  if (error || !predictor) {
    return (
      <div className="min-h-[60vh] bg-neutral-100">
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-900">Error</h2>
            <p className="mt-2 text-sm text-red-700">
              {error || "Predictor not found."}
            </p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = trainingStep !== "idle";

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header (matches PredictorCreate) */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full border-b bg-neutral-700 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(`/predictors/${predictor.predictor_id}`)}
            disabled={isProcessing}
            className="inline-flex items-center rounded-md border border-white/10 bg-neutral-600 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-neutral-500 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
          <div className="text-lg font-semibold tracking-wide">
            Re-train Predictor
          </div>
          <button
            onClick={handleRetrain}
            disabled={!canRetrain}
            className="inline-flex items-center rounded-md border border-black/10 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {trainingStep === "training"
              ? "Training…"
              : trainingStep === "creating"
              ? "Creating…"
              : "Re-train"}
          </button>
        </div>
        <div className="h-1 w-full bg-neutral-600" />
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
          {/* Page heading / info */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-200 p-4">
            <header className="space-y-1">
              <p className="text-sm text-neutral-700">
                You’re creating a new predictor based on{" "}
                <span className="font-semibold">{predictor.name}</span> using the
                same dataset (
                <span className="font-medium">
                  {predictor.dataset.dataset_name}
                </span>
                ), but with a custom subset of features and training settings.
              </p>
              <p className="text-xs text-neutral-600">
                The original predictor is unchanged. This page will train a new
                model and save it as a separate predictor.
              </p>
            </header>
          </section>

          {/* Name */}
          <section className="space-y-2">
            <label className="block text-sm font-semibold uppercase tracking-wide text-neutral-900">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isProcessing}
              placeholder="A concise predictor name"
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
            />
            <p className="text-xs text-neutral-500">
              Suggested: {predictor.name}_F{selectedFeatures.size}
            </p>
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
              placeholder="Optional description (e.g., what changed relative to the original predictor)."
            />
          </section>

          {/* Feature Selection (collapsible, styled like PredictorCreate) */}
          <FeatureSelectionSection
            disabled={isProcessing}
            availableFeatures={availableFeatures}
            selectedFeatures={selectedFeatures}
            setSelectedFeatures={setSelectedFeatures}
            isLoading={featuresLoading}
            error={featuresError}
          />

          {/* Advanced Settings (collapsible, styled like PredictorCreate) */}
          <section className="space-y-4 rounded-lg border border-black/10 bg-neutral-50 p-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              disabled={isProcessing}
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
                    disabled={isProcessing}
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
                    Select the survival model to use.
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
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      >
                        <option value="CSD">CSD</option>
                        <option value="CSD-iPOT">CSD-iPOT</option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">
                        Post-processing method for predictions.
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
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Number of experimental runs.
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="seed"
                        className="block text-sm font-medium text-neutral-700"
                      >
                        Random Seed
                      </label>
                      <input
                        type="number"
                        id="seed"
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Seed for reproducibility.
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
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          disabled={isProcessing}
                          placeholder="Optional"
                          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                        />
                        <p className="mt-1 text-xs text-neutral-500">
                          Number of time bins for survival analysis.
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
                        Error function for conformal prediction.
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
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      >
                        <option value="uncensored">Uncensored</option>
                        <option value="margin">Margin</option>
                        <option value="PO">PO</option>
                        <option value="sampling">Sampling</option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">
                        Method for handling censored data.
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
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      >
                        <option value="ceil">Ceil</option>
                        <option value="floor">Floor</option>
                        <option value="bootstrap">Bootstrap</option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">
                        Method for ensuring monotonicity.
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
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      >
                        <option value="Linear">Linear</option>
                        <option value="Pchip">Pchip</option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">
                        Interpolation method for predictions.
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
                        onChange={(e) =>
                          setNQuantiles(Number(e.target.value))
                        }
                        disabled={isProcessing}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Common values: 4, 9, 19, 39, 49, 99.
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
                          disabled={isProcessing}
                          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                        />
                        <p className="mt-1 text-xs text-neutral-500">
                          Number of samples when using sampling method.
                        </p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={useTrain}
                          onChange={(e) => setUseTrain(e.target.checked)}
                          disabled={isProcessing}
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                          id="use_train"
                        />
                        <label htmlFor="use_train" className="ml-2 text-sm">
                          Use Training Data
                        </label>
                      </div>
                      <p className="ml-6 mt-1 text-xs text-neutral-500">
                        Include training data in conformal prediction.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        placeholder="e.g., 64,64"
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Layer sizes separated by commas.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
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
                        Non-linearity between layers.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Probability of dropping neurons (0–1).
                      </p>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={norm}
                          onChange={(e) => setNorm(e.target.checked)}
                          disabled={isProcessing || !isNeuralNetworkModel()}
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                          id="norm"
                        />
                        <label htmlFor="norm" className="ml-2 text-sm">
                          Use Batch Normalization
                        </label>
                      </div>
                      <p className="ml-6 mt-1 text-xs text-neutral-500">
                        Normalize activations for stability.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Maximum training iterations.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Samples per gradient update.
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
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Step size for gradient descent.
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
                        onChange={(e) =>
                          setWeightDecay(Number(e.target.value))
                        }
                        disabled={isProcessing || !isNeuralNetworkModel()}
                        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100 disabled:text-neutral-500"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        L2 regularization strength.
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
                          disabled={isProcessing}
                          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 disabled:bg-gray-100"
                        />
                        <p className="mt-1 text-xs text-neutral-500">
                          Regularization weight for d-calibration.
                        </p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={earlyStop}
                          onChange={(e) => setEarlyStop(e.target.checked)}
                          disabled={isProcessing || !isNeuralNetworkModel()}
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500 disabled:opacity-50"
                          id="early_stop"
                        />
                        <label htmlFor="early_stop" className="ml-2 text-sm">
                          Enable Early Stopping
                        </label>
                      </div>
                      <p className="ml-6 mt-1 text-xs text-neutral-500">
                        Stop training if validation performance plateaus.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Tiny hint so users know where the main action is */}
          <p className="text-xs text-neutral-500">
            When you’re ready, use the <span className="font-medium">Re-train</span>{" "}
            button in the sticky header to train and save the new predictor.
          </p>
        </div>
      </div>

      {/* Training Modal */}
      {trainingStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            {trainingStep === "training" && (
              <div className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
                <h3 className="text-lg font-semibold text-neutral-900">
                  Re-training model…
                </h3>
                <p className="mt-2 text-sm text-neutral-600">
                  This may take several minutes. Please don’t close this page.
                </p>
              </div>
            )}

            {trainingStep === "creating" && (
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />
                <h3 className="text-lg font-semibold text-neutral-900">
                  Creating predictor…
                </h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Setting up your new predictor in the database.
                </p>
              </div>
            )}

            {trainingStep === "complete" && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
                  ✓
                </div>
                <h3 className="text-lg font-semibold text-neutral-900">
                  Training complete
                </h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Redirecting to the new predictor…
                </p>
              </div>
            )}

            {trainingStep === "error" && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">
                  ✕
                </div>
                <h3 className="text-lg font-semibold text-neutral-900">
                  Training failed
                </h3>
                <p className="mt-2 text-sm text-red-600">{trainingError}</p>
                <button
                  onClick={() => {
                    setTrainingStep("idle");
                    setTrainingError(null);
                  }}
                  className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
    const next = new Set(selectedFeatures);
    if (next.has(feature)) next.delete(feature);
    else next.add(feature);
    setSelectedFeatures(next);
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
