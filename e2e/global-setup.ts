// globalSetup do Playwright (web) — guard de URL de produção (G2).
//
// Roda UMA vez antes de qualquer spec/browser/request. Valida as URLs de API
// EFETIVAS: process.env > .env.local > .env (mesma precedência que o dev
// server do Vite/Playwright usa para carregar esses arquivos). Se qualquer
// uma apontar para api.pianolouvorja.com.br, a suíte INTEIRA aborta aqui —
// nenhum request sai para produção (critério A4 da SPEC guardrail-e2e).
import { assertNoProdApiUrl, repoRootEnvLayers, resolveEffectiveApiUrls } from './helpers/prod-url-guard'

export default function globalSetup(): void {
  for (const { key, url, source } of resolveEffectiveApiUrls(process.env, repoRootEnvLayers())) {
    assertNoProdApiUrl([url], `${source} (${key})`)
  }
}
