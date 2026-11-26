/** Identificador revogável do web; chaves distintas para staging e produção. */
export const PARTNER_KEY_HEADER = 'X-Partner-Key'

type EnvBag = Record<string, string | undefined>
const PRODUCTION_HOST = 'api.pianolouvorja.com.br'
const STAGING_HOST = 'api-stg.pianolouvorja.com.br'

/** Somente a API Piano recebe a chave, nunca upstream, CDN ou Google/Firebase. */
export function isPianoApiUrl(url: URL): boolean {
  if (url.username || url.password) return false
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  return (url.protocol === 'https:' || (local && url.protocol === 'http:'))
    && (local || url.hostname === PRODUCTION_HOST || url.hostname === STAGING_HOST)
}

/** A URL efetiva seleciona o ambiente, inclusive ao alternar entre origens. */
export function partnerKeyForUrl(
  url: string,
  env: EnvBag = import.meta.env,
): string {
  try {
    const parsed = new URL(url)
    if (!isPianoApiUrl(parsed)) return ''
    const override = (env.VITE_PARTNER_KEY ?? '').trim()
    const configured = parsed.hostname === PRODUCTION_HOST
      ? env.VITE_PARTNER_KEY_PROD
      : env.VITE_PARTNER_KEY_STG
    const key = override || (configured ?? '').trim()
    return key.startsWith('plj_') ? key : ''
  } catch {
    return ''
  }
}
