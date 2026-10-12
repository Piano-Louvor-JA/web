import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCustomMusic } from '../custom-catalog'

function fetchMock(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createCustomMusic — dedup .slja (web#187, paridade app#336 fase 3)', () => {
  it('envia client_uuid no body quando informado', async () => {
    const mock = fetchMock(201, { id_music: 42 })
    vi.stubGlobal('fetch', mock)

    const result = await createCustomMusic(7, {
      name: 'Hino X',
      client_uuid: '00112233-4455-6677-8899-aabbccddeeff',
    })

    expect(result).toEqual({ id: 42, existed: false })
    const [, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Hino X',
      client_uuid: '00112233-4455-6677-8899-aabbccddeeff',
    })
  })

  it('200 = já existia (mesmo owner+client_uuid) → existed: true (re-import vira no-op)', async () => {
    vi.stubGlobal('fetch', fetchMock(200, { id_music: 42 }))

    const result = await createCustomMusic(7, {
      name: 'Hino X',
      client_uuid: '00112233-4455-6677-8899-aabbccddeeff',
    })

    expect(result).toEqual({ id: 42, existed: true })
  })

  it('sem client_uuid segue funcionando (existed: false no 201)', async () => {
    vi.stubGlobal('fetch', fetchMock(201, { id_music: 9 }))

    const result = await createCustomMusic(7, { name: 'Nova' })

    expect(result).toEqual({ id: 9, existed: false })
  })
})
