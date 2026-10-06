import { beforeEach, describe, expect, it, vi } from 'vitest'

// browser-storage real (jsdom localStorage)
import {
  clearUserPreferences,
  getUserPreference,
  loadUserPreferences,
  setUserPreference,
  saveUserPreferences,
} from './user-preferences'

const KEY = 'louvorja_user_preferences'

describe('user-preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('load com storage vazio → {}', () => {
    expect(loadUserPreferences()).toEqual({})
  })

  it('set/get roundtrip; chave ausente → fallback', () => {
    expect(getUserPreference('zoom')).toBeNull()
    expect(getUserPreference('zoom', 1.25)).toBe(1.25)
    const next = setUserPreference('zoom', 1.4)
    expect(next).toEqual({ zoom: 1.4 })
    expect(getUserPreference('zoom')).toBe(1.4)
    // persistiu no storage
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ zoom: 1.4 })
  })

  it('set preserva outras chaves; save sobrescreve tudo; clear zera', () => {
    setUserPreference('a', 1)
    setUserPreference('b', 2)
    expect(loadUserPreferences()).toEqual({ a: 1, b: 2 })
    saveUserPreferences({ c: 3 })
    expect(loadUserPreferences()).toEqual({ c: 3 })
    clearUserPreferences()
    expect(loadUserPreferences()).toEqual({})
    expect(getUserPreference('c')).toBeNull()
  })

  it('storage com null (JSON "null") → {} pelo fallback', () => {
    localStorage.setItem(KEY, 'null')
    expect(loadUserPreferences()).toEqual({})
  })
})

// registry: teste direto do módulo (popup-windows usa indireto)
describe('popup-registry', () => {
  let reg: typeof import('./popup-registry')

  beforeEach(async () => {
    vi.resetModules()
    reg = await import('./popup-registry')
  })

  function fakeWin(closed = false) {
    return { closed } as unknown as Window & { __popupSlot?: number }
  }

  it('set/get: filtra fechadas e null; null/undefined limpa tudo', () => {
    const w1 = fakeWin(false)
    const dead = fakeWin(true)
    expect(reg.setPopupRefs([w1, dead, null as never])).toHaveLength(1)
    expect(reg.getPopupRefs()).toEqual([w1])
    reg.setPopupRefs(null)
    expect(reg.getPopupRefs()).toEqual([])
    reg.setPopupRefs(undefined)
    expect(reg.getPopupRefs()).toEqual([])
  })

  it('getPopupRefs remove janelas que fecharam desde a última set', () => {
    const w = fakeWin(false)
    reg.setPopupRefs([w])
    ;(w as unknown as { closed: boolean }).closed = true
    expect(reg.getPopupRefs()).toEqual([])
  })

  it('hasOpenPopups espelha registry', () => {
    expect(reg.hasOpenPopups()).toBe(false)
    reg.setPopupRefs([fakeWin(false)])
    expect(reg.hasOpenPopups()).toBe(true)
  })
})
