import { beforeEach, describe, expect, it, vi } from 'vitest'

// user-preferences em memória
const store = new Map<string, unknown>()
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: (k: string, fallback?: unknown) =>
    store.has(k) ? store.get(k) : fallback,
  setUserPreference: (k: string, v: unknown) => {
    store.set(k, v)
  },
}))

let mod: typeof import('./projection-preferences')

beforeAll(async () => {
  mod = await import('./projection-preferences')
})

describe('projection-preferences', () => {
  beforeEach(() => {
    store.clear()
  })

  it('getPopupCount default = 2', () => {
    expect(mod.getPopupCount()).toBe(2)
  })

  it('setPopupCount clampa em 1–6 (string e número)', () => {
    expect(mod.setPopupCount(4)).toBe(4)
    expect(mod.setPopupCount(0)).toBe(1)
    expect(mod.setPopupCount(99)).toBe(6)
    // string numérica
    expect(mod.setPopupCount('3' as unknown as number)).toBe(3)
    // lixo → default 2
    expect(mod.setPopupCount('abc' as unknown as number)).toBe(2)
  })

  it('getTargetPopupSlots default = todas as telas disponíveis', () => {
    mod.setPopupCount(3)
    expect(mod.getTargetPopupSlots()).toEqual([1, 2, 3])
  })

  it('setTargetPopupSlots filtra inválidos, dedup e ordena', () => {
    mod.setPopupCount(4)
    const res = mod.setTargetPopupSlots([4, 1, 99, 1, 2.7])
    expect(res).toEqual([1, 4])
  })

  it('toggleTargetPopupSlot liga/desliga slot', () => {
    mod.setPopupCount(3)
    expect(mod.toggleTargetPopupSlot(2)).toEqual([1, 2, 3].filter((s) => s !== 2))
    expect(mod.toggleTargetPopupSlot(2)).toEqual([1, 2, 3])
    // slot fora do range → inalterado
    expect(mod.toggleTargetPopupSlot(9)).toEqual([1, 2, 3])
  })

  it('reconcile: reduzir telas remove slots acima do limite', () => {
    mod.setPopupCount(4)
    mod.setTargetPopupSlots([1, 3, 4])
    mod.setPopupCount(2)
    // reduzir: 3 e 4 saem; 2 NÃO entra (reconcile só adiciona ao EXPANDIR)
    expect(mod.getTargetPopupSlots()).toEqual([1])
  })

  it('reconcile: aumentar telas seleciona as novas', () => {
    mod.setPopupCount(2)
    mod.setTargetPopupSlots([1])
    mod.setPopupCount(3)
    expect(mod.getTargetPopupSlots()).toEqual([1, 3])
  })

  it('projectionFullscreenMode: default true, set/get/toggle', () => {
    expect(mod.getProjectionFullscreenMode()).toBe(true)
    mod.setProjectionFullscreenMode(false)
    expect(mod.getProjectionFullscreenMode()).toBe(false)
    // valor não-booleano no store → fallback
    store.set('projection.fullscreenMode', 'sim')
    expect(mod.getProjectionFullscreenMode()).toBe(true)
  })

describe('projection-preferences — media toggles', () => {
  beforeEach(() => {
    store.clear()
  })

  it.each([
    ['mediaUseInternalPlayer', 'media_use_internal_player', true],
    ['mediaAutoProjectVideo', 'media_auto_project_video', true],
    ['mediaPauseOnMinimize', 'media_pause_on_minimize', false],
    ['mediaLazyLoad', 'media_lazy_load', true],
    ['mediaFadeAudio', 'media_fade_audio', true],
  ] as const)('%s: default, set e fallback de lixo', (fn, key, def) => {
    const get = mod[`get${fn.charAt(0).toUpperCase()}${fn.slice(1)}`] as () => boolean
    const set = mod[`set${fn.charAt(0).toUpperCase()}${fn.slice(1)}`] as (v: boolean) => void
    expect(get()).toBe(def)
    set(!def)
    expect(get()).toBe(!def)
    // lixo no store → default
    store.set(key, 'não-booleano')
    expect(get()).toBe(def)
  })

  it('PROJECTION_DEFAULTS expostos', () => {
    expect(mod.PROJECTION_DEFAULTS).toMatchObject({
      popupCountMin: 1,
      popupCountMax: 6,
    })
  })
})
})
