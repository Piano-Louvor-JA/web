import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => vi.fn())
vi.mock('@/modules/auth/services/auth-client', () => ({ getAuthSession: session }))

import { getWeeklyTasks } from '../weekly-tasks'

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

describe('weekly-tasks — contrato /v1/custom', () => {
  beforeEach(() => { session.mockReturnValue({ token: 'tok' }); delete import.meta.env.VITE_PALCO_API_URL })
  afterEach(() => { vi.unstubAllGlobals() })

  it('GET /weekly-tasks com Bearer e lê data', async () => {
    const tasks = [{ id: 'use3', description: 'Use 3', bonus: 5, done: false }]
    const f = respond({ data: tasks })
    vi.stubGlobal('fetch', f)
    expect(await getWeeklyTasks()).toEqual(tasks)
    expect(f.mock.calls[0][0]).toBe('/v1/custom/weekly-tasks')
    expect(f.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer tok', 'x-tenant': 'piano' })
  })

  it('sem sessão, erro, sem data ou rede → null', async () => {
    session.mockReturnValueOnce(null)
    expect(await getWeeklyTasks()).toBeNull()
    vi.stubGlobal('fetch', respond({}, false))
    expect(await getWeeklyTasks()).toBeNull()
    vi.stubGlobal('fetch', respond({}))
    expect(await getWeeklyTasks()).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await getWeeklyTasks()).toBeNull()
  })
})
