import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLoadingScreen from "../auth/AuthLoadingScreen";

export default function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
