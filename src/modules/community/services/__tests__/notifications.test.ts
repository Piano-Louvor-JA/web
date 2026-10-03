import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNotifications, markAllRead } from '../notifications'
import { getAuthSession } from '@/modules/auth/services/auth-client'

vi.mock('@/modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))

const mockedSession = vi.mocked(getAuthSession)

describe('notifications service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockedSession.mockReset()
    delete import.meta.env.VITE_PALCO_API_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna lista vazia quando não há sessão', async () => {
    mockedSession.mockReturnValueOnce(null)

    await expect(getNotifications()).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retorna notificações quando a API responde ok (valida authorization header)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    const payload = [
      {
        id: 1,
        type: 'ranking',
        title: 'Subiu no ranking',
        body: 'Você subiu 3 posições',
        created_at: '2026-09-17T10:00:00Z',
      },
    ]
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )

    await expect(getNotifications()).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith(
      '/v1/community/notifications',
      expect.objectContaining({
        headers: { authorization: 'Bearer tok' },
      }),
    )
  })

  it('retorna lista vazia quando a API responde erro 401 (não tenta parsear JSON)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 99 }]), { status: 401 }),
    )

    await expect(getNotifications()).resolves.toEqual([])
  })

  it('retorna lista vazia quando a API responde erro 500 (não tenta parsear JSON)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 99 }]), { status: 500 }),
    )

    await expect(getNotifications()).resolves.toEqual([])
  })

  it('retorna lista vazia quando o fetch lança', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

    await expect(getNotifications()).resolves.toEqual([])
  })

  it('markAllRead é um no-op sem lançar erro', () => {
    expect(() => markAllRead()).not.toThrow()
  })

  it('usa VITE_PALCO_API_URL quando definida (com barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com/'
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    await expect(getNotifications()).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/notifications', expect.anything())
  })

  it('usa VITE_PALCO_API_URL quando definida (sem barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com'
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    await expect(getNotifications()).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/notifications', expect.anything())
  })

  it('usa URL relativa quando VITE_PALCO_API_URL é string vazia (falsy)', async () => {
    import.meta.env.VITE_PALCO_API_URL = ''
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))

    await expect(getNotifications()).resolves.toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledWith('/v1/community/notifications', expect.anything())
  })
})