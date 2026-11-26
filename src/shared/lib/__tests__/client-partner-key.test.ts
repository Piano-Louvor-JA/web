import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let send: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('__APP_VERSION__', '1.27.0')
  vi.stubEnv('VITE_APP_VERSION', '')
  vi.stubEnv('VITE_URL_DATABASE', 'https://api-stg.pianolouvorja.com.br/json_db')
  vi.stubEnv('VITE_PALCO_API_URL', '')
  vi.stubEnv('VITE_API_FALLBACK_URLS', '')
  vi.stubEnv('VITE_PARTNER_KEY', '')
  vi.stubEnv('VITE_PARTNER_KEY_STG', 'plj_web_stg_teste')
  vi.stubEnv('VITE_PARTNER_KEY_PROD', 'plj_web_prod_teste')
  send = vi.fn().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', send)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function install() {
  const { installClientPlatformHeader } = await import('../client-platform')
  installClientPlatformHeader()
  return installClientPlatformHeader
}

it('envia a chave de staging com plataforma, versão e autenticação existentes', async () => {
  await install()
  await fetch('https://api-stg.pianolouvorja.com.br/v1/custom', {
    method: 'POST', body: 'conteúdo', headers: { Authorization: 'Bearer sessão', 'Api-Token': 'legado' },
  })
  const [url, init] = send.mock.calls[0] ?? []
  expect(url).toBe('https://api-stg.pianolouvorja.com.br/v1/custom')
  expect(init.method).toBe('POST')
  expect(init.body).toBe('conteúdo')
  expect(Object.fromEntries(init.headers)).toMatchObject({
    'x-partner-key': 'plj_web_stg_teste', 'x-client-platform': 'web',
    'x-client-version': '1.27.0', authorization: 'Bearer sessão', 'api-token': 'legado',
  })
})

it('identifica a API Piano mesmo quando a outra origem está configurada', async () => {
  await install()
  await fetch(new URL('https://api.pianolouvorja.com.br/v1/liturgy'))
  expect(send.mock.lastCall?.[1].headers.get('X-Partner-Key')).toBe('plj_web_prod_teste')
  expect(send.mock.lastCall?.[1].headers.get('X-Client-Platform')).toBe('web')
})

it('preserva Request, identidade explícita, body e instalação única', async () => {
  const installAgain = await install()
  const wrapper = fetch
  installAgain()
  expect(fetch).toBe(wrapper)
  const request = new Request('https://api-stg.pianolouvorja.com.br/v1/custom', {
    method: 'POST', body: 'conteúdo', headers: { 'x-partner-key': 'plj_explicita', 'X-Client-Version': 'custom' },
  })
  await fetch(request)
  expect(send.mock.lastCall?.[0]).toBe(request)
  expect(send.mock.lastCall?.[1].headers.get('X-Partner-Key')).toBe('plj_explicita')
  expect(send.mock.lastCall?.[1].headers.get('X-Client-Version')).toBe('custom')
  expect(await request.text()).toBe('conteúdo')
})

it('respeita os headers de init ao receber um Request', async () => {
  await install()
  await fetch(new Request('https://api-stg.pianolouvorja.com.br/v1', {
    headers: { 'X-Partner-Key': 'plj_request' },
  }), { headers: { Authorization: 'Bearer init' } })
  const headers = send.mock.lastCall?.[1].headers
  expect(headers.get('X-Partner-Key')).toBe('plj_web_stg_teste')
  expect(headers.get('Authorization')).toBe('Bearer init')
})

it.each(['https://api.louvorja.com.br/db/manifest.json', 'https://googleapis.com/auth',
  'https://api.pianolouvorja.com.br.example.com/v1'])('não envia a chave para %s', async url => {
  await install()
  await fetch(url)
  expect(new Headers(send.mock.lastCall?.[1]?.headers).has('X-Partner-Key')).toBe(false)
})

it('não injeta headers em no-cors, mesmo com chave configurada', async () => {
  await install()
  const init = { mode: 'no-cors' as const }
  await fetch('https://api-stg.pianolouvorja.com.br/file/teste', init)
  expect(send.mock.lastCall?.[1]).toBe(init)
})

it('continua identificando o web sem chave configurada', async () => {
  vi.stubEnv('VITE_PARTNER_KEY_STG', '')
  await install()
  await fetch('https://api-stg.pianolouvorja.com.br/v1')
  expect(send.mock.lastCall?.[1].headers.has('X-Partner-Key')).toBe(false)
  expect(send.mock.lastCall?.[1].headers.get('X-Client-Platform')).toBe('web')
})
