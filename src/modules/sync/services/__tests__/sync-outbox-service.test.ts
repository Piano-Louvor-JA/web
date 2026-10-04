/**
 * sync v2 fase 2 (web#183) — outbox do estado do operador.
 * Paridade dos testes do app (app#336, sync-outbox-service.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const flushState = vi.hoisted(() => ({ session: null as { token: string } | null }))

vi.mock('@modules/auth/services/auth-client', () => ({
  getAuthSession: () => flushState.session,
}))

import {
  clearOutbox,
  enqueueOperatorState,
  flushOutbox,
  outboxCount,
  scheduleOutboxFlush,
  startOutboxTriggers,
} from '../sync-outbox-service'

const OUTBOX_KEY = 'louvorja:sync:outbox'
const META_KEY = 'louvorja:sync:liturgy:week:updatedAt'

function lastBody(): { collections: unknown[]; operator_state: unknown[] } {
  const fetchSpy = vi.mocked(globalThis.fetch)
  return JSON.parse(fetchSpy.mock.calls.at(-1)![1]!.body as string)
}

function mockServerResponse(operator_state: unknown[] = [], ok = true): void {
  vi.mocked(globalThis.fetch).mockResolvedValue(
    ok
      ? { ok: true, json: async () => ({ operator_state }) }
      : { ok: false },
  ) as unknown as Promise<Response>
}

describe('sync-outbox-service', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    flushState.session = null
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('enqueue não toca rede e faz coalescing por namespace+key', () => {
    enqueueOperatorState('liturgy', 'week', { weekdays: { sun: [] } })
    enqueueOperatorState('liturgy', 'week', { weekdays: { sun: [1] } })
    expect(outboxCount()).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('flush sem sessão retorna null e mantém a fila', async () => {
    enqueueOperatorState('liturgy', 'week', { weekdays: {} })
    await expect(flushOutbox()).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(outboxCount()).toBe(1)
  })

  it('flush com fila vazia retorna null', async () => {
    flushState.session = { token: 'tok' }
    await expect(flushOutbox()).resolves.toBeNull()
  })

  it('flush envia batch com Bearer e limpa itens enviados', async () => {
    flushState.session = { token: 'tok-123' }
    enqueueOperatorState('liturgy', 'week', { weekdays: { sun: [] } })
    mockServerResponse()

    await expect(flushOutbox()).resolves.toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('/v1/custom/sync')
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer tok-123')
    expect(outboxCount()).toBe(0)
  })

  it('falha de rede devolve itens pra fila', async () => {
    flushState.session = { token: 'tok' }
    enqueueOperatorState('liturgy', 'week', { weekdays: {} })
    fetchSpy.mockRejectedValue(new Error('offline'))

    await expect(flushOutbox()).resolves.toBeNull()
    expect(outboxCount()).toBe(1)
  })

  it('resposta !ok mantém a fila (sessão inválida / erro)', async () => {
    flushState.session = { token: 'tok' }
    enqueueOperatorState('liturgy', 'week', { weekdays: {} })
    fetchSpy.mockResolvedValue({ ok: false } as Response)

    await expect(flushOutbox()).resolves.toBeNull()
    expect(outboxCount()).toBe(1)
  })

  it('flush enfileirado durante o flush não é apagado (só o batch sai)', async () => {
    flushState.session = { token: 'tok' }
    enqueueOperatorState('liturgy', 'week', { weekdays: { a: 1 } })
    mockServerResponse()
    await flushOutbox()
    // novo item pós-flush permanece
    enqueueOperatorState('scheduled', 'items', { items: [] })
    expect(outboxCount()).toBe(1)
  })

  it('flush registra o instante do push na meta key (base do LWW) e aplica o pull do servidor', async () => {
    flushState.session = { token: 'tok' }
    localStorage.setItem(META_KEY, '1000')
    enqueueOperatorState('liturgy', 'week', { weekdays: {} })
    const serverValue = { weekdays: { mon: [] }, dayNotes: {} }
    const nowMs = Date.now()
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        operator_state: [
          {
            client_uuid: 'srv-1',
            namespace: 'liturgy',
            key: 'week',
            value_json: JSON.stringify(serverValue),
            // servidor mais novo que o meta local (1000) → aplica
            updated_at_ms: nowMs + 60_000,
            deleted_at: null,
          },
        ],
      }),
    } as unknown as Response)

    const items = await flushOutbox()
    expect(items).toHaveLength(1)
    // push local registra o instante; pull aplica e atualiza com o ts do servidor
    expect(Number(localStorage.getItem(META_KEY))).toBeGreaterThanOrEqual(nowMs)
    const stored = JSON.parse(
      localStorage.getItem('user_data') ?? '{}',
    ) as Record<string, unknown>
    expect(stored['liturgy.state']).toEqual(serverValue)
  })

  it('pull com servidor mais velho que o push local não aplica (LWW)', async () => {
    flushState.session = { token: 'tok' }
    enqueueOperatorState('liturgy', 'week', { weekdays: { sun: [] } })
    mockServerResponse([
      {
        client_uuid: 'srv-2',
        namespace: 'liturgy',
        key: 'week',
        value_json: JSON.stringify({ weekdays: { x: [] } }),
        updated_at_ms: 1000,
        deleted_at: null,
      },
    ])

    await flushOutbox()
    // push local acabou de registrar Date.now() → pull 1000 perde e NADA é
    // aplicado (estado local inexistente continua inexistente)
    expect(JSON.parse(localStorage.getItem('user_data') ?? '{}')).toEqual({})
  })

  it('startOutboxTriggers: listener de online faz flush da fila e stop() remove', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    flushState.session = { token: 'tok' }
    // boot com fila já populada: pull imediato dispara o flush
    enqueueOperatorState('liturgy', 'week', { weekdays: { sun: [] } })
    const stop = startOutboxTriggers()
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    // online de novo → flush seguinte (novo item enfileirado)
    enqueueOperatorState('liturgy', 'week', { weekdays: { mon: [] } })
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBe(2))
    const callsBeforeStop = fetchSpy.mock.calls.length
    stop()
    enqueueOperatorState('liturgy', 'week', { weekdays: { tue: [] } })
    window.dispatchEvent(new Event('online'))
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeStop)
  })

  it('clearOutbox esvazia a fila', () => {
    enqueueOperatorState('liturgy', 'week', {})
    expect(outboxCount()).toBe(1)
    clearOutbox()
    expect(outboxCount()).toBe(0)
    expect(localStorage.getItem(OUTBOX_KEY)).toBeNull()
  })

  it('scheduleOutboxFlush agenda flush único (coalescing de timer)', async () => {
    vi.useFakeTimers()
    try {
      flushState.session = { token: 'tok' }
      enqueueOperatorState('liturgy', 'week', { weekdays: {} })
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ operator_state: [] }) } as Response)
      scheduleOutboxFlush()
      scheduleOutboxFlush()
      scheduleOutboxFlush()
      await vi.advanceTimersByTimeAsync(2100)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
