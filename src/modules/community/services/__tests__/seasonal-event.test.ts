import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSeasonalEvent } from '../seasonal-event'

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

describe('seasonal-event — contrato /v1/custom', () => {
  beforeEach(() => { delete import.meta.env.VITE_PALCO_API_URL })
  afterEach(() => { vi.unstubAllGlobals() })

  it('GET /seasonal-event ativo → banner', async () => {
    const f = respond({ active: true, name: 'Semana do Hinário', description: '2x', multiplier: 2 })
    vi.stubGlobal('fetch', f)
    expect(await getSeasonalEvent()).toEqual({ name: 'Semana do Hinário', description: '2x', multiplier: 2 })
    expect(f.mock.calls[0][0]).toBe('/v1/custom/seasonal-event')
  })

  it('sem descrição/multiplicador usa defaults', async () => {
    vi.stubGlobal('fetch', respond({ active: true, name: 'E' }))
    expect(await getSeasonalEvent()).toEqual({ name: 'E', description: null, multiplier: 1 })
  })

  it.each([
    ['inativo', () => respond({ active: false })],
    ['HTTP de erro', () => respond({}, false)],
    ['rede caiu', () => vi.fn().mockRejectedValue(new Error('x'))],
  ])('%s → null', async (_label, make) => {
    vi.stubGlobal('fetch', make())
    expect(await getSeasonalEvent()).toBeNull()
  })
})
