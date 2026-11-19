import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMyPosition, getRanking, registerUse, reportCollection } from '../ranking'

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

describe('ranking — contrato /v1/custom', () => {
  beforeEach(() => { delete import.meta.env.VITE_PALCO_API_URL })
  afterEach(() => { vi.unstubAllGlobals() })

  it('getRanking: GET /ranking?window= e lê data', async () => {
    const entries = [{ position: 1, user_id: 3, display_name: 'Ana', total: 40 }]
    const f = respond({ data: entries })
    vi.stubGlobal('fetch', f)
    expect(await getRanking('week')).toEqual(entries)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/ranking?window=week')
    expect(f.mock.calls[0][1].headers).toMatchObject({ 'x-tenant': 'piano' })
  })

  it('getRanking: base configurada; erro, sem data ou rede → []', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.test'
    const f = respond({}, false)
    vi.stubGlobal('fetch', f)
    expect(await getRanking('all')).toEqual([])
    expect(f.mock.calls[0][0]).toBe('https://api.test/v1/custom/ranking?window=all')
    vi.stubGlobal('fetch', respond({}))
    expect(await getRanking('all')).toEqual([])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await getRanking('all')).toEqual([])
  })

  it('getMyPosition: GET /ranking/me com Bearer; nulos viram defaults', async () => {
    const f = respond({ position: 4, total: 30 })
    vi.stubGlobal('fetch', f)
    expect(await getMyPosition('week', 'tok')).toEqual({ position: 4, total: 30 })
    expect(f.mock.calls[0][0]).toBe('/v1/custom/ranking/me?window=week')
    expect(f.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer tok' })
    vi.stubGlobal('fetch', respond({ position: null, total: null }))
    expect(await getMyPosition('week', 'tok')).toEqual({ position: null, total: 0 })
  })

  it('getMyPosition: sem token, erro ou rede → vazio', async () => {
    expect(await getMyPosition('week', null)).toEqual({ position: null, total: 0 })
    vi.stubGlobal('fetch', respond({}, false))
    expect(await getMyPosition('week', 'tok')).toEqual({ position: null, total: 0 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await getMyPosition('week', 'tok')).toEqual({ position: null, total: 0 })
  })

  it('registerUse: POST /collections/{id}/use', async () => {
    const f = respond({ first_use: true })
    vi.stubGlobal('fetch', f)
    expect(await registerUse(7, 'tok')).toBe(true)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/collections/7/use')
    expect(f.mock.calls[0][1].method).toBe('POST')
    expect(await registerUse(7, null)).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await registerUse(7, 'tok')).toBe(false)
  })

  it('reportCollection: POST /collections/{id}/report com {reason}', async () => {
    const f = respond({ ok: true })
    vi.stubGlobal('fetch', f)
    expect(await reportCollection(7, 'Spam', 'tok')).toBe(true)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/v1/custom/collections/7/report')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ reason: 'Spam' })
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'application/json', 'x-tenant': 'piano' })
  })

  it('reportCollection: sem token, HTTP de erro ou rede → false', async () => {
    expect(await reportCollection(7, 'x', null)).toBe(false)
    vi.stubGlobal('fetch', respond({}, false))
    expect(await reportCollection(7, 'x', 'tok')).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await reportCollection(7, 'x', 'tok')).toBe(false)
  })
})
