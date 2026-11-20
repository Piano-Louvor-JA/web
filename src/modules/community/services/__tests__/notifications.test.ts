import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => vi.fn())
vi.mock('@/modules/auth/services/auth-client', () => ({ getAuthSession: session }))

import { getNotifications, markAllRead } from '../notifications'

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

describe('notifications — contrato /v1/custom', () => {
  beforeEach(() => { session.mockReturnValue({ token: 'tok' }); delete import.meta.env.VITE_PALCO_API_URL })
  afterEach(() => { vi.unstubAllGlobals() })

  it('GET /notifications com Bearer e lê data', async () => {
    const items = [{ id: 1, type: 'badge_granted', title: 't', body: 'b', created_at: 'x' }]
    const f = respond({ data: items })
    vi.stubGlobal('fetch', f)
    expect(await getNotifications()).toEqual(items)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/notifications')
    expect(f.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('sem sessão, erro, sem data ou rede → []', async () => {
    session.mockReturnValueOnce(null)
    expect(await getNotifications()).toEqual([])
    vi.stubGlobal('fetch', respond({}, false))
    expect(await getNotifications()).toEqual([])
    vi.stubGlobal('fetch', respond({}))
    expect(await getNotifications()).toEqual([])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await getNotifications()).toEqual([])
  })

  it('markAllRead: POST /notifications/read-all; sem sessão ou rede não lança', async () => {
    const f = respond({})
    vi.stubGlobal('fetch', f)
    await markAllRead()
    expect(f.mock.calls[0][0]).toBe('/v1/custom/notifications/read-all')
    expect(f.mock.calls[0][1].method).toBe('POST')
    session.mockReturnValueOnce(null)
    await markAllRead()
    expect(f).toHaveBeenCalledTimes(1)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    await expect(markAllRead()).resolves.toBeUndefined()
  })
})
