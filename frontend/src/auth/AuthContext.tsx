/**
 * AUTH CONTEXT
 *
 * Purpose:
 * - Central source of truth for authentication state.
 * - Exposes the current 'user' and simple actions: login, signup, logout,
 *   updateProfile, updatePassword.
 *
 * Notes:
 * - AuthProvider stores 'user' in local React state.
 * - Public methods update that state and optionally navigate to routes
 *   (like: go to /dashboard after login / signup; go to / after logout).
 * - useAuth() reads / updates auth from any component! Pretty neat
 * Notes (11 OCT):
 * - login() now expects (username, password) to match Django SimpleJWT defaults.
 * - signup() now expects { username, email, password, password2 }.
 * - These call services/auth.ts (real API wiring); if you haven't added that file yet,
 *   create it as discussed (login/register/logout using /api/auth/* endpoints).
 *
 * TO DO
 * - Make sure API calls work and add more as needed
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setTokens, loadTokensFromStorage } from "../lib/apiClient";

type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  is_active: boolean;
  groups: string[];
};

type SignupBody = {
  username: string;
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "first_name" | "last_name" | "email">>) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH = "/api/auth";
const ACCOUNTS = "/api/accounts";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load persisted tokens and prefetch profile on mount
  useEffect(() => {
    const hasTokens = !!localStorage.getItem("auth_tokens");
    try { if (hasTokens) loadTokensFromStorage(); } catch { }
    const p = hasTokens ? refreshProfile() : Promise.resolve();
    p.finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    const res = await api.post<{ access: string; refresh: string }>(`${AUTH}/login/`, {
      username,
      password,
    });
    setTokens({ access: res.access, refresh: res.refresh });
    await refreshProfile();
  };

  const signup = async (body: SignupBody) => {
    setError(null);
    // create account
    await api.post(`${AUTH}/register/`, body);
  };

  const logout = async () => {
    setError(null);
    try {
      // If backend supports blacklisting on logout, post refresh token here.

      // We don't have direct access to refresh in this file; store it in context and send it.
      // For now, best-effort clear server & client:
      await api.post(`${AUTH}/logout/`, {} as any).catch(() => { });
    } catch { }
    setTokens(null);
    setUser(null);
    queryClient.removeQueries();
  };

  const refreshProfile = async () => {
    try {
      const me = await api.get<User>(`${ACCOUNTS}/users/me/`);
      setUser(me);
    } catch (e: any) {
      setUser(null);
    }
  };

  const updateProfile = async (patch: Partial<Pick<User, "first_name" | "last_name" | "email">>) => {
    setError(null);
    const cleaned: Record<string, unknown> = {};
    if (typeof patch.first_name === "string") cleaned.first_name = patch.first_name;
    if (typeof patch.last_name === "string") cleaned.last_name = patch.last_name;
    if (typeof patch.email === "string") cleaned.email = patch.email;

    const updated = await api.patch<User>(`${ACCOUNTS}/users/me/`, cleaned);
    setUser(updated);
  };

  const updatePassword = async (newPassword: string) => {
    setError(null);
    // Your UserSerializer.update supports changing password via PATCH "password"
    await api.patch(`${ACCOUNTS}/users/me/`, { password: newPassword });
    // Optional: force re-login if desired
    // await logout();
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    signup,
    logout,
    refreshProfile,
    updateProfile,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
