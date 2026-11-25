import { getAuthSession } from "@/modules/auth/services/auth-client";

import { bearer, communityBaseUrl, communityRequest } from "./community-http";

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  created_at: string;
};

/** Notificações não lidas (GET /notifications). Sem sessão/falha → []. */
export async function getNotifications(): Promise<AppNotification[]> {
  const token = getAuthSession()?.token;
  if (!token) return [];
  try {
    const res = await fetch(
      `${communityBaseUrl()}/notifications`,
      communityRequest({ headers: bearer(token) }),
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    return Array.isArray(json.data) ? (json.data as AppNotification[]) : [];
  } catch {
    return [];
  }
}

/** Marca todas como lidas (POST /notifications/read-all). Best-effort. */
export async function markAllRead(): Promise<void> {
  const token = getAuthSession()?.token;
  if (!token) return;
  try {
    await fetch(
      `${communityBaseUrl()}/notifications/read-all`,
      communityRequest({ method: "POST", headers: bearer(token) }),
    );
  } catch {
    // best-effort
  }
}
