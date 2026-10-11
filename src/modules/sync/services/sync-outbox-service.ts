import { sha256Hex, sha256ToUuid } from '@shared/services/content-hash'
import { getAuthSession } from '@modules/auth/services/auth-client'
import { getUserPreference, registerPrefsChangedHook } from '@shared/services/user-preferences'
import {
  applyOperatorState,
  markLocalLiturgyPushed,
  markLocalPrefsPushed,
  markLocalScheduledPushed,
  SYNCABLE_PREF_KEYS,
} from './operator-state-apply'

/**
 * sync v2 (web#188): outbox do estado do operador — réplica do app
 * (PR app#350 / app#336 + app#349).
 *
 * Toda mutação do estado sincronizável grava AQUI primeiro (persistente,
 * sobrevive a reload/kill/sem rede) e um flush em batch envia pra
 * POST /v1/custom/sync com o Bearer da sessão real.
 *
 * Regras (offline-first inegociável):
 * - enqueue NUNCA toca rede
 * - coalescing por namespace+key (última escrita vence na fila)
 * - flush sem sessão real NÃO envia — fica na fila
 * - falha de rede devolve os itens pra fila (nada se perde)
 */

const OUTBOX_KEY = 'pianolouvorja:sync:outbox'

export interface OutboxEntry {
  client_uuid: string
  namespace: string
  key: string
  value_json: string
  updated_at: number
  deleted_at: number | null
}

type OutboxStorage = Record<string, OutboxEntry>

function readOutbox(): OutboxStorage {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '{}') as OutboxStorage
  } catch {
    return {}
  }
}

function writeOutbox(box: OutboxStorage): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(box))
  } catch {
    // quota — estado continua em memória da sessão
  }
}

export function outboxCount(): number {
  return Object.keys(readOutbox()).length
}

export function clearOutbox(): void {
  localStorage.removeItem(OUTBOX_KEY)
}

function coalesceKey(namespace: string, key: string): string {
  return `${namespace}::${key}`
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Enfileira uma mutação do estado do operador. NUNCA toca rede. */
export function enqueueOperatorState(
  namespace: string,
  key: string,
  value: unknown,
): void {
  const box = readOutbox()
  const k = coalesceKey(namespace, key)
  const existing = box[k]
  box[k] = {
    client_uuid: existing?.client_uuid ?? uuid(),
    namespace,
    key,
    value_json: JSON.stringify(value),
    updated_at: Date.now(),
    deleted_at: null,
  }
  writeOutbox(box)
  if (namespace === 'liturgy' && key === 'week') markLocalLiturgyPushed(box[k].updated_at)
  if (namespace === 'scheduled' && key === 'items') markLocalScheduledPushed(box[k].updated_at)
  if (namespace === 'prefs' && key === 'values') markLocalPrefsPushed(box[k].updated_at)
}

let outboxFlushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Agenda o flush em bg (debounce 2s): agrupa mutações rápidas num único
 * POST. Compartilhado por todos os produtores de outbox (liturgia,
 * agendados, prefs...).
 */
export function scheduleOutboxFlush(delayMs = 2_000): void {
  if (outboxFlushTimer) clearTimeout(outboxFlushTimer)
  outboxFlushTimer = setTimeout(() => {
    outboxFlushTimer = null
    void flushOutbox().catch(() => {})
  }, delayMs)
}

/** Sessão real = token presente. */
function hasRealSession(): boolean {
  const session = getAuthSession()
  return Boolean(session?.token)
}

/**
 * Flush: envia a fila em um batch. Retorna o operator_state do servidor
 * (pull) quando houver, ou null se nada foi enviado (sem sessão / fila
 * vazia / falha — itens permanecem na fila).
 */
export type OperatorStateItem = {
  client_uuid: string
  namespace: string
  key: string
  value_json: string
  updated_at_ms: number
  deleted_at: number | null
}

export async function flushOutbox(): Promise<OperatorStateItem[] | null> {
  const box = readOutbox()
  const entries = Object.values(box)
  if (!hasRealSession()) return null

  const session = getAuthSession()
  // mesma base da API custom (auth/coletâneas): VITE_PALCO_API_URL
  const base = (
    import.meta.env.VITE_PALCO_API_URL as string | undefined
  )?.replace(/\/+$/, '') ?? ''

  // Os dados são compartilhados no dispositivo, mas a identidade remota é da conta.
  const outgoing = await Promise.all(entries.map(async (entry) => ({
    ...entry,
    client_uuid: sha256ToUuid(await sha256Hex(new TextEncoder().encode(
      `operator-state:${session!.user.id_user}:${entry.namespace}:${entry.key}`,
    ))),
  })))
  if (getAuthSession()?.token !== session?.token) return null

  let response: Response
  try {
    response = await fetch(`${base}/v1/custom/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session!.token}`,
      },
      body: JSON.stringify({
        collections: [],
        operator_state: outgoing,
      }),
    })
  } catch {
    return null // rede — itens permanecem
  }

  if (!response.ok) {
    // 401 = sessão inválida → fica pra re-login; outros erros idem
    return null
  }

  if (getAuthSession()?.token !== session?.token) return null

  const json = (await response.json()) as {
    operator_state?: Array<{
      client_uuid: string
      namespace: string
      key: string
      value_json: string
      updated_at_ms: number
      deleted_at: number | null
    }>
  }

  // enviado com sucesso: limpa SOMENTE os itens que foram no batch
  const sent = new Map(entries.map((e) => [coalesceKey(e.namespace, e.key), JSON.stringify(e)]))
  const rest = readOutbox()
  for (const [k, entry] of Object.entries(rest)) {
    if (sent.get(k) === JSON.stringify(entry)) delete rest[k]
  }
  writeOutbox(rest)

  const serverItems = json.operator_state ?? []
  applyOperatorState(serverItems)

  return serverItems
}

/** web#188: flush quando a rede volta + hook de prefs + pull no boot. */
export function startOutboxTriggers(): () => void {
  const onOnline = () => {
    void flushOutbox().catch(() => {})
  }
  window.addEventListener('online', onOnline)

  // web#188 peça 2: preferências do operador — hook global gravado pelo
  // user-preferences; só keys da whitelist vão pro outbox (lote 'prefs::values').
  registerPrefsChangedHook((key) => {
    if (!SYNCABLE_PREF_KEYS.has(key)) return
    const preferences: Record<string, unknown> = {}
    for (const allowed of SYNCABLE_PREF_KEYS) {
      const value = getUserPreference(allowed)
      if (value !== null) preferences[allowed] = value
    }
    enqueueOperatorState('prefs', 'values', preferences)
    scheduleOutboxFlush()
  })

  // pull no boot (rede disponível): puxa o estado da conta
  onOnline()
  return () => {
    window.removeEventListener('online', onOnline)
    registerPrefsChangedHook(null)
    if (outboxFlushTimer) clearTimeout(outboxFlushTimer)
    outboxFlushTimer = null
  }
}
