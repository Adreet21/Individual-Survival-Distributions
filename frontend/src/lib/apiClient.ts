const BASE = import.meta.env.VITE_API_BASE_URL || "";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(
  tokens: { access?: string; refresh?: string } | null
) {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem("auth_tokens");
    return;
  }
  if (tokens.access) accessToken = tokens.access;
  if (tokens.refresh) refreshToken = tokens.refresh;

  localStorage.setItem(
    "auth_tokens",
    JSON.stringify({ access: accessToken, refresh: refreshToken })
  );
}

export function loadTokensFromStorage() {
  const raw = localStorage.getItem("auth_tokens");
  if (!raw) return;
  try {
    const { access, refresh } = JSON.parse(raw);
    accessToken = access ?? null;
    refreshToken = refresh ?? null;
  } catch { }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    // enable if backend sets cookies (CORS must allow it)
    // credentials: "include",
  });

  // Auto-refresh on 401 once
  if (res.status === 401 && refreshToken) {
    const r = await fetch(`${BASE}/api/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
      // credentials: "include",
    });
    if (r.ok) {
      const data = await r.json(); // { access }
      setTokens({ access: data.access });
      // retry original request
      return raw<T>(path, init);
    } else {
      // Refresh token is expired or invalid
      // Clear tokens and redirect to login
      setTokens(null);
      window.location.href = "/login";
      throw { status: 401, statusText: "Session expired", details: { error: "Please log in again" } };
    }
  }

  if (!res.ok) {
    let details: unknown = null;
    try {
      details = await res.json();
    } catch { }
    throw { status: res.status, statusText: res.statusText, details };
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Public API function that doesn't send auth headers
async function publicRaw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  // Explicitly don't add Authorization header for public endpoints

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let details: unknown = null;
    try {
      details = await res.json();
    } catch { }
    throw { status: res.status, statusText: res.statusText, details };
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(p: string) => raw<T>(p),
  post: <T>(p: string, body?: unknown) =>
    raw<T>(p, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(p: string, body?: unknown) =>
    raw<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(p: string, body?: unknown) =>
    raw<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(p: string, body?: unknown) => 
    raw<T>(p, { 
      method: "DELETE", 
      body: body ? JSON.stringify(body) : undefined 
    }),
};

// Public API that doesn't send authentication headers
export const publicApi = {
  get: <T>(p: string) => publicRaw<T>(p),
  post: <T>(p: string, body?: unknown) =>
    publicRaw<T>(p, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
};
