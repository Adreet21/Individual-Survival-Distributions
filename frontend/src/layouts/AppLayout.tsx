import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../shared/Navbar";
import { useAuth } from "../auth/AuthContext";
import type { JSX } from "react/jsx-runtime";
import Footer from "../components/Footer";

export default function AppLayout(): JSX.Element {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/reset" ||
    pathname.startsWith("/reset/confirm");

  const hideFooter =
    isAuthRoute ||
    pathname === "/datasets/new" ||
    (pathname.startsWith("/datasets/") && pathname.endsWith("/edit")) ||
    pathname === "/predictors/new" ||
    (pathname.startsWith("/predictors/") && pathname.endsWith("/edit"));

  const useGray = !user || isAuthRoute;

  return (
    <div
      className={`flex min-h-screen flex-col ${
        useGray ? "bg-gray-100" : "bg-gray-100"
      } text-gray-900`}
    >
      <Navbar />

      <main className="mx-auto w-full flex-1">
        <Outlet />
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
