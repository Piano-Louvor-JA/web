import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSeasonalEvent } from '../seasonal-event'

describe('seasonal-event service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // reset env
    delete import.meta.env.VITE_PALCO_API_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna o evento quando a API responde ok', async () => {
    const payload = {
      name: 'Semana do Hinário',
      description: '2x pontos',
      multiplier: 2,
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )

    await expect(getSeasonalEvent()).resolves.toEqual(payload)
    // sem VITE_PALCO_API_URL, usa caminho relativo
    expect(fetch).toHaveBeenCalledWith('/v1/community/seasonal-event')
  })

  it('retorna null quando a API responde erro (não tenta parsear JSON)', async () => {
    // 500 com body válido — se tentar res.json() retorna objeto, não null
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'Should not parse' }), { status: 500 }),
    )

    await expect(getSeasonalEvent()).resolves.toBeNull()
  })

  it('retorna null quando a API responde 404 (não tenta parsear JSON)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'Should not parse' }), { status: 404 }),
    )

    await expect(getSeasonalEvent()).resolves.toBeNull()
  })

  it('retorna null quando o fetch lança', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

    await expect(getSeasonalEvent()).resolves.toBeNull()
  })

  it('usa VITE_PALCO_API_URL quando definida (com barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com/'
    const payload = { name: 'Event', description: null, multiplier: 1 }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )

    const result = await getSeasonalEvent()
    expect(result).toEqual(payload)
    // remove barra final da base URL
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/seasonal-event')
  })

  it('usa VITE_PALCO_API_URL quando definida (sem barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com'
    const payload = { name: 'Event', description: null, multiplier: 1 }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )

    const result = await getSeasonalEvent()
    expect(result).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/seasonal-event')
  })

  it('retorna null quando VITE_PALCO_API_URL é string vazia', async () => {
    import.meta.env.VITE_PALCO_API_URL = ''
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'X', description: null, multiplier: 1 }), { status: 200 }),
    )

    const result = await getSeasonalEvent()
    expect(result).toEqual({ name: 'X', description: null, multiplier: 1 })
    // string vazia é falsy, usa fallback
    expect(fetch).toHaveBeenCalledWith('/v1/community/seasonal-event')
  })
})