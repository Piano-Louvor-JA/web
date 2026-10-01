import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiCandidateBases, fetchWithApiFallback } from '../api-fallback'

// Contrato (web#131, commit 2a7cfe6): zero hardcoded, zero default.
// Primária = VITE_URL_DATABASE/VITE_URL_FILES; fallbacks = VITE_API_FALLBACK_URLS.
// Env vazia = lista vazia. Os testes stubam import.meta.env direto.

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, unknown>)[key]
  } else {
    ;(import.meta.env as Record<string, unknown>)[key] = value
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  for (const key of ['VITE_URL_DATABASE', 'VITE_URL_FILES', 'VITE_API_TOKEN', 'VITE_API_FALLBACK_URLS']) {
    setEnv(key, undefined)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiCandidateBases', () => {
  it('sem env nenhuma: lista vazia (falha cedo e explícita)', () => {
    expect(apiCandidateBases('database')).toEqual([])
  })

  it('só primária: lista com 1, sem fallback', () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    expect(apiCandidateBases('database')).toEqual(['https://api.pianolouvorja.com.br/json_db'])
  })

  it('primária + fallbacks: ordem preservada, sem duplicar host da primária', () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    setEnv(
      'VITE_API_FALLBACK_URLS',
      'https://api.pianolouvorja.com.br, https://api.louvorja.com.br ,https://api.louvorja.workers.dev/',
    )
    expect(apiCandidateBases('database')).toEqual([
      'https://api.pianolouvorja.com.br/json_db',
      'https://api.louvorja.com.br/json_db',
      'https://api.louvorja.workers.dev/json_db',
    ])
  })

  it('env de dev local (127.0.0.1) + fallbacks da env', () => {
    setEnv('VITE_URL_DATABASE', 'http://127.0.0.1:3100/json_db')
    setEnv('VITE_API_FALLBACK_URLS', 'https://api.louvorja.com.br')
    const bases = apiCandidateBases('database')
    expect(bases[0]).toBe('http://127.0.0.1:3100/json_db')
    expect(bases).toHaveLength(2)
  })

  it('fallbacks sozinhos (sem primária) entram como candidatas', () => {
    setEnv('VITE_API_FALLBACK_URLS', 'https://api.louvorja.com.br')
    expect(apiCandidateBases('files')).toEqual(['https://api.louvorja.com.br/file'])
  })
})

describe('fetchWithApiFallback', () => {
  it('primária ok: nem tenta fallback', async () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories')
    expect(data).toEqual({ ok: 1 })
    expect(base).toBe('https://api.pianolouvorja.com.br/json_db')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('primária fora (rede) → cai pro fallback da env', async () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    setEnv('VITE_API_FALLBACK_URLS', 'https://api.louvorja.com.br')
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 2 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 2 })
    expect(base).toBe('https://api.louvorja.com.br/json_db')
  })

  it('primária e fallback 1 fora → fallback 2 atende', async () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    setEnv(
      'VITE_API_FALLBACK_URLS',
      'https://api.louvorja.com.br,https://api.louvorja.workers.dev',
    )
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 3 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_musics', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 3 })
    expect(base).toBe('https://api.louvorja.workers.dev/json_db')
  })

  it('todas caídas: propaga o último erro', async () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    setEnv('VITE_API_FALLBACK_URLS', 'https://api.louvorja.com.br,https://api.louvorja.workers.dev')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      fetchWithApiFallback('database', 'pt_categories', { retries: 0 }),
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('404 definitivo na primária também migra de host (catálogo pode divergir)', async () => {
    setEnv('VITE_URL_DATABASE', 'https://api.pianolouvorja.com.br/json_db')
    setEnv('VITE_API_FALLBACK_URLS', 'https://api.louvorja.com.br')
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 9 }), { status: 200 }))
    const { data, base } = await fetchWithApiFallback('database', 'pt_categories', {
      retries: 0,
    })
    expect(data).toEqual({ ok: 9 })
    expect(base).toBe('https://api.louvorja.com.br/json_db')
  })

  it('sem env: rejeita cedo (nenhuma candidata)', async () => {
    await expect(
      fetchWithApiFallback('database', 'pt_categories', { retries: 0 }),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
