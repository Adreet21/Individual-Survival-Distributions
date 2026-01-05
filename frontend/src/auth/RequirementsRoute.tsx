import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/apiClient";
import { mapApiPredictorToUi } from "../lib/predictors";
import { listMyDatasets } from "../lib/datasets";
import { useAuth } from "./AuthContext";
import AuthLoadingScreen from "./AuthLoadingScreen";

interface RequirementsRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that ensures the user has at least one trained predictor
 * and at least one dataset before allowing access to the wrapped route.
 * Redirects to /datasets/upload if no datasets are found.
 * Redirects to /predictors/new if no trained predictors are found.
 */
export default function RequirementsRoute({ children }: RequirementsRouteProps) {
  const { user } = useAuth();
  const currentUserId = (user as any)?.id ?? (user as any)?.pk;
  const [loading, setLoading] = useState(true);
  const [hasTrainedPredictor, setHasTrainedPredictor] = useState(false);
  const [hasDataset, setHasDataset] = useState(false);

  useEffect(() => {
    async function checkRequirements() {
      try {
        // Check for datasets
        const datasets = await listMyDatasets();
        const hasData = Array.isArray(datasets) && datasets.length > 0;
        setHasDataset(hasData);

        // Check for trained predictors
        const predData = await api.get<any[]>("/api/predictors/");
        const mappedPreds = Array.isArray(predData)
          ? predData.map((p) => mapApiPredictorToUi(p, currentUserId))
          : [];
        
        const trainedPreds = mappedPreds.filter(
          p => p.ml_training_status === "Trained" || p.ml_training_status === "trained"
        );
        
        setHasTrainedPredictor(trainedPreds.length > 0);
      } catch (err) {
        console.error("Failed to check requirements", err);
        setHasTrainedPredictor(false);
        setHasDataset(false);
      } finally {
        setLoading(false);
      }
    }

    checkRequirements();
  }, [currentUserId]);

  // Show loading state while checking
  if (loading) {
    return (
      <AuthLoadingScreen
        word="Loading"
        message="Checking requirements..."
      />
    );
  }

  // Redirect to dataset upload if no datasets
  if (!hasDataset) {
    return <Navigate to="/datasets/new" replace state={{ from: "use-predictor", message: "Please upload a dataset first" }} />;
  }

  // Redirect to create predictor page if no trained predictors
  if (!hasTrainedPredictor) {
    return <Navigate to="/predictors/new" replace state={{ from: "use-predictor" }} />;
  }

  // User has both datasets and trained predictors, allow access
  return <>{children}</>;
}
