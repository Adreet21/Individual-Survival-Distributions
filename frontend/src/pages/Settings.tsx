/**
 * SETTINGS (Profile + Password)
 *
 * Purpose:
 * - Protected page for editing the current user's profile and password.
 *
 * Notes:
 * - Reads 'user' from AuthContext to prefill fields.
 * - Calls 'updateProfile({ displayName, email })' and 'updatePassword(current, next)'.
 *   (Both are demo stubs in the current AuthContext; replace with real API calls.)
 * - Two separate forms, so saving profile doesn't affect password flow and vice versa.
 * - Basic inline validation (matching new passwords) before calling updatePassword.
 */

import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLoadingScreen from "../auth/AuthLoadingScreen";

export default function Settings() {
  const navigate = useNavigate();
  const {
    user,
    loading,
    updateProfile,
    updatePassword,
    refreshProfile,
    logout,
  } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");

  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setEmail(user.email ?? "");
    } else {
      // attempt to load if not present (e.g., after refresh)
      refreshProfile().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateProfile({ first_name: firstName, last_name: lastName, email });
      setMsg("Profile updated.");
    } catch (err: any) {
      setMsg(
        err?.details
          ? JSON.stringify(err.details)
          : "Failed to update profile."
      );
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (pwd1.length < 8) {
      setPwMsg("Password must be at least 9 characters.");
      return;
    }
    if (pwd1 !== pwd2) {
      setPwMsg("Passwords do not match.");
      return;
    }

    setPwSaving(true);
    try {
      await updatePassword(pwd1);
      setPwMsg("Password updated.");
      setPwd1("");
      setPwd2("");
    } catch (err: any) {
      setPwMsg(
        err?.details
          ? JSON.stringify(err.details)
          : "Failed to update password."
      );
    } finally {
      setPwSaving(false);
    }
  };

  if (loading && !user) {
    return (
      <AuthLoadingScreen
        word="Loading"
        message="Loading settings..."
      />
    );
  }

  // helper styles for status messages
  const profileMsgClass =
    "text-xs font-medium text-neutral-700";

  const pwMsgClass =
    "text-xs font-medium text-neutral-700";

  return (
    <div className="min-h-[60vh] bg-neutral-100">
      {/* Sticky sub-header  */}
      <div className="sticky top-[var(--app-nav-h,4rem)] z-40 w-full bg-neutral-700 text-neutral-50">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-wide">
              Account Settings
            </span>
          </div>

          {/* tiny butterfly animation LOL */}
          <div className="flex items-center gap-2 pt-1 text-xs text-neutral-200">
            <span className="hidden sm:inline">
              Welcome back! Hopefully it's not another password reset 
            </span>
            <span className="text-xl animate-bounce">𓂃 ࣪˖ ִֶཐི༏ཋྀ</span>
          </div>
        </div>
        <div className="h-1 w-full bg-neutral-400" />
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          {/* Page heading card */}
          <section className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-200 p-4">
            <p className="text-sm text-neutral-800">
              Update your profile details and password. Changes apply to your
              current account only.
            </p>
          </section>

          {/* Profile section */}
          <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
            <header className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
                  Profile
                </h2>
                <p className="mt-1 text-xs text-neutral-600">
                  Keep your name and contact email up to date.
                </p>
              </div>
            </header>

            <form onSubmit={onSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-900">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="mt-1 w-full rounded-md border bg-white border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-900">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="mt-1 w-full rounded-md border bg-white border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-900">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1 w-full rounded-md border bg-white border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  This is used for account contact (for instance, if you forget your password.)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {msg && <p className={profileMsgClass}>{msg}</p>}
              </div>
            </form>
          </section>

          {/* Password section */}
          <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
            <header>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
                Change password
              </h2>
              <p className="mt-1 text-xs text-neutral-600">
                Use a strong, unique password to keep your account secure.
              </p>
            </header>

            <form onSubmit={onChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-900">
                  New password
                </label>
                <input
                  type="password"
                  value={pwd1}
                  onChange={(e) => setPwd1(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Minimum 8 characters. Avoid reusing passwords from other
                  sites.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-900">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="inline-flex items-center rounded-md border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pwSaving ? "Updating…" : "Update password"}
                </button>
                {pwMsg && <p className={pwMsgClass}>{pwMsg}</p>}
              </div>
            </form>
          </section>

          {/* Logout section */}
          <section className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900">
            <div>
              <p className="font-semibold">Log out</p>
              <p className="mt-0.5 text-xs text-neutral-600">
                You’ll need to sign in again to access your datasets and
                predictors.
              </p>
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:translate-y-[0.5px]"
            >
              Log out?
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
