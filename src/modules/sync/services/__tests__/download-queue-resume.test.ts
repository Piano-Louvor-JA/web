import { afterEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
})

afterEach(() => { vi.resetModules(); storage.clear() })

describe('retomada da fila de downloads', () => {
  it('não declara concluído um download restaurado sem executar sua tarefa real', async () => {
    storage.set('pianolouvorja:sync:download-queue', JSON.stringify([
      { id: 'album:1', label: 'Álbum', priority: 'user', status: 'running' },
    ]))
    const queue = await import('../download-queue-service')
    queue.enqueueDownload({ id: 'other', label: 'Outro', priority: 'bg', task: async () => {} })
    await vi.waitFor(() => expect(queue.downloadQueueSnapshot().find(x => x.id === 'other')?.status).toBe('done'))
    expect(queue.downloadQueueSnapshot().find(x => x.id === 'album:1')?.status).toBe('pending')
    const task = vi.fn(async () => {})
    queue.enqueueDownload({ id: 'album:1', label: 'Álbum', priority: 'user', task })
    await vi.waitFor(() => expect(task).toHaveBeenCalledOnce())
    expect(queue.downloadQueueSnapshot().find(x => x.id === 'album:1')?.status).toBe('done')
  })

  it('reenfileirar um download falho executa a nova tarefa', async () => {
    const queue = await import('../download-queue-service')
    queue.enqueueDownload({ id: 'fail', label: 'Falhou', priority: 'user', task: async () => { throw new Error('offline') } })
    await vi.waitFor(() => expect(queue.downloadQueueSnapshot()[0]?.status).toBe('failed'))
    const retry = vi.fn(async () => {})
    queue.enqueueDownload({ id: 'fail', label: 'Falhou', priority: 'user', task: retry })
    await vi.waitFor(() => expect(queue.downloadQueueSnapshot()[0]?.status).toBe('done'))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('ignora dados persistidos que não sejam uma lista de itens válidos', async () => {
    storage.set('pianolouvorja:sync:download-queue', '{}')
    const queue = await import('../download-queue-service')
    expect(queue.downloadQueueSnapshot()).toEqual([])
  })
})
