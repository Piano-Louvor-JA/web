/**
 * AppliedEditsFetcher — busca edits `applied` (aprovados pelo concilio) na API.
 * RF-08 — consumido pelo resolver via injeção (nunca no hot path).
 * Portação web: mesmo contrato do desktop; erros → null (oficial intacta).
 */
import { customApiUrl } from '../../media/services/custom-catalog';
import { authHeaders } from '../../auth/services/auth-client';
import type { AppliedEdit } from './edit-resolver';

export async function fetchAppliedEdit(musicId: number): Promise<AppliedEdit | null> {
  try {
    const res = await fetch(customApiUrl(`/edits/applied?musicIds=${musicId}`), {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      applied?: { musicId: number; lyrics: string | null; timing: string | null }[];
    };
    const hit = data.applied?.find((e) => e.musicId === musicId);
    if (!hit) return null;
    return { lyrics: hit.lyrics ?? null, timing: hit.timing ?? null };
  } catch {
    return null;
  }
}
