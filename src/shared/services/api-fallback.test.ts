import { beforeAll, beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

/**
 * api-fallback: cascata primária + fallbacks vindos EXCLUSIVAMENTE da env,
 * com token opcional e retry/backoff na mesma base (429).
 */

function mockFetchSequenced(responses: Array<() => Promise<Response>>) {
  const impl = vi.fn()
  responses.forEach((r) => impl.mockImplementationOnce(r))
  vi.stubGlobal('fetch', impl)
  return impl
}

const ok = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let mod: typeof import('./api-fallback')

beforeAll(async () => {
  mod = await import('./api-fallback')
})

describe('apiCandidateBases', () => {
  it('sem env nenhuma → [] (sem hardcoded, sem default)', () => {
    vi.stubEnv('VITE_URL_DATABASE', '')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    expect(mod.apiCandidateBases('database')).toEqual([])
  })

  it('primária + fallbacks (sem duplicar host, path por kind)', () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://primary.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://primary.com/outro, https://backup.com/, https://third.com')
    const bases = mod.apiCandidateBases('database')
    expect(bases).toEqual([
      'https://primary.com/json_db',
      'https://backup.com/json_db',
      'https://third.com/json_db',
    ])
    // files usa /file
    vi.stubEnv('VITE_URL_FILES', 'https://primary.com/file')
    expect(mod.apiCandidateBases('files')[0]).toBe('https://primary.com/file')
    expect(mod.apiCandidateBases('files')[1]).toBe('https://backup.com/file')
  })

  it('fallback igual ao host da primária é descartado', () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://a.com/x')
    expect(mod.apiCandidateBases('database')).toEqual(['https://a.com/json_db'])
  })
})

describe('fetchWithApiFallback', () => {
  it('primária OK → {data, base} e nem toca fallbacks', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    const f = mockFetchSequenced([() => ok({ hi: 1 })])
    const res = await mod.fetchWithApiFallback('database', 'pt_musics.json', { retries: 0 })
    expect(res).toEqual({ data: { hi: 1 }, base: 'https://a.com/json_db' })
    expect(f).toHaveBeenCalledTimes(1)
    // path com barra já presente não duplica
    expect(String(f.mock.calls[0][0]).split('?')[0]).toBe(
      'https://a.com/json_db/pt_musics.json',
    )
  })

  it('primária 500 → migra pro fallback; data volta com base do fallback', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    const f = mockFetchSequenced([
      () => Promise.resolve(new Response('boom', { status: 500 })),
      () => ok({ from: 'b' }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'x.json', { retries: 0, delayMs: 1 })
    expect(res).toEqual({ data: { from: 'b' }, base: 'https://b.com/json_db' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('erro de rede (TypeError) também migra de base', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    mockFetchSequenced([
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => ok({ ok: true }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'y.json', { retries: 0, delayMs: 1 })
    expect(res.data).toEqual({ ok: true })
  })

  it('todas as bases falham → throw do último erro', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    mockFetchSequenced([
      () => Promise.resolve(new Response('x', { status: 500 })),
      () => Promise.reject(new Error('dead')),
    ])
    await expect(
      mod.fetchWithApiFallback('database', 'z.json', { retries: 0, delayMs: 1 }),
    ).rejects.toThrow('dead')
  })

  it('Api-Token da env vai no header quando presente', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    vi.stubEnv('VITE_API_TOKEN', 'segredo-do-token')
    const f = mockFetchSequenced([() => ok({})])
    await mod.fetchWithApiFallback('database', 'w.json', { retries: 0 })
    expect(f.mock.calls[0][1]).toMatchObject({
      headers: { 'Api-Token': 'segredo-do-token' },
    })
  })

  it('sem token → headers undefined', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    vi.stubEnv('VITE_API_TOKEN', '')
    const f = mockFetchSequenced([() => ok({})])
    await mod.fetchWithApiFallback('database', 'v.json', { retries: 0 })
    expect(f.mock.calls[0][1]).toEqual({ headers: undefined })
  })

describe('fetchWithApiFallback — retries e backoff', () => {
  it('429 respeita retry na MESMA base (rate limit é por host)', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    const f = mockFetchSequenced([
      () => Promise.resolve(new Response('', { status: 429 })),
      () => ok({ finally: true }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'r.json', { retries: 2, delayMs: 1 })
    expect(res.data).toEqual({ finally: true })
    expect(f).toHaveBeenCalledTimes(2)
    // mesma URL nas duas tentativas
    expect(f.mock.calls[0][0]).toBe(f.mock.calls[1][0])
  })

  it('429 acima do retry → lança e MIGRA de base', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', 'https://b.com')
    const f = mockFetchSequenced([
      () => Promise.resolve(new Response('', { status: 429 })),
      () => ok({ from: 'b' }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'r2.json', { retries: 0, delayMs: 1 })
    expect(res.data).toEqual({ from: 'b' })
    expect(String(f.mock.calls[1][0]).startsWith('https://b.com')).toBe(true)
  })

  it('5xx com retries → tenta a mesma base de novo antes de migrar', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    const f = mockFetchSequenced([
      () => Promise.resolve(new Response('', { status: 502 })),
      () => ok({ recovered: true }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'r3.json', { retries: 1, delayMs: 1 })
    expect(res.data).toEqual({ recovered: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('rede fora com retries → backoff na mesma base, depois lança', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    const f = mockFetchSequenced([
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ])
    await expect(
      mod.fetchWithApiFallback('database', 'r4.json', { retries: 1, delayMs: 1 }),
    ).rejects.toThrow('Failed to fetch')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('NetworkError (webkit) também é tratado como rede', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    const f = mockFetchSequenced([
      () => Promise.reject(new Error('NetworkError: connection lost')),
      () => ok({ webkit: true }),
    ])
    const res = await mod.fetchWithApiFallback('database', 'r5.json', { retries: 1, delayMs: 1 })
    expect(res.data).toEqual({ webkit: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('path sem barra inicial recebe /; com barra fica intacto', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    const f = mockFetchSequenced([() => ok({}), () => ok({})])
    await mod.fetchWithApiFallback('database', 'sem-barra.json', { retries: 0 })
    await mod.fetchWithApiFallback('database', '/com-barra.json', { retries: 0 })
    expect(String(f.mock.calls[0][0])).toContain('/sem-barra.json')
    expect(String(f.mock.calls[1][0])).toContain('/com-barra.json')
    expect(String(f.mock.calls[1][0])).not.toContain('//com-barra')
  })
})

describe('fetchWithApiFallback — caudas', () => {
  it('erro lançado como string → message via String(error)', async () => {
    vi.stubEnv('VITE_URL_DATABASE', 'https://a.com/json_db')
    vi.stubEnv('VITE_API_FALLBACK_URLS', '')
    mockFetchSequenced([
      () => Promise.reject('texto-puro'),
    ])
    await expect(
      mod.fetchWithApiFallback('database', 's.json', { retries: 0 }),
    ).rejects.toBe('texto-puro')
  })
})
})
