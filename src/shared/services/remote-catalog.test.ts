import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/api-fallback', () => ({
  fetchWithApiFallback: vi.fn(),
}))

import * as apiFallback from '@shared/services/api-fallback'

const mockedFallback = vi.mocked(apiFallback.fetchWithApiFallback)

import {
  fetchRemoteCatalogJson,
  readOrFetchCatalogJson,
  resolveDatabaseUrl,
} from './remote-catalog'

const mockedFetch = vi.fn()
vi.stubGlobal('fetch', mockedFetch)

function reply(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('remote-catalog', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockedFetch.mockReset()
    mockedFallback.mockReset()
    // default: fallback devolve payload genérico (testes específicos sobrescrevem)
    mockedFallback.mockResolvedValue({ data: { from: 'fallback-default' }, base: 'x' })
  })

  it('resolveDatabaseUrl junta base + path com barra', () => {
    expect(resolveDatabaseUrl('pt_musics.json')).toContain('/json_db/pt_musics.json')
    expect(resolveDatabaseUrl('/pt_musics.json')).toContain('/json_db/pt_musics.json')
  })

  it('fetch 200 → retorna dados e cacheia na sessão', async () => {
    mockedFetch.mockResolvedValue(reply(200, { items: [1] }))
    const data = await fetchRemoteCatalogJson('arquivo_ok.json', 0)
    expect(data).toEqual({ items: [1] })
    // cache: 2ª leitura sem fetch
    const cached = await readOrFetchCatalogJson('arquivo_ok.json')
    expect(cached).toEqual({ items: [1] })
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('429 → retry com backoff', async () => {
    mockedFetch
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, { ok: true }))
    const data = await fetchRemoteCatalogJson('ratelimit.json', 1, 1)
    expect(data).toEqual({ ok: true })
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })

  it('500 com retries → esgota e cai no fallback', async () => {
    mockedFetch.mockResolvedValue(reply(500))
    mockedFallback.mockResolvedValue({ data: { fallback: true } })
    const data = await fetchRemoteCatalogJson('erro500.json', 1, 1)
    expect(data).toEqual({ fallback: true })
  })

  it('404 sem retries → catch → fallback de domínios', async () => {
    mockedFetch.mockResolvedValue(reply(404))
    const data = await fetchRemoteCatalogJson('nada.json', 0)
    expect(data).toEqual({ from: 'fallback-default' })
  })

  it('rede fora (Failed to fetch) → retry e cai no fallback', async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    mockedFallback.mockResolvedValue({ data: { via: 'fallback' } })
    const data = await fetchRemoteCatalogJson('rede-fora.json', 1, 1)
    expect(data).toEqual({ via: 'fallback' })
  })

  it('readOrFetchCatalogJson: erro total → null (nunca crasha chamador)', { timeout: 20000 }, async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    mockedFallback.mockRejectedValue(new Error('fallback morto'))
    const res = await readOrFetchCatalogJson('tudo-fora.json')
    expect(res).toBeNull()
  })

  it('readOrFetchCatalogJson: cache presente nem chama rede', async () => {
    sessionStorage.setItem(
      'db:cached.json',
      JSON.stringify({ do: 'cache' }),
    )
    const res = await readOrFetchCatalogJson('cached.json')
    expect(res).toEqual({ do: 'cache' })
    expect(mockedFetch).not.toHaveBeenCalled()
  })

describe('remote-catalog — caudas', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockedFetch.mockReset()
    mockedFallback.mockReset()
    mockedFallback.mockResolvedValue({ data: { from: 'fallback-default' }, base: 'x' })
  })

  it('Api-Token presente → header vai no fetch', async () => {
    vi.stubEnv('VITE_API_TOKEN', 'tok-123')
    mockedFetch.mockResolvedValue(reply(200, { ok: 1 }))
    await fetchRemoteCatalogJson('com-token.json', 0)
    const init = mockedFetch.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['Api-Token']).toBe('tok-123')
    vi.unstubAllEnvs()
  })

  it('erro não-Error (string lançada) → fallback ainda funciona', async () => {
    mockedFetch.mockRejectedValue('falha-pura-string')
    const data = await fetchRemoteCatalogJson('string-erro.json', 0)
    expect(data).toEqual({ from: 'fallback-default' })
  })
})

describe('remote-catalog — retry seletivo', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockedFetch.mockReset()
    mockedFallback.mockReset()
    mockedFallback.mockResolvedValue({ data: { from: 'fallback-default' }, base: 'x' })
  })

  it('retries>0 mas erro NÃO-retryable (parse) → cai pro fallback sem re-tentar', async () => {
    mockedFetch.mockRejectedValue(new Error('Unexpected token < in JSON'))
    const t0 = Date.now()
    const data = await fetchRemoteCatalogJson('parse-erro.json', 2, 10)
    expect(data).toEqual({ from: 'fallback-default' })
    // sem retries: só 1 fetch (sem delay de backoff)
    expect(Date.now() - t0).toBeLessThan(500)
  })

})
})
