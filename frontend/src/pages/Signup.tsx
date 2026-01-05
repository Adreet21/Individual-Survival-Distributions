/**
 * SIGN UP PAGE
 *
 * Purpose:
 * - Public page to create a new account.
 * - On submit, calls 'auth.signup(...)' and redirects to /login.
 *
 * Notes:
 * - Segmented toggle (Sign in / Sign up) with Sign up active.
 * - Display Name + Email + Password + Confirm.
 *
 * Enhancements:
 * - Client-side password checks (length + match).
 * - Friendlier error messages for common backend password errors.
 * - Account-created banner shown above the sign-up card.
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function extractFirstBackendError(details: unknown): string | null {
  if (!details) return null;

  // Sometimes backend just sends a plain string
  if (typeof details === "string") return details;

  if (typeof details === "object") {
    const d = details as Record<string, unknown>;

    // Typical DRF / Djoser style: { field: ["msg"] }
    const preferredKeys = [
      "username",
      "email",
      "password",
      "password1",
      "password2",
      "non_field_errors",
      "detail",
    ];

    for (const key of preferredKeys) {
      const val = d[key];
      if (Array.isArray(val) && val.length > 0) return String(val[0]);
      if (typeof val === "string") return val;
    }

    // Fallback: first value in the object
    const firstVal = Object.values(d)[0];
    if (Array.isArray(firstVal) && firstVal.length > 0) {
      return String(firstVal[0]);
    }
    if (firstVal != null) return String(firstVal);
  }

  return null;
}

function normalizeRegistrationError(message: unknown): string {
  const raw = String(message ?? "Registration failed");
  const text = raw.trim() || "Registration failed";
  const lower = text.toLowerCase();

  // Map the backend "too short" message into a clean, consistent one
  if (lower.includes("password") && lower.includes("too short")) {
    return "Your password is too short. It must be at least 9 characters long.";
  }

  if (text === "Registration failed") {
    return "Registration failed. Please check the fields above and try again.";
  }

  // Otherwise just show whatever the backend said
  return text;
}

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setMsg(null);

    // Simple local validation so it doesn't feel "mysterious"
    if (pw1 !== pw2) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    // Match backend/browser requirement: 9+ characters
    if (pw1.length < 9) {
      setErrorMsg("Password must be at least 9 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        username,
        email,
        password: pw1,
        password2: pw2,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      });

      setMsg("Account created successfully! You can now sign in.");
      // Brief pause so the banner is visible before redirect
      await new Promise((resolve) => setTimeout(resolve, 2500));
      navigate("/login");
    } catch (err: any) {
      const rawDetails = err?.details;
      const firstBackendError =
        extractFirstBackendError(rawDetails) ?? "Registration failed";
      setErrorMsg(normalizeRegistrationError(firstBackendError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid min-h-[60vh] place-items-center py-12">
      <div className="w-full max-w-md space-y-3">
        {/* Success banner above the card */}
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-[11px] font-semibold text-black">
                ✓
              </span>
              <div className="flex-1">
                <p className="font-medium">Account created</p>
                <p className="mt-0.5 text-[11px] text-emerald-900/80">
                  {msg}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-black/5 p-1">
          <div className="rounded-xl bg-white p-6 shadow-card">
            {/* Segmented toggle */}
            <div className="mb-5 flex justify-center">
              <div className="inline-flex items-center rounded-md border border-black/10 bg-white p-0.5">
                <Link
                  to="/login"
                  className="inline-flex h-8 min-w-[84px] items-center justify-center rounded-[6px] px-4 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  Sign in
                </Link>
                <div className="inline-flex h-8 min-w-[84px] items-center justify-center rounded-[6px] bg-black px-4 text-xs font-medium text-white">
                  Sign up
                </div>
              </div>
            </div>

            {/* Error banner inside card */}
            {errorMsg && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-gray-700">
                Username
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="username"
                />
              </label>

              <label className="block text-xs font-medium text-gray-700">
                First name
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="given-name"
                />
              </label>

              <label className="block text-xs font-medium text-gray-700">
                Last name
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="family-name"
                />
              </label>

              <label className="block text-xs font-medium text-gray-700">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="email"
                />
              </label>

              <label className="block text-xs font-medium text-gray-700">
                Password
                <input
                  type="password"
                  required
                  id="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Use at least 9 characters, and avoid very common or repetitive
                  passwords.
                </p>
              </label>

              <label className="block text-xs font-medium text-gray-700">
                Confirm password
                <input
                  type="password"
                  required
                  id="confirm-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  autoComplete="new-password"
                />
              </label>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-70"
                >
                  {submitting && (
                    <span className="mr-2 inline-block">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
                    </span>
                  )}
                  {submitting ? "Creating account…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
