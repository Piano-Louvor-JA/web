import { communityBaseUrl, communityRequest } from "./community-http";

export type SeasonalEventBanner = {
  name: string;
  description: string | null;
  multiplier: number;
} | null;

/** Evento sazonal ativo (GET /seasonal-event). Sem evento/falha → null. */
export async function getSeasonalEvent(): Promise<SeasonalEventBanner> {
  try {
    const res = await fetch(
      `${communityBaseUrl()}/seasonal-event`,
      communityRequest(),
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      active?: boolean;
      name?: string;
      description?: string | null;
      multiplier?: number;
    };
    if (json.active !== true || !json.name) return null;
    return {
      name: json.name,
      description: json.description ?? null,
      multiplier: Number(json.multiplier ?? 1),
    };
  } catch {
    return null;
  }
}
