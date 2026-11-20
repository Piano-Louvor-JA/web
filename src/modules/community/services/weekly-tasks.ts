import { getAuthSession } from "@/modules/auth/services/auth-client";

import { bearer, communityBaseUrl, communityRequest } from "./community-http";

export type WeeklyTask = {
  id: string;
  description: string;
  bonus: number;
  done: boolean;
};

/** Tarefas da semana (GET /weekly-tasks). Sem sessão/falha → null. */
export async function getWeeklyTasks(): Promise<WeeklyTask[] | null> {
  const token = getAuthSession()?.token;
  if (!token) return null;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/weekly-tasks`,
      communityRequest({ headers: bearer(token) }),
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    return Array.isArray(json.data) ? (json.data as WeeklyTask[]) : null;
  } catch {
    return null;
  }
}
