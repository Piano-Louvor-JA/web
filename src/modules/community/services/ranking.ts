import { bearer, communityBaseUrl, communityRequest } from "./community-http";

export type RankingWindow = "week" | "all";

export type RankingEntry = {
  user_id: number;
  display_name: string;
  position: number;
  total: number;
};

export type MyPosition = {
  position: number | null;
  total: number;
};

/** Ranking global (GET /v1/custom/ranking). Falha → lista vazia. */
export async function getRanking(
  window: RankingWindow,
): Promise<RankingEntry[]> {
  try {
    const res = await fetch(
      `${communityBaseUrl()}/ranking?window=${window}`,
      communityRequest(),
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    return Array.isArray(json.data) ? (json.data as RankingEntry[]) : [];
  } catch {
    return [];
  }
}

export async function getMyPosition(
  window: RankingWindow,
  token: string | null,
): Promise<MyPosition> {
  if (!token) return { position: null, total: 0 };
  try {
    const res = await fetch(
      `${communityBaseUrl()}/ranking/me?window=${window}`,
      communityRequest({ headers: bearer(token) }),
    );
    if (!res.ok) return { position: null, total: 0 };
    const json = (await res.json()) as {
      position?: number | null;
      total?: number | null;
    };
    return { position: json.position ?? null, total: json.total ?? 0 };
  } catch {
    return { position: null, total: 0 };
  }
}

/** Registra uso (POST /collections/{id}/use). Exige sessão. */
export async function registerUse(
  collectionId: number,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/collections/${collectionId}/use`,
      communityRequest({ method: "POST", headers: bearer(token) }),
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Denuncia a coletânea (POST /collections/{id}/report). A API esconde a
 * coletânea do catálogo até a curadoria revisar (App Store 1.2).
 */
export async function reportCollection(
  collectionId: number,
  reason: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/collections/${collectionId}/report`,
      communityRequest({
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(token) },
        body: JSON.stringify({ reason }),
      }),
    );
    return res.ok;
  } catch {
    return false;
  }
}
