/**
 * LOGIN PAGE
 *
 * Purpose:
 * - Public page to authenticate a user.
 * - On submit, calls 'auth.login(email)' (demo stub) and redirects to /dashboard.
 *
 * Notes:
 * - Segmented toggle (Sign in / Sign up) to switch auth pages.
 * - Email + Password form with basic accessibility + autocompletes.
 * - Background color is handled by AppLayout when logged out (full-page gray) (this is just a note for @Xenocynic)
 *
 * TO DO:
 * - Real apps: replace the stubbed `login()` with an API call + error handling.
 */

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err: any) {
      // Common SimpleJWT error shapes:
      // { detail: "No active account found..." }  OR field errors { username: [...], password: [...] }
      const d = err?.details;
      const message =
        d?.detail ??
        (Array.isArray(d?.username) && d.username[0]) ??
        (Array.isArray(d?.password) && d.password[0]) ??
        "Login failed";
      setErrorMsg(String(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid min-h-[60vh] place-items-center py-12">
      <div className="w-full max-w-md rounded-xl bg-black/5 p-1">
        <div className="rounded-xl bg-white p-6 shadow-card">
          {/* Segmented toggle */}
          <div className="mb-5 flex justify-center">
            <div className="inline-flex items-center rounded-md border border-black/10 bg-white p-0.5">
              <div className="inline-flex h-8 min-w-[84px] items-center justify-center rounded-[6px] px-4 text-xs font-medium bg-black text-white">
                Sign in
              </div>
              <Link
                to="/signup"
                className="inline-flex h-8 min-w-[84px] items-center justify-center rounded-[6px] px-4 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Sign up
              </Link>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              Username
              <input
                type="text"
                required
                id="current-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                autoComplete="username"
              />
            </label>

            <label className="block text-xs font-medium text-gray-700">
              Password
              <input
                type="password"
                required
                id="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
                autoComplete="current-password"
              />
            </label>

            <div className="flex items-center justify-between pt-1">
              <Link to="/reset" className="text-xs text-gray-600 hover:underline">
                Forgot password?
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-70"
              >
                {submitting ? "Signing in..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}