import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listCommunityCollectionsPage,
  saveCommunityCopy,
  type CommunityCollectionSummary,
} from '../community-catalog'
import { getAuthSession } from '@/modules/auth/services/auth-client'

vi.mock('@/modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))

const mockedSession = vi.mocked(getAuthSession)

const sampleCollection: CommunityCollectionSummary = {
  id: 7,
  name: 'Hinos de louvor',
  authorName: 'Rafael',
  authorId: 1,
  musicsCount: 12,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00Z',
}

describe('community-catalog service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockedSession.mockReset()
    delete import.meta.env.VITE_PALCO_API_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('listCommunityCollectionsPage', () => {
    it('retorna a página quando a API responde ok', async () => {
      const payload = {
        items: [sampleCollection],
        page: 1,
        lastPage: 3,
        total: 30,
      }
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )

      await expect(listCommunityCollectionsPage(1, 20)).resolves.toEqual(payload)
      expect(fetch).toHaveBeenCalledWith(
        '/v1/community/collections?page=1&per_page=20',
      )
    })

    it('retorna página vazia quando a API responde erro 500 (não tenta parsear JSON)', async () => {
      // body válido — se mutant remover if (!res.ok), parseia e retorna items, não página vazia
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: 99 }] }), { status: 500 }),
      )

      await expect(listCommunityCollectionsPage(2, 20)).resolves.toEqual({
        items: [],
        page: 2,
        lastPage: 1,
        total: 0,
      })
    })

    it('retorna página vazia quando a API responde erro 404 (não tenta parsear JSON)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: 99 }] }), { status: 404 }),
      )

      await expect(listCommunityCollectionsPage(2, 20)).resolves.toEqual({
        items: [],
        page: 2,
        lastPage: 1,
        total: 0,
      })
    })

    it('usa VITE_PALCO_API_URL quando definida (com barra final)', async () => {
      import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com/'
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], page: 1, lastPage: 1, total: 0 }), { status: 200 }),
      )

      const result = await listCommunityCollectionsPage(1, 24)
      expect(result.items).toEqual([])
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/collections?page=1&per_page=24')
    })

    it('usa VITE_PALCO_API_URL quando definida (sem barra final)', async () => {
      import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com'
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], page: 1, lastPage: 1, total: 0 }), { status: 200 }),
      )

      const result = await listCommunityCollectionsPage(1, 24)
      expect(result.items).toEqual([])
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/collections?page=1&per_page=24')
    })

    it('retorna página vazia quando VITE_PALCO_API_URL é string vazia (falsy)', async () => {
      import.meta.env.VITE_PALCO_API_URL = ''
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [sampleCollection] }), { status: 200 }),
      )

      const result = await listCommunityCollectionsPage(1, 24)
      expect(result.items).toEqual([sampleCollection])
      expect(fetch).toHaveBeenCalledWith('/v1/community/collections?page=1&per_page=24')
    })
  })

  describe('saveCommunityCopy', () => {
    it('retorna null quando não há sessão', async () => {
      mockedSession.mockReturnValueOnce(null)

      await expect(saveCommunityCopy(sampleCollection)).resolves.toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('retorna o id da cópia quando a API responde ok (valida headers e body exatos)', async () => {
      mockedSession.mockReturnValueOnce({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      })
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42 }), { status: 201 }),
      )

      await expect(saveCommunityCopy(sampleCollection)).resolves.toBe(42)
      expect(fetch).toHaveBeenCalledWith(
        '/v1/community/collections/copy',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            authorization: 'Bearer tok',
          }),
          body: JSON.stringify({ sourceCollectionId: sampleCollection.id }),
        }),
      )
    })

    it('retorna null quando a API responde erro 403 (não tenta parsear JSON)', async () => {
      mockedSession.mockReturnValueOnce({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      })
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 999 }), { status: 403 }),
      )

      await expect(saveCommunityCopy(sampleCollection)).resolves.toBeNull()
    })

    it('retorna null quando a API responde erro 500 (não tenta parsear JSON)', async () => {
      mockedSession.mockReturnValueOnce({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      })
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 999 }), { status: 500 }),
      )

      await expect(saveCommunityCopy(sampleCollection)).resolves.toBeNull()
    })

    it('retorna null quando o fetch lança (rede)', async () => {
      mockedSession.mockReturnValueOnce({
        token: 'tok',
        user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
      })
      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

      await expect(saveCommunityCopy(sampleCollection)).resolves.toBeNull()
    })
  })
})