import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAuthSession } from '@/modules/auth/services/auth-client'

import { getWeeklyTasks } from '../weekly-tasks'

vi.mock('@/modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))

const mockedSession = vi.mocked(getAuthSession)

describe('weekly-tasks service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockedSession.mockReset()
    delete import.meta.env.VITE_PALCO_API_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna null quando não há sessão', async () => {
    mockedSession.mockReturnValueOnce(null)

    await expect(getWeeklyTasks()).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retorna tarefas quando a API responde ok (sem VITE_PALCO_API_URL)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    const payload = [
      { id: 1, description: 'Use 3 coletâneas', bonus: 10, done: false },
    ]
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    )

    await expect(getWeeklyTasks()).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith(
      '/v1/community/weekly-tasks',
      expect.objectContaining({
        headers: { authorization: 'Bearer tok' },
      }),
    )
  })

  it('retorna null quando a API responde erro 500 (não tenta parsear JSON)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 99 }]), { status: 500 }),
    )

    await expect(getWeeklyTasks()).resolves.toBeNull()
  })

  it('retorna null quando a API responde erro 404 (não tenta parsear JSON)', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 99 }]), { status: 404 }),
    )

    await expect(getWeeklyTasks()).resolves.toBeNull()
  })

  it('retorna null quando o fetch lança', async () => {
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))

    await expect(getWeeklyTasks()).resolves.toBeNull()
  })

  it('usa VITE_PALCO_API_URL quando definida (com barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com/'
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const result = await getWeeklyTasks()
    expect(result).toEqual([])
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/weekly-tasks', expect.anything())
  })

  it('usa VITE_PALCO_API_URL quando definida (sem barra final)', async () => {
    import.meta.env.VITE_PALCO_API_URL = 'https://api.example.com'
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const result = await getWeeklyTasks()
    expect(result).toEqual([])
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/community/weekly-tasks', expect.anything())
  })

  it('retorna null quando VITE_PALCO_API_URL é string vazia (falsy)', async () => {
    import.meta.env.VITE_PALCO_API_URL = ''
    mockedSession.mockReturnValueOnce({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'A' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))

    const result = await getWeeklyTasks()
    expect(result).toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledWith('/v1/community/weekly-tasks', expect.anything())
  })
})