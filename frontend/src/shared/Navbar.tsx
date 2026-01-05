/**
 * NAVBAR
 *
 * Purpose:
 * - Persistent top app bar with site name, primary navigation, and auth-aware
 *   right side (Login when logged out; Dashboard + user menu when logged in).
 *
 * Notes:
 * - Primary nav (About / Instruction / Predictors) is always shown on the left.
 * - Right side:
 *   - Logged out: “Login” button.
 *   - Logged in: “Dashboard” + avatar button that opens a small popover menu.
 * - The avatar menu closes on outside click and contains:
 *   - “Settings” (navigates to /settings)
 *   - “Logout” (clears auth; navigates home)
 * - Avatar is a real button that expands into a menu - closes on externa click.
 */

import { Link, NavLink, useNavigate } from "react-router-dom";
import { User } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useEffect, useRef, useState } from "react";

function NavItem({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-white/10 text-white"
            : "text-white/80 hover:text-white hover:bg-white/10"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Local UI state for the profile popover menu
  const [menuOpen, setMenuOpen] = useState(false);

  // Click-away handling: close the menu if you click outside its area
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (

    <header className="sticky top-0 z-50 w-full border-b border-black/20 bg-black">
      <div className="container mx-auto max-w-6xl h-14 md:h-16 px-3 md:px-4 flex items-center justify-between">
        {/* LEFT: site name + primary nav */}
        <div className="flex items-center">
          <Link
            to="/"
            className="text-white font-semibold tracking-tight mr-6 md:mr-8"
          >
            ISD | Individual Survival Distributions
          </Link>

          <nav className="hidden sm:flex items-center gap-2 md:gap-3">
            <NavItem to="/about">About</NavItem>
            <NavItem to="/instructions">Instructions</NavItem>
            <NavItem to="/browse">Browse</NavItem>
            {user && <NavItem to="/use-predictor">Use Predictor</NavItem>}
            {user && <NavItem to="/my-predictions">My Predictions</NavItem>}
          </nav>
        </div>

        {/* RIGHT: auth-aware controls */}
        {!user ? (
          // Logged out: show Login
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Login
            </Link>
          </div>
        ) : (
          // Logged in: show Dashboard + avatar with popover
          <div className="flex items-center gap-3 relative" ref={menuRef}>
            {/* Quick link back to the main app section */}
            <Link
              to="/dashboard"
              className="hidden sm:inline-flex items-center rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Dashboard
            </Link>

            {/* Avatar: toggles profile menu */}
            <button
              type="button"
              aria-label="Profile"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={user.email}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <User size={16} />
            </button>

            {/* Small popover menu (Settings / Logout) */}
            {menuOpen && (
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()} // prevent closing due to container click handlers
                className="absolute right-0 top-10 z-50 w-40 overflow-hidden rounded-md border border-white/20 bg-white shadow-md"
              >
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                >
                  Settings
                </Link>
                <button
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false);
                    await logout();
                    navigate("/login");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
