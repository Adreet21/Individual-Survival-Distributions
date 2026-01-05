import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/apiClient";
import { useAuth } from "../auth/AuthContext";

export default function ResetConfirm() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Support both patterns:
  //  - /reset/confirm/:uid/:token
  //  - /reset/confirm?token=abc
  const { uid, token: tokenParam } = useParams<{ uid?: string; token?: string }>();
  const search = new URLSearchParams(useLocation().search);
  const tokenQuery = search.get("token") ?? undefined;

  const token = useMemo(() => tokenParam ?? tokenQuery, [tokenParam, tokenQuery]);

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token && !uid) {
      setMsg("Invalid or missing password reset link.");
    }
  }, [token, uid]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (pwd1.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (pwd1 !== pwd2) {
      setMsg("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      // Choose a default backend path; UPDATE THIS, THIS IS WRONG
      const RESET_CONFIRM_PATH = `/api/auth/user/password/reset/${uid}/${token}/`;

      // payload shape varied for use - FIX THIS TO MATCH
      const body: Record<string, unknown> = {
        uid,
        token,
        new_password: pwd1,
      };

      await api.post(RESET_CONFIRM_PATH, body);

      // Force re-login after a successful reset
      setMsg("Password updated. Please sign in.");
      logout();
      setTimeout(() => {
        navigate("/login", { replace: true, state: { flash: "Password updated. Please sign in." } });
      }, 2000);
    } catch (err: any) {
      const detail =
        err?.details?.detail ||
        err?.details?.message ||
        (typeof err?.details === "string" ? err.details : null);
      setMsg(detail ?? "Password reset failed. Your link may have expired.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid min-h-[60vh] place-items-center">
      {/* Card/box UI reused from ResetPassword */}
      <div className="w-full max-w-md rounded-xl bg-black/5 p-1">
        <div className="rounded-xl bg-white p-6 shadow-card">
          <h2 className="mb-4 text-center text-sm font-semibold">Set a new password</h2>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">
              New password
              <input
                type="password"
                required
                id="new-password"
                value={pwd1}
                onChange={(e) => setPwd1(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
              />
            </label>

            <label className="block text-xs font-medium text-gray-700">
              Confirm new password
              <input
                type="password"
                required
                id="confirm-password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10"
              />
            </label>

            {msg && <p className="text-xs text-green-600">{msg}</p>}

            <div className="flex items-center justify-between pt-1">
              <Link to="/login" className="text-xs text-gray-600 hover:underline">
                Back to sign in
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
              >
                {saving ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
