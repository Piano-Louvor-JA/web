import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getMyPosition,
  getRanking,
  registerUse,
  reportCollection,
} from '../ranking'

describe('ranking service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    delete import.meta.env.VITE_PALCO_API_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getRanking', () => {
    it('retorna entradas quando a API responde ok', async () => {
      const payload = [
        { user_id: 1, display_name: 'A', position: 1, total: 10 },
        { user_id: 2, display_name: 'B', position: 2, total: 8 },
      ]
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      )

      await expect(getRanking('week')).resolves.toEqual(payload)
      expect(fetch).toHaveBeenCalledWith('/v1/community/ranking?window=week')
    })

    it('retorna lista vazia quando a API responde erro 500 (não tenta parsear JSON)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([{ user_id: 99 }]), { status: 500 }),
      )

      await expect(getRanking('all')).resolves.toEqual([])
    })

    it('retorna lista vazia quando a API responde erro 404 (não tenta parsear JSON)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([{ user_id: 99 }]), { status: 404 }),
      )

      await expect(getRanking('all')).resolves.toEqual([])
    })

    it('usa VITE_PALCO_API_URL quando definida (com barra final)', async () => {
      import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com/'
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      const result = await getRanking('week')
      expect(result).toEqual([])
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/ranking?window=week')
    })

    it('usa VITE_PALCO_API_URL quando definida (sem barra final)', async () => {
      import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com'
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      const result = await getRanking('week')
      expect(result).toEqual([])
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/ranking?window=week')
    })

    it('retorna lista vazia quando VITE_PALCO_API_URL é string vazia (falsy)', async () => {
      import.meta.env.VITE_PALCO_API_URL = ''
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([{ user_id: 1 }]), { status: 200 }))

      const result = await getRanking('week')
      expect(result).toEqual([{ user_id: 1 }])
      expect(fetch).toHaveBeenCalledWith('/v1/community/ranking?window=week')
    })
  })

  describe('getMyPosition', () => {
    it('retorna posição nula quando não há token', async () => {
      await expect(getMyPosition('week', null)).resolves.toEqual({
        position: null,
        total: 0,
      })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('retorna posição quando a API responde ok (valida headers)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ position: 4, total: 25 }), { status: 200 }),
      )

      await expect(getMyPosition('week', 'tok')).resolves.toEqual({
        position: 4,
        total: 25,
      })
      expect(fetch).toHaveBeenCalledWith(
        '/v1/community/ranking/me?window=week',
        expect.objectContaining({
          headers: { authorization: 'Bearer tok' },
        }),
      )
    })

    it('retorna posição nula quando a API responde erro 401 (não tenta parsear JSON)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ position: 99, total: 999 }), { status: 401 }),
      )

      await expect(getMyPosition('week', 'tok')).resolves.toEqual({
        position: null,
        total: 0,
      })
    })

    it('retorna posição nula quando a API responde erro 500 (não tenta parsear JSON)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ position: 99, total: 999 }), { status: 500 }),
      )

      await expect(getMyPosition('week', 'tok')).resolves.toEqual({
        position: null,
        total: 0,
      })
    })

    it('retorna posição nula quando o fetch lança', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

      await expect(getMyPosition('all', 'tok')).resolves.toEqual({
        position: null,
        total: 0,
      })
    })
  })

  describe('registerUse', () => {
    it('retorna false quando não há token', async () => {
      await expect(registerUse(1, null)).resolves.toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('retorna true quando a API responde ok (valida headers e body exatos)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }))

      await expect(registerUse(5, 'tok')).resolves.toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        '/v1/community/collections/use',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            authorization: 'Bearer tok',
          }),
          body: JSON.stringify({ collectionId: 5 }),
        }),
      )
    })

    it('retorna false quando a API responde erro 400', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 400 }))

      await expect(registerUse(5, 'tok')).resolves.toBe(false)
    })

    it('retorna false quando a API responde erro 500', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))

      await expect(registerUse(5, 'tok')).resolves.toBe(false)
    })

    it('retorna false quando o fetch lança', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

      await expect(registerUse(5, 'tok')).resolves.toBe(false)
    })
  })

  describe('reportCollection', () => {
    it('retorna false quando não há token', async () => {
      await expect(reportCollection(1, 'conteúdo', null)).resolves.toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('retorna true quando a API responde ok (valida headers e body exatos)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 201 }))

      await expect(reportCollection(5, 'conteúdo', 'tok')).resolves.toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        '/v1/community/collections/report',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            authorization: 'Bearer tok',
          }),
          body: JSON.stringify({ collectionId: 5, reason: 'conteúdo' }),
        }),
      )
    })

    it('retorna false quando a API responde erro 422', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 422 }))

      await expect(reportCollection(5, 'spam', 'tok')).resolves.toBe(false)
    })

    it('retorna false quando a API responde erro 500', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))

      await expect(reportCollection(5, 'spam', 'tok')).resolves.toBe(false)
    })

    it('retorna false quando o fetch lança', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

      await expect(reportCollection(5, 'spam', 'tok')).resolves.toBe(false)
    })
  })
})