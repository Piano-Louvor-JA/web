import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * sync v2 (web#188) — namespaces scheduled/prefs do operator_state.
 *
 * Porta 1:1 da app (PR app#350, app#349):
 * - pull LWW por namespace (meta key própria)
 * - prefs com whitelist explícita (FORA dela NUNCA viaja)
 * - payload inválido / namespace desconhecida → ignorado sem quebrar
 *
 * localStorage mockado (padrão do repo — ver auth-client.test.ts).
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => void lsStore.clear(),
})
import {
  applyOperatorState,
  markLocalScheduledPushed,
  markLocalPrefsPushed,
  SYNCABLE_PREF_KEYS,
} from '../operator-state-apply'

const USER_DATA_KEY = 'user_data'
const SCHEDULED_META_KEY = 'pianolouvorja:sync:scheduled:items:updatedAt'
const PREFS_META_KEY = 'pianolouvorja:sync:prefs:updatedAt'

function serverItem(namespace: string, key: string, value: unknown, updatedAtMs: number) {
  return {
    client_uuid: `${namespace}-${key}`,
    namespace,
    key,
    value_json: JSON.stringify(value),
    updated_at_ms: updatedAtMs,
    deleted_at: null,
  }
}

function readScheduled(): any | null {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  return userData['scheduled.state'] ?? null
}

function writeScheduled(state: unknown): void {
  const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
  userData['scheduled.state'] = state
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData))
}

const LOCAL_STATE = {
  categories: [{ id: 'c1', name: 'Cultos' }],
  items: [
    {
      id: 'i1',
      categoryId: 'c1',
      date: '2026-10-10',
      name: 'Programa',
      filePath: '',
      isRelativePath: false,
      notes: '',
    },
  ],
}

beforeEach(() => {
  lsStore.clear()
})

describe('pull scheduled::items (LWW)', () => {
  it('servidor mais novo → aplica e registra meta', () => {
    localStorage.setItem(SCHEDULED_META_KEY, '1000')
    const server = { ...LOCAL_STATE, items: [{ ...LOCAL_STATE.items[0]!, name: 'Viajou' }] }
    const applied = applyOperatorState([serverItem('scheduled', 'items', server, 2000)])
    expect(applied).toBe(true)
    expect(readScheduled().items[0].name).toBe('Viajou')
    expect(Number(localStorage.getItem(SCHEDULED_META_KEY))).toBe(2000)
  })

  it('servidor mais velho → local vence (nada muda)', () => {
    writeScheduled(LOCAL_STATE)
    localStorage.setItem(SCHEDULED_META_KEY, '5000')
    const applied = applyOperatorState([serverItem('scheduled', 'items', { ...LOCAL_STATE, items: [] }, 1000)])
    expect(applied).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })

  it('sem estado local (novo dispositivo) → aplica direto', () => {
    const server = { ...LOCAL_STATE, categories: [{ id: 'c9', name: 'Outra' }] }
    const applied = applyOperatorState([serverItem('scheduled', 'items', server, 1234)])
    expect(applied).toBe(true)
    expect(readScheduled().categories[0].id).toBe('c9')
  })

  it('payload inválido (sem arrays) → ignorado sem quebrar', () => {
    writeScheduled(LOCAL_STATE)
    const applied = applyOperatorState([serverItem('scheduled', 'items', { foo: 'bar' }, 9999)])
    expect(applied).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })

  it('item com deleted_at → ignorado (tombstone)', () => {
    writeScheduled(LOCAL_STATE)
    const item = { ...serverItem('scheduled', 'items', LOCAL_STATE, 9999), deleted_at: 999 }
    expect(applyOperatorState([item])).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })

  it('markLocalScheduledPushed protege o push local no próximo pull', () => {
    writeScheduled(LOCAL_STATE)
    markLocalScheduledPushed(7000)
    const applied = applyOperatorState([serverItem('scheduled', 'items', { ...LOCAL_STATE, items: [] }, 5000)])
    expect(applied).toBe(false)
  })
})

describe('pull prefs::values (LWW + whitelist)', () => {
  it('servidor mais novo → aplica keys da whitelist e registra meta', () => {
    localStorage.setItem(PREFS_META_KEY, '1000')
    const applied = applyOperatorState([
      serverItem('prefs', 'values', { theme: 'dark', language: 'en', 'ui.zoom': 1.2 }, 2000),
    ])
    expect(applied).toBe(true)
    const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
    expect(userData.theme).toBe('dark')
    expect(userData.language).toBe('en')
    expect(userData['ui.zoom']).toBe(1.2)
    expect(Number(localStorage.getItem(PREFS_META_KEY))).toBe(2000)
  })

  it('servidor mais velho → local vence (nada muda)', () => {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify({ theme: 'light' }))
    localStorage.setItem(PREFS_META_KEY, '5000')
    const applied = applyOperatorState([serverItem('prefs', 'values', { theme: 'dark' }, 1000)])
    expect(applied).toBe(false)
    const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
    expect(userData.theme).toBe('light')
  })

  it('key fora da whitelist → ignorada SEMPRE (segurança)', () => {
    const applied = applyOperatorState([
      serverItem(
        'prefs',
        'values',
        { theme: 'dark', token: 'EVIL', 'session.x': 1, liturgyState: {}, scheduledState: {}, 'random.session': {} },
        9999,
      ),
    ])
    const userData = JSON.parse(localStorage.getItem(USER_DATA_KEY) ?? '{}')
    expect(userData.theme).toBe('dark') // whitelist aplicou
    expect(userData.token).toBeUndefined()
    expect(userData['session.x']).toBeUndefined()
    expect(userData.liturgyState).toBeUndefined() // namespaces próprias nunca viajam como pref
    expect(userData.scheduledState).toBeUndefined()
    expect(userData['random.session']).toBeUndefined()
    expect(applied).toBe(true)
  })

  it('whitelist cobre o contrato app#349 (paridade app/web)', () => {
    for (const key of ['theme', 'blur', 'accent', 'language', 'ui.zoom', 'clock.config', 'timer.config', 'countdown.config', 'random.config']) {
      expect(SYNCABLE_PREF_KEYS.has(key)).toBe(true)
    }
    for (const key of ['token', 'random.session', 'liturgy.state', 'scheduled.state']) {
      expect(SYNCABLE_PREF_KEYS.has(key)).toBe(false)
    }
  })

  it('payload não-objeto → ignorado', () => {
    expect(applyOperatorState([serverItem('prefs', 'values', 'nope', 9999)])).toBe(false)
  })

  it('markLocalPrefsPushed protege o push local no próximo pull', () => {
    markLocalPrefsPushed(8000)
    expect(applyOperatorState([serverItem('prefs', 'values', { theme: 'dark' }, 4000)])).toBe(false)
  })
})

describe('resiliência', () => {
  it('value_json corrompido → ignorado sem quebrar', () => {
    const item = {
      client_uuid: 'x',
      namespace: 'scheduled',
      key: 'items',
      value_json: '{not json',
      updated_at_ms: 9999,
      deleted_at: null,
    }
    expect(applyOperatorState([item])).toBe(false)
  })

  it('namespace desconhecida → ignorada (não afeta as demais)', () => {
    writeScheduled(LOCAL_STATE)
    localStorage.setItem(SCHEDULED_META_KEY, '100')
    const applied = applyOperatorState([
      serverItem('stage', 'settings', { anything: true }, 9999),
      serverItem('scheduled', 'items', { ...LOCAL_STATE, items: [] }, 50), // mais velho → local vence
    ])
    expect(applied).toBe(false)
    expect(readScheduled().items).toHaveLength(1)
  })
})
