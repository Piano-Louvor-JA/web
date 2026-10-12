import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { loadLiturgyState } from '../services/liturgy-preferences'
import { flushOutbox, outboxCount } from '@modules/sync/services/sync-outbox-service'

vi.mock('@modules/auth/services/auth-client', () => ({ getAuthSession: () => null }))

describe('liturgia local → outbox', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('persiste edições offline, agrupa por semana e mantém a fila sem sessão', async () => {
    const store = useLiturgyStore()
    store.selectedDay = 'saturday'
    store.currentNotes = 'Primeira edição'
    store.currentNotes = 'Edição final'
    expect(loadLiturgyState().dayNotes.saturday).toBe('Edição final')
    expect(outboxCount()).toBe(1)
    const queued = JSON.parse(localStorage.getItem('pianolouvorja:sync:outbox')!)
    expect(JSON.parse(queued['liturgy::week'].value_json).dayNotes.saturday).toBe('Edição final')
    await vi.advanceTimersByTimeAsync(2000)
    await flushOutbox()
    expect(fetch).not.toHaveBeenCalled()
    expect(outboxCount()).toBe(1)
    setActivePinia(createPinia())
    expect(useLiturgyStore().dayNotes.saturday).toBe('Edição final')
  })
})
