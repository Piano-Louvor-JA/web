// Guard de URL de produção para testes E2E (G2 do guardrail pianolouvorja).
//
// Contexto: em 07/10/2026, execuções E2E/manuais criaram fixtures (usuários
// e2e_*, coletâneas "E2E <ms>") na API de PRODUÇÃO (api.pianolouvorja.com.br),
// poluindo "Minhas Coletâneas" e o ranking público. Este helper é a barreira
// client-side: qualquer URL de API apontando para produção aborta a suíte no
// globalSetup, ANTES de qualquer request.
//
// Regra (SPEC guardrail-e2e §2): E2E roda contra staging, localhost ou mock
// (page.route — nunca sai pela rede). Produção é proibida por padrão.
//
// Hosts não-listados passam: o upstream api.louvorja.com.br é fallback
// read-only do catálogo e não aceita writes.

/** Hosts cujo acesso por E2E é PROIBIDO (API de produção). */
export const PROD_HOSTS = ['api.pianolouvorja.com.br'] as const

/** Extrai o hostname de uma URL, ou null se inválida/vazia. */
function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Lana erro se alguma das URLs apontar para um host de PRODUÇÃO.
 *
 * @param urls   URLs candidatas (env vazias/ausentes são puladas)
 * @param source origem das URLs para a mensagem de erro (ex.: "process.env",
 *               ".env", ".env.local")
 * @throws Error com host ofensor e origem, sugerindo staging/local/mock
 */
export function assertNoProdApiUrl(urls: Array<string | undefined>, source: string): void {
  for (const url of urls) {
    const host = hostnameOf(url)
    if (host === null) continue
    if ((PROD_HOSTS as readonly string[]).includes(host)) {
      throw new Error(
        `E2E apontando para PRODUÇÃO (${host} em ${source}) — use staging ` +
          `(api-stg.pianolouvorja.com.br), localhost ou mock (page.route). ` +
          `URL ofensora: ${url}`,
      )
    }
  }
}

/** Quebra um CSV de URLs ("https://a,https://b") em entradas não-vazias. */
export function splitCsvUrls(csv: string | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}
