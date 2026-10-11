// globalSetup do Playwright (web) — guard de URL de produção (G2).
//
// Roda UMA vez antes de qualquer spec/browser/request. Se qualquer env de API
// apontar para api.pianolouvorja.com.br, a suíte INTEIRA aborta aqui —
// nenhum request sai para produção (critério A4 da SPEC guardrail-e2e).
import { assertNoProdApiUrl, splitCsvUrls } from './helpers/prod-url-guard'

export default function globalSetup(): void {
  const env = process.env
  assertNoProdApiUrl(
    [
      env.VITE_URL_DATABASE,
      env.VITE_URL_FILES,
      env.VITE_PALCO_API_URL,
      ...splitCsvUrls(env.VITE_API_FALLBACK_URLS),
    ],
    'process.env',
  )
}
