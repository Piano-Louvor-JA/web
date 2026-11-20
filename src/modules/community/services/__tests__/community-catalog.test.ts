import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createCollection: vi.fn(() => ({ id: -5 })),
  createMusic: vi.fn(),
}))
vi.mock('@/modules/auth/services/auth-client', () => ({ getAuthSession: mocks.session }))
vi.mock('@/modules/media/services/local-custom-store', () => ({
  createLocalCollection: mocks.createCollection,
  createLocalMusic: mocks.createMusic,
}))

import { listCommunityCollectionsPage, saveCommunityCopy } from '../community-catalog'

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

const row = {
  id_collection: 7,
  name: 'Hinos de louvor',
  description: 'Sábado',
  author_name: 'Rafael',
  owner_id: 2,
  musics_count: 12,
  cover_url: null,
  created_at: '2026-09-01 00:00:00',
}

describe('community-catalog — contrato /v1/custom', () => {
  beforeEach(() => {
    mocks.session.mockReturnValue(null)
    delete import.meta.env.VITE_PALCO_API_URL
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('lista GET /v1/custom/collections e mapeia {data, meta}', async () => {
    const f = respond({ data: [row], meta: { page: 2, last_page: 3, total: 50 } })
    vi.stubGlobal('fetch', f)
    const page = await listCommunityCollectionsPage(2, 24)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/collections?page=2&per_page=24')
    expect(f.mock.calls[0][1].headers).toMatchObject({ 'x-tenant': 'piano' })
    expect(page).toEqual({
      items: [{
        id: 7, name: 'Hinos de louvor', description: 'Sábado', authorName: 'Rafael',
        authorId: 2, musicsCount: 12, coverUrl: null, createdAt: '2026-09-01 00:00:00',
      }],
      page: 2, lastPage: 3, total: 50,
    })
  })

  it('com sessão manda Bearer (a API esconde autores bloqueados)', async () => {
    mocks.session.mockReturnValue({ token: 'tok' })
    const f = respond({ data: [] })
    vi.stubGlobal('fetch', f)
    await listCommunityCollectionsPage(1, 24)
    expect(f.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('usa VITE_PALCO_API_URL sem barra dupla e trata dono ausente/campos inválidos', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.test/'
    const f = respond({ data: [{ id_collection: 1, owner_id: null, musics_count: 'x' }] })
    vi.stubGlobal('fetch', f)
    const page = await listCommunityCollectionsPage(1, 10)
    expect(f.mock.calls[0][0]).toBe('https://api.test/v1/custom/collections?page=1&per_page=10')
    expect(page.items[0]).toMatchObject({ authorId: null, musicsCount: 0, name: '', authorName: null })
    expect(page.total).toBe(1)
  })

  it.each([
    ['HTTP de erro', () => respond({}, false)],
    ['sem data', () => respond({ meta: {} })],
    ['rede caiu', () => vi.fn().mockRejectedValue(new Error('x'))],
  ])('%s → página vazia', async (_label, make) => {
    vi.stubGlobal('fetch', make())
    expect(await listCommunityCollectionsPage(3, 24)).toEqual({ items: [], page: 3, lastPage: 1, total: 0 })
  })

  it('salvar cópia: busca as músicas e cria coletânea + músicas locais', async () => {
    const f = respond({ data: [{ name: 'Santo', official_music_id: 12 }, { name: 'Livre', official_music_id: null }] })
    vi.stubGlobal('fetch', f)
    const id = await saveCommunityCopy({
      id: 7, name: 'Hinos', description: null, authorName: null, authorId: 2,
      musicsCount: 2, coverUrl: null, createdAt: null,
    })
    expect(id).toBe(-5)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/collections/7/musics')
    expect(mocks.createCollection).toHaveBeenCalledWith('Hinos', undefined)
    expect(mocks.createMusic).toHaveBeenNthCalledWith(1, -5, { name: 'Santo', officialMusicId: 12 })
    expect(mocks.createMusic).toHaveBeenNthCalledWith(2, -5, { name: 'Livre', officialMusicId: undefined })
  })

  it.each([
    ['HTTP de erro', () => respond({}, false)],
    ['sem data', () => respond({})],
    ['rede caiu', () => vi.fn().mockRejectedValue(new Error('x'))],
  ])('salvar cópia com %s → null e nada local', async (_label, make) => {
    vi.stubGlobal('fetch', make())
    const c = { id: 7, name: 'H', description: 'd', authorName: null, authorId: null, musicsCount: 0, coverUrl: null, createdAt: null }
    expect(await saveCommunityCopy(c)).toBeNull()
    expect(mocks.createCollection).not.toHaveBeenCalled()
  })
})
