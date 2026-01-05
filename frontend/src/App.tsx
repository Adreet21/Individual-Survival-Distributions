import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./auth/ProtectedRoute";
import GuestRoute from "./auth/GuestRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import Landing from "./pages/Landing";
import About from "./pages/About";
import Instructions from "./pages/Instructions";
import Browse from "./pages/Browse";
import ResetConfirm from "./pages/ResetConfirm";
import DatasetUpload from "./pages/DatasetUpload";
import DatasetEdit from "./pages/DatasetEdit";
import DatasetView from "./pages/DatasetView";
import PredictorCreate from "./pages/PredictorCreate";
import PredictorDetailPage from "./pages/PredictorDetailPage";
import PredictorEdit from "./pages/PredictorEdit";
import PredictorDraftEdit from "./pages/PredictorDraftEdit";
import ScrollToTop from "./components/ScrollToTop";
import UsePredictor from "./pages/UsePredictor";
import MyPredictions from "./pages/MyPredictions";
import SelectFeaturesPage from "./pages/SelectFeaturesPage";
import RequirementsRoute from "./auth/RequirementsRoute";
import PredictionSavePage from "./pages/PredictionSaveModal";
import PredictionViewPage from "./pages/PredictionViewPage";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          {/* Public for everyone */}
          <Route index element={<Landing />} />
          <Route path="about" element={<About />} />
          <Route path="instructions" element={<Instructions />} />
          <Route path="browse" element={<Browse />} />

          {/* Password reset confirm — support both patterns */}
          {/* UPDATE THIS LATER AND REMOVE THE QUERY TOKEN ONE */}
          <Route path="reset/confirm" element={<ResetConfirm />} />
          <Route path="reset/confirm/:uid/:token" element={<ResetConfirm />} />

          {/* Guest-only */}
          <Route element={<GuestRoute />}>
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="reset" element={<ResetPassword />} />
          </Route>

          {/* Auth-only */}
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="settings" element={<Settings />} />

            {/* Datasets */}
            <Route path="datasets/new" element={<DatasetUpload />} />
            <Route path="datasets/:id/edit" element={<DatasetEdit />} />
            <Route path="datasets/:id/view" element={<DatasetView />} />

            {/* Predictors */}
            <Route path="predictors/new" element={<PredictorCreate />} />
            <Route
              path="predictors/:predictorId"
              element={<PredictorDetailPage />}
            />
            <Route
              path="predictors/:id/select-features"
              element={<SelectFeaturesPage />}
            />
            <Route path="predictors/:id/edit" element={<PredictorEdit />} />

            {/* Draft predictor editing */}
            <Route
              path="predictors/draft/:id/edit"
              element={<PredictorDraftEdit />}
            />

            {/* Use predictor */}
            <Route
              path="use-predictor"
              element={
                <RequirementsRoute>
                  <UsePredictor />
                </RequirementsRoute>
              }
            />

            {/* Predictions */}
            <Route
              path="predictions/save"
              element={
                <RequirementsRoute>
                  <PredictionSavePage />
                </RequirementsRoute>
              }
            />

            {/* Read-only prediction view page */}
            <Route
              path="predictions/:predictionId"
              element={<PredictionViewPage />}
            />

            <Route path="my-predictions" element={<MyPredictions />} />
          </Route>

          {/* Fallback */}
          <Route path="* " element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
