/** Identificação do web na origem local, nas APIs configuradas e na API Piano. */
import { isPianoApiUrl, PARTNER_KEY_HEADER, partnerKeyForUrl } from './partner-key'

export const CLIENT_PLATFORM = 'web'
export const CLIENT_VERSION: string = import.meta.env.VITE_APP_VERSION || __APP_VERSION__
let patched = false

export function installClientPlatformHeader(): void {
  if (patched || typeof globalThis.fetch !== 'function' || typeof location === 'undefined') return
  patched = true
  const originalFetch = globalThis.fetch.bind(globalThis)
  const origins = new Set([location.origin, 'https://api.louvorja.com.br'])
  const configured = [import.meta.env.VITE_URL_DATABASE, import.meta.env.VITE_PALCO_API_URL, ...(import.meta.env.VITE_API_FALLBACK_URLS || '').split(',')]
  for (const value of configured) {
    if (!value?.trim()) continue
    try { origins.add(new URL(value.trim(), location.href).origin) } catch { /* Configuração inválida não amplia o escopo. */ }
  }
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let next = init
    try {
      const request = input instanceof Request ? input : undefined
      const url = new URL(request ? request.url : String(input), location.href)
      const mode = init?.mode ?? request?.mode
      if (['http:', 'https:'].includes(url.protocol) && (origins.has(url.origin) || isPianoApiUrl(url)) && mode !== 'no-cors') {
        const headers = new Headers(init?.headers ?? request?.headers)
        if (!headers.has('X-Client-Platform')) headers.set('X-Client-Platform', CLIENT_PLATFORM)
        if (CLIENT_VERSION && !headers.has('X-Client-Version')) headers.set('X-Client-Version', CLIENT_VERSION)
        const partnerKey = partnerKeyForUrl(url.href)
        if (partnerKey && !headers.has(PARTNER_KEY_HEADER)) headers.set(PARTNER_KEY_HEADER, partnerKey)
        next = { ...init, headers }
      }
    } catch { /* Preserva a semântica do fetch para entradas não normalizáveis. */ }
    return originalFetch(input, next)
  }
}
