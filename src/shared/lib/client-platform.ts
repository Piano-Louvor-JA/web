/**
 * Identidade de plataforma do cliente — padrão da org (X-Client-Platform).
 *
 * Valores: web (PWA/navegador) — o web roda só no navegador.
 * A API usa isso pra telemetria por tipo de acesso (app/web/apk/palco).
 *
 * Instalação: este módulo faz patch do fetch UMA vez no boot (main.ts)
 * e injeta os headers em toda request same-origin+z-api. Sem dependências.
 */

export const CLIENT_PLATFORM = 'web'

/** Versão do build (injectada pelo Vite do package.json). */
export const CLIENT_VERSION: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_VERSION) || ''

const HEADER_PLATFORM = 'X-Client-Platform'
const HEADER_VERSION = 'X-Client-Version'

let patched = false

export function installClientPlatformHeader(): void {
  if (patched || typeof globalThis.fetch !== 'function') return
  patched = true
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      // Só marca requests pra APIs http(s) — ignora blob:, data:, etc.
      if (!/^https?:\/\//i.test(url)) {
        return originalFetch(input as RequestInfo, init)
      }
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      if (!headers.has(HEADER_PLATFORM)) headers.set(HEADER_PLATFORM, CLIENT_PLATFORM)
      if (CLIENT_VERSION && !headers.has(HEADER_VERSION)) headers.set(HEADER_VERSION, CLIENT_VERSION)
      return originalFetch(input as RequestInfo, { ...init, headers })
    } catch {
      return originalFetch(input as RequestInfo, init)
    }
  }
}
