import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiCandidateBases, fetchWithApiFallback } from '../api-fallback'

// mock de import.meta.env — os módulos leem direto de import.meta.env
const envMock = { env: {} as Record<string, string> }

vi.mock('import.meta.env', () => envMock)

// stub de import.meta.env via Object.defineProperty (vitest não deixa escrever direto)
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

const fetchMock = vi.fn()

const PRIMARY_DB = 'https://api.pianolouvorja.com.br/json_db'
const PRIMARY_FILES = 'https://api.pianolouvorja.com.br/file'
const HOST_LOUVORJA = 'https://api.louvorja.com.br'
const HOST_WORKERS = 'https://api.louvorja.workers.dev'
const FALLBACK_HOSTS = `${HOST_LOUVORJA},${HOST_WORKERS}`

function setCascadeEnv() {
  setEnv('VITE_URL_DATABASE', PRIMARY_DB)
  setEnv('VITE_API_FALLBACK_URLS', FALLBACK_HOSTS)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setEnv('VITE_URL_DATABASE', undefined)
  setEnv('VITE_URL_FILES', undefined)
  setEnv('VITE_API_TOKEN', undefined)
  setEnv('VITE_API_FALLBACK_URLS', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiCandidateBases', () => {
  it('sem env: lista vazia (sem primária e sem fallback hardcoded)', () => {
    expect(apiCandidateBases('database')).toEqual([])
  })

  it('env apontando pra primária não duplica host no fallback', () => {
    setEnv('VITE_URL_FILES', PRIMARY_FILES)
    setEnv('VITE_API_FALLBACK_URLS', `https://api.pianolouvorja.com.br,${HOST_LOUVORJA}`)
    const bases = apiCandidateBases('files')
    expect(bases).toEqual([PRIMARY_FILES, `${HOST_LOUVORJA}/file`])
  })

  it('primária igual a um fallback: entra uma vez e mantém os outros hosts', () => {
    setEnv('VITE_URL_DATABASE', `${HOST_LOUVORJA}/json_db`)
    setEnv('VITE_API_FALLBACK_URLS', FALLBACK_HOSTS)
    expect(apiCandidateBases('database')).toEqual([
      `${HOST_LOUVORJA}/json_db`,
      `${HOST_WORKERS}/json_db`,
    ])
  })

  it('env de dev local mantém os fallbacks configurados', () => {
    setEnv('VITE_URL_DATABASE', 'http://127.0.0.1:3100/json_db')
    setEnv('VITE_API_FALLBACK_URLS', FALLBACK_HOSTS)
    expect(apiCandidateBases('database')).toEqual([
      'http://127.0.0.1:3100/json_db',
      `${HOST_LOUVORJA}/json_db`,
      `${HOST_WORKERS}/json_db`,
    ])
  })
})

describe('fetchWithApiFallback', () => {
  beforeEach(() => {
    setCascadeEnv()
  })

  it('primária ok: nem tenta fallback', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories')
    expect(data).toEqual({ ok: 1 })
    expect(base).toContain('pianolouvorja')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('primária fora (rede) → cai pra api.louvorja.com.br', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 2 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 2 })
    expect(base).toContain('api.louvorja.com.br')
  })

  it('primária e fallback 1 fora → workers.dev atende', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 3 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_musics', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 3 })
    expect(base).toContain('workers.dev')
  })

  it('todas caídas: propaga o último erro', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      fetchWithApiFallback('database', 'pt_categories', { retries: 0 }),
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('404 definitivo na primária também migra de host (catálogo pode divergir)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 9 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 9 })
    expect(base).toContain('api.louvorja.com.br')
  })
})
