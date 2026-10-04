/**
 * Identidade de conteúdo: SHA-256 hex de bytes (dedup de imports .slja).
 * Mesma semântica do app (app#336 fase 3): re-import do mesmo arquivo
 * recebe o mesmo client_uuid → a API dedupeia por (owner, client_uuid).
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** hex sha256 → formato uuid (determinístico; não precisa ser RFC v5 canônico,
 *  só estável pro mesmo conteúdo — idêntico ao app p/ paridade de dedup). */
export function sha256ToUuid(hex: string): string {
  const h = hex.replace(/-/g, '').padEnd(32, '0').slice(0, 32)
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-')
}
