import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * sync v2 (web#188) — outbox do estado do operador (scheduled/prefs).
 *
 * Contrato offline-first (réplica do app#336/#349):
 * - enqueue grava LOCAL primeiro (persistente, sobrevive a reload/kill)
 * - flush em batch POST /v1/custom/sync com Bearer da sessão
 * - coalescing: mesma namespace+key vira 1 item (última escrita)
 * - sem sessão real → outbox enfileira mas NÃO envia
 * - falha de rede → itens voltam pra fila (nada se perde)
 * - resposta aplica pull: operator_state do servidor atualiza o local
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => void lsStore.clear(),
})

const sessionState = { token: null as string | null }
vi.doMock('@modules/auth/services/auth-client', () => ({
  getAuthSession: () =>
    sessionState.token
      ? { token: sessionState.token, user: { id_user: 42, email: 'r@x', displayName: 'R' } }
      : null,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

let clearOutbox: () => void
let enqueueOperatorState: (ns: string, key: string, value: unknown) => void
let flushOutbox: () => Promise<{ operator_state: unknown[] } | null>
let outboxCount: () => number
let scheduleOutboxFlush: (delayMs?: number) => void

beforeEach(async () => {
  vi.resetModules()
  ;({ clearOutbox, enqueueOperatorState, flushOutbox, outboxCount, scheduleOutboxFlush } =
    await import('../sync-outbox-service'))
  lsStore.clear()
  fetchMock.mockReset()
  sessionState.token = null
  clearOutbox()
})

describe('outbox do estado do operador (web#188)', () => {
  it('enqueue sem rede: grava persistente e NÃO envia sem sessão', async () => {
    enqueueOperatorState('scheduled', 'items', { categories: [], items: [] })
    expect(outboxCount()).toBe(1)
    expect(lsStore.get('pianolouvorja:sync:outbox')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('coalescing: mesma namespace+key mantém só a última escrita', () => {
    enqueueOperatorState('scheduled', 'items', { v: 1 })
    enqueueOperatorState('scheduled', 'items', { v: 2 })
    expect(outboxCount()).toBe(1)
  })

  it('flush com sessão: POST batch pro /sync com Bearer', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ server_time: 1, applied: { created: 1, updated: 0 }, collections: [], operator_state: [] }),
        { status: 200 },
      ),
    )
    enqueueOperatorState('scheduled', 'items', { categories: [], items: [] })
    await flushOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/custom/sync')
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok-123' })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.operator_state).toHaveLength(1)
    expect(body.operator_state[0]).toMatchObject({ namespace: 'scheduled', key: 'items' })
    // enviou → fila esvazia
    expect(outboxCount()).toBe(0)
  })

  it('flush marca LWW por namespace (scheduled e prefs independentes)', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ operator_state: [] }), { status: 200 }),
    )
    enqueueOperatorState('scheduled', 'items', { categories: [], items: [] })
    enqueueOperatorState('prefs', 'values', { theme: 'dark' })
    await flushOutbox()
    expect(Number(lsStore.get('pianolouvorja:sync:scheduled:items:updatedAt'))).toBeGreaterThan(0)
    expect(Number(lsStore.get('pianolouvorja:sync:prefs:updatedAt'))).toBeGreaterThan(0)
  })

  it('falha de rede: itens permanecem na fila (nada se perde)', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockRejectedValue(new Error('offline'))
    enqueueOperatorState('prefs', 'values', { theme: 'dark' })
    await flushOutbox()
    expect(outboxCount()).toBe(1)
  })

  it('placeholder (sem token real): flush não envia', async () => {
    enqueueOperatorState('scheduled', 'items', {})
    await flushOutbox()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(outboxCount()).toBe(1)
  })

  it('pull: operator_state do servidor é aplicado na resposta', async () => {
    sessionState.token = 'tok-123'
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          operator_state: [
            {
              client_uuid: 'srv',
              namespace: 'scheduled',
              key: 'items',
              value_json: JSON.stringify({ categories: [{ id: 'c9', name: 'X' }], items: [] }),
              updated_at_ms: Date.now() + 10_000,
              deleted_at: null,
            },
          ],
        }),
        { status: 200 },
      ),
    )
    enqueueOperatorState('prefs', 'values', { theme: 'dark' })
    const server = await flushOutbox()
    expect(server).toHaveLength(1)
    const userData = JSON.parse(lsStore.get('user_data') ?? '{}')
    expect(userData['scheduled.state'].categories[0].id).toBe('c9')
  })

  it('scheduleOutboxFlush: debounce — só 1 flush para N chamadas', async () => {
    vi.useFakeTimers()
    try {
      const flushSpy = vi.fn()
      // observamos o efeito: flush só dispara depois do delay, uma vez
      scheduleOutboxFlush(2_000)
      scheduleOutboxFlush(2_000)
      scheduleOutboxFlush(2_000)
      await vi.advanceTimersByTimeAsync(2_100)
      // fila vazia + sem sessão → flush retorna null sem rede
      expect(fetchMock).not.toHaveBeenCalled()
      expect(flushSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
