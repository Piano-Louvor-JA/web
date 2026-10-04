/**
 * sync v2 fase 2 (web#183) — applyOperatorState (pull LWW).
 * Paridade dos testes do app (app#336, operator-state-apply.test.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { setUserPreference } from '@shared/services/user-preferences'

import {
  applyOperatorState,
  currentLiturgyOperatorItem,
  markLocalLiturgyPushed,
} from '../operator-state-apply'

const META_KEY = 'louvorja:sync:liturgy:week:updatedAt'

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    client_uuid: 'u1',
    namespace: 'liturgy',
    key: 'week',
    value_json: JSON.stringify({ weekdays: { sun: [] }, dayNotes: {} }),
    updated_at_ms: 5000,
    deleted_at: null,
    ...overrides,
  }
}

describe('operator-state-apply', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('aplica estado do servidor mais novo e registra updatedAt', () => {
    const applied = applyOperatorState([item({ updated_at_ms: 5000 })])
    expect(applied).toBe(true)
    expect(localStorage.getItem(META_KEY)).toBe('5000')
    const stored = JSON.parse(localStorage.getItem('user_data') ?? '{}')
    expect(stored[USER_PREFERENCE_KEYS.liturgyState]).toEqual({
      weekdays: { sun: [] },
      dayNotes: {},
    })
  })

  it('LWW: servidor mais velho que o local não aplica', () => {
    localStorage.setItem(META_KEY, '9000')
    const applied = applyOperatorState([item({ updated_at_ms: 1000 })])
    expect(applied).toBe(false)
    expect(localStorage.getItem(META_KEY)).toBe('9000')
  })

  it('empate (updated_at_ms igual) não aplica (local vence)', () => {
    localStorage.setItem(META_KEY, '5000')
    expect(applyOperatorState([item({ updated_at_ms: 5000 })])).toBe(false)
  })

  it('sem estado local aplica direto (novo dispositivo)', () => {
    expect(applyOperatorState([item()])).toBe(true)
  })

  it('item deletado (deleted_at) é ignorado', () => {
    expect(applyOperatorState([item({ deleted_at: 1234 })])).toBe(false)
  })

  it('namespace/key desconhecida é ignorada', () => {
    expect(
      applyOperatorState([item({ namespace: 'unknown', key: 'x' })]),
    ).toBe(false)
    expect(
      applyOperatorState([item({ key: 'month' })]),
    ).toBe(false)
  })

  it('value_json inválido é ignorado sem quebrar', () => {
    expect(
      applyOperatorState([item({ value_json: '{não-json' })]),
    ).toBe(false)
  })

  it('payload que não é estado de liturgia é ignorado', () => {
    expect(applyOperatorState([item({ value_json: '{"foo":1}' })])).toBe(false)
  })

  it('marca push local e o próximo pull mais velho perde', () => {
    markLocalLiturgyPushed(7777)
    expect(localStorage.getItem(META_KEY)).toBe('7777')
    expect(applyOperatorState([item({ updated_at_ms: 100 })])).toBe(false)
  })

  it('currentLiturgyOperatorItem lê o estado atual da liturgia', () => {
    expect(currentLiturgyOperatorItem()).toBeNull()
    const state = { weekdays: { sun: [] }, dayNotes: {}, customLiturgies: [] }
    setUserPreference(USER_PREFERENCE_KEYS.liturgyState, state)
    const current = currentLiturgyOperatorItem()
    expect(current).not.toBeNull()
    expect(current!.namespace).toBe('liturgy')
    expect(current!.key).toBe('week')
    expect(JSON.parse(current!.value_json)).toEqual(state)
  })

  it('processa lista com itens mistos aplicando só os válidos', () => {
    const applied = applyOperatorState([
      item({ client_uuid: 'a', namespace: 'other' }),
      item({ client_uuid: 'b', value_json: 'lixo' }),
      item({ client_uuid: 'c', updated_at_ms: 6000 }),
    ])
    expect(applied).toBe(true)
    expect(localStorage.getItem(META_KEY)).toBe('6000')
  })
})
