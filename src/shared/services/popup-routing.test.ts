import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * popup-routing: rotas mirror/tv/slot por módulo com persistência em
 * localStorage (louvorja-popup-routing-v1) e helpers de destino cloud.
 */
let mod: typeof import('./popup-routing')

beforeAll(async () => {
  localStorage.clear()
  mod = await import('./popup-routing')
})

const MODULES = ['bible', 'media', 'liturgy-web', 'random', 'clock', 'timer', 'countdown']

beforeEach(() => {
  localStorage.clear()
  // restaura mirror em todos (estado module-level)
  for (const m of MODULES) {
    mod.setPopupRoute(m as never, 'mirror')
  }
})

describe('popup-routing', () => {
  it('default de todos os módulos = mirror', () => {
    const routes = mod.getPopupRoutes()
    for (const m of MODULES) {
      expect(routes[m as never]).toBe('mirror')
    }
  })

  it('get/set de rota individual persiste em localStorage', () => {
    mod.setPopupRoute('bible', '2')
    expect(mod.getPopupRoute('bible')).toBe('2')
    const raw = JSON.parse(localStorage.getItem('louvorja-popup-routing-v1') ?? '{}')
    expect(raw.bible).toBe('2')
    // sem persistir os outros
    expect(mod.getPopupRoute('clock')).toBe('mirror')
  })

  it('setPopupRoute aceita tv e palco:N', () => {
    mod.setPopupRoute('media', 'tv')
    mod.setPopupRoute('random', 'palco:3')
    expect(mod.getPopupRoute('media')).toBe('tv')
    expect(mod.getPopupRoute('random')).toBe('palco:3')
  })

  it('boot carrega rotas salvas do localStorage', async () => {
    localStorage.setItem(
      'louvorja-popup-routing-v1',
      JSON.stringify({ bible: '3', timer: 'tv' }),
    )
    vi.resetModules()
    const fresh = await import('./popup-routing')
    expect(fresh.getPopupRoute('bible')).toBe('3')
    expect(fresh.getPopupRoute('timer')).toBe('tv')
    expect(fresh.getPopupRoute('clock')).toBe('mirror')
    vi.resetModules()
  })

  it('localStorage corrompido no boot → defaults, sem crash', async () => {
    localStorage.setItem('louvorja-popup-routing-v1', '{quebrado')
    vi.resetModules()
    const fresh = await import('./popup-routing')
    expect(fresh.getPopupRoute('bible')).toBe('mirror')
    vi.resetModules()
  })

  it('isMirrorRoute e isCloudDestinationRoute', () => {
    mod.setPopupRoute('bible', '1')
    mod.setPopupRoute('media', 'tv')
    mod.setPopupRoute('clock', 'palco:2')
    expect(mod.isMirrorRoute('bible')).toBe(false)
    expect(mod.isMirrorRoute('timer')).toBe(true)
    expect(mod.isCloudDestinationRoute('media')).toBe(true)
    expect(mod.isCloudDestinationRoute('clock')).toBe(true)
    expect(mod.isCloudDestinationRoute('bible')).toBe(false)
  })

  it('resolveSlotsForModule: mirror→undefined; slot válido→[slot]; inválido→primeiro disponível', () => {
    const available = [1, 2, 3]
    mod.setPopupRoute('bible', 'mirror')
    expect(mod.resolveSlotsForModule('bible', available)).toBeUndefined()

    mod.setPopupRoute('bible', '2')
    expect(mod.resolveSlotsForModule('bible', available)).toEqual([2])

    mod.setPopupRoute('bible', '9') // fora da lista
    expect(mod.resolveSlotsForModule('bible', available)).toEqual([1])

    mod.setPopupRoute('bible', 'palco:1') // não numérico puro
    expect(mod.resolveSlotsForModule('bible', available)).toEqual([1])

    mod.setPopupRoute('bible', '2')
    expect(mod.resolveSlotsForModule('bible', [])).toBeUndefined()
  })

  it('módulo fora do map → mirror (fallback ?? )', () => {
    expect(mod.getPopupRoute('desconhecido' as never)).toBe('mirror')
  })
})
