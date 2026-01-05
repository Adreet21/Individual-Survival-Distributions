import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';
import { getTrainingStatus } from '../lib/predictors';

interface TrainingProgress {
  current_experiment?: number;
  total_experiments?: number;
  message?: string;
  estimated_progress?: number;
  elapsed_seconds?: number;
  eta_seconds?: number;
}

interface TrainingModalProps {
  predictorId: number;
  onClose?: () => void;
  autoNavigateOnComplete?: boolean;
}

export default function TrainingModal({
  predictorId,
  onClose,
  autoNavigateOnComplete = false,
}: TrainingModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [status, setStatus] = useState<"training" | "complete" | "failed">(
    "training"
  );
  const [error, setError] = useState<string | null>(null);

  // Check if we're already on the predictor details page
  const isOnPredictorPage = location.pathname === `/predictors/${predictorId}`;

  const handlePredictorDetailsClick = () => {
    if (isOnPredictorPage && onClose) {
      // If already on predictor details page, just close the modal
      onClose();
    } else {
      // Otherwise navigate to the page
      navigate(`/predictors/${predictorId}`);
    }
  };

  useEffect(() => {
    let pollInterval: number;

    const pollTrainingStatus = async () => {
      try {
        const statusData = await getTrainingStatus(predictorId);

        if (statusData.progress) {
          setProgress(statusData.progress);
        }

        if (statusData.status === "trained") {
          clearInterval(pollInterval);
          setStatus("complete");
          setProgress({
            ...statusData.progress,
            estimated_progress: 100,
            message: "Training completed successfully.",
          });

          if (autoNavigateOnComplete) {
            setTimeout(() => {
              navigate(`/predictors/${predictorId}`);
            }, 2000);
          }
        } else if (statusData.status === "failed") {
          clearInterval(pollInterval);
          setStatus("failed");
          setError(statusData.error || "Training failed.");
        }
      } catch (err) {
        // Keep polling; transient errors are possible
        // eslint-disable-next-line no-console
        console.error("Error polling training status:", err);
      }
    };

    // Start polling immediately
    pollTrainingStatus();
    pollInterval = window.setInterval(pollTrainingStatus, 1000);

    return () => clearInterval(pollInterval);
  }, [predictorId, autoNavigateOnComplete, navigate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-md border border-neutral-300 bg-white p-6 shadow-xl">
        {status === 'training' && (
          <div className="text-center">
            {/* Spinner from AuthLoadingScreen */}
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800"></div>

            <h3 className="text-lg font-semibold text-neutral-900">Training ML Model</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {progress?.message || "Training in progress."}
            </p>

            {/* Progress Bar */}
            {progress?.estimated_progress !== undefined && (
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-xs text-neutral-600">
                  <span>Progress</span>
                  <span className="font-medium">{progress.estimated_progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-md bg-neutral-200">
                  <div
                    className="h-full bg-neutral-800 transition-all duration-500"
                    style={{ width: `${progress.estimated_progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Detailed Progress Info */}
            {progress && progress.current_experiment && (
              <div className="mt-4 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
                {progress.current_experiment && progress.total_experiments && (
                  <div className="flex items-center gap-2 font-medium text-neutral-800">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Cross-validation: Fold {progress.current_experiment} of {progress.total_experiments}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-neutral-600">
                  {progress.elapsed_seconds !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Elapsed: {formatTime(progress.elapsed_seconds)}</span>
                    </div>
                  )}
                  {progress.eta_seconds !== undefined &&
                    progress.eta_seconds > 0 && (
                      <div>
                        Estimated remaining: {formatTime(progress.eta_seconds)}
                      </div>
                    )}
                </div>
                <div className="mt-2 border-t border-neutral-200 pt-2 text-neutral-600">
                  {onClose
                    ? "You can close this window; training will continue in the background."
                    : "The model is training on your dataset. This may take a few minutes."}
                </div>
              </div>
            )}

            {/* Navigation Buttons - Available during training */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => navigate('/dashboard', { state: { tab: 'predictors' } })}
                className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:translate-y-[0.5px]"
              >
                Back to Dashboard
              </button>
              <button
                onClick={handlePredictorDetailsClick}
                className="flex-1 rounded-md border border-black/10 bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
              >
                Predictor Details
              </button>
            </div>
          </div>
        )}

        {status === "complete" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
              <CheckCircle className="h-12 w-12 text-neutral-800" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900">Training Complete!</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Your predictor has been trained successfully.
            </p>
            {autoNavigateOnComplete && (
              <p className="mt-1 text-xs text-neutral-500">
                Redirecting to predictor details…
              </p>
            )}
            {!autoNavigateOnComplete && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => navigate('/dashboard', { state: { tab: 'predictors' } })}
                  className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:translate-y-[0.5px]"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={handlePredictorDetailsClick}
                  className="flex-1 rounded-md border border-black/10 bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
                >
                  Predictor Details
                </button>
              </div>
            )}
          </div>
        )}

        {status === "failed" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
              <XCircle className="h-12 w-12 text-neutral-700" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900">Training Failed</h3>
            <p className="mt-2 text-sm text-neutral-600">{error}</p>
            {onClose && (
              <button
                onClick={onClose}
                className="mt-6 w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:translate-y-[0.5px]"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
