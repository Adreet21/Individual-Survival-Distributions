import { api } from "./apiClient";

export type BasicUser = {
  id: number;
  username: string;
  email?: string;
};

export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<BasicUser[]> {
  return api.get<BasicUser[]>(
    `/api/accounts/users/search/?q=${encodeURIComponent(query)}&limit=${limit}`
  );
}

export async function resolveUsernameToId(
  username: string
): Promise<number | null> {
  try {
    const res = await api.get<{ id: number }>(
      `/api/accounts/resolve/?username=${encodeURIComponent(username)}`
    );
    return res.id;
  } catch (err) {
    console.warn("Could not resolve username:", username, err);
    return null;
  }
}

