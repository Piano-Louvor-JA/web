/**
 * Bloqueio de autores (App Store 1.2 — conteúdo gerado por usuários).
 * Quem bloqueia deixa de ver as coletâneas do autor (a API filtra).
 * Paridade com app desktop e apk.
 */
import { bearer, communityBaseUrl, communityRequest } from "./community-http";

export type BlockedAuthor = { id: number; name: string };

function toAuthor(row: { id_user?: unknown; displayName?: unknown }): BlockedAuthor | null {
  const id = Number(row.id_user);
  if (!Number.isInteger(id) || id <= 0) return null;
  const name = typeof row.displayName === "string" && row.displayName.trim() ? row.displayName : "";
  return { id, name };
}

export async function blockAuthor(collectionId: number, token: string | null): Promise<BlockedAuthor | null> {
  if (!token) return null;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/collections/${collectionId}/block-author`,
      communityRequest({ method: "POST", headers: bearer(token) }),
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { blocked?: { id_user?: unknown; displayName?: unknown } };
    return json.blocked ? toAuthor(json.blocked) : null;
  } catch {
    return null;
  }
}

export async function listBlockedAuthors(token: string | null): Promise<BlockedAuthor[] | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${communityBaseUrl()}/blocks`, communityRequest({ headers: bearer(token) }));
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id_user?: unknown; displayName?: unknown }> };
    return (json.data ?? []).map(toAuthor).filter((a): a is BlockedAuthor => a !== null);
  } catch {
    return null;
  }
}

export async function unblockAuthor(userId: number, token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(
      `${communityBaseUrl()}/blocks/${userId}`,
      communityRequest({ method: "DELETE", headers: bearer(token) }),
    );
    return res.ok;
  } catch {
    return false;
  }
}
