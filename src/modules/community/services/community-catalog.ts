import { getAuthSession } from "@/modules/auth/services/auth-client";
import {
  createLocalCollection,
  createLocalMusic,
} from "@/modules/media/services/local-custom-store";

import { communityBaseUrl, communityRequest } from "./community-http";

/**
 * Catálogo da Comunidade — coletâneas públicas (GET /v1/custom/collections).
 * Com sessão, a API também esconde autores bloqueados (App Store 1.2).
 * Nunca expõe e-mail — só author_name.
 */
export type CommunityCollectionSummary = {
  id: number;
  name: string;
  description: string | null;
  authorName: string | null;
  /** Dono (owner_id) — null em coletânea legado sem dono. */
  authorId: number | null;
  musicsCount: number;
  coverUrl: string | null;
  createdAt: string | null;
};

export type CommunityPageResult = {
  items: CommunityCollectionSummary[];
  page: number;
  lastPage: number;
  total: number;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function listCommunityCollectionsPage(
  page: number,
  perPage: number,
): Promise<CommunityPageResult> {
  const empty: CommunityPageResult = { items: [], page, lastPage: 1, total: 0 };
  const token = getAuthSession()?.token;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/collections?page=${page}&per_page=${perPage}`,
      communityRequest(
        token ? { headers: { authorization: `Bearer ${token}` } } : {},
      ),
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
      meta?: { page?: number; last_page?: number; total?: number };
    };
    if (!Array.isArray(json.data)) return empty;
    return {
      items: json.data.map((row) => ({
        id: Number(row.id_collection),
        name: asString(row.name) ?? "",
        description: asString(row.description),
        authorName: asString(row.author_name),
        authorId:
          Number.isInteger(row.owner_id) && Number(row.owner_id) > 0
            ? Number(row.owner_id)
            : null,
        musicsCount: Number.isFinite(Number(row.musics_count))
          ? Number(row.musics_count)
          : 0,
        coverUrl: asString(row.cover_url),
        createdAt: asString(row.created_at),
      })),
      page: Number(json.meta?.page ?? page),
      lastPage: Number(json.meta?.last_page ?? 1),
      total: Number(json.meta?.total ?? json.data.length),
    };
  } catch {
    return empty;
  }
}

/**
 * Salva uma cópia local da coletânea pública (como o desktop): busca as
 * músicas e cria coletânea + músicas no armazenamento local. Retorna o id local.
 */
export async function saveCommunityCopy(
  collection: CommunityCollectionSummary,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${communityBaseUrl()}/collections/${collection.id}/musics`,
      communityRequest(),
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    if (!Array.isArray(json.data)) return null;
    const copy = createLocalCollection(
      collection.name,
      collection.description ?? undefined,
    );
    for (const row of json.data) {
      const official = row.official_music_id;
      createLocalMusic(copy.id, {
        name: asString(row.name) ?? "",
        officialMusicId:
          typeof official === "number" && official > 0 ? official : undefined,
      });
    }
    return copy.id;
  } catch {
    return null;
  }
}
