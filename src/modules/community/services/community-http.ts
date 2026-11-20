/**
 * Base HTTP da Comunidade — a API expõe tudo em /v1/custom (tenant via
 * X-Tenant). O prefixo /v1/community nunca existiu na API (404): paridade com
 * o app desktop (community-http.ts), que já usa /v1/custom.
 */

export function communityBaseUrl(): string {
  const base = import.meta.env.VITE_PALCO_API_URL
  if (base) return `${base.replace(/\/$/, '')}/v1/custom`
  return '/v1/custom'
}

export function communityRequest(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('X-Tenant', 'piano')
  return { ...init, headers: Object.fromEntries(headers) }
}

export function bearer(token: string | null | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {}
}
