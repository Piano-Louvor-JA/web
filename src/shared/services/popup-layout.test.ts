import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * browser-storage em memória (localStorage-like) para não depender de jsdom
 * storage com semântica parcial.
 */
const store = new Map<string, string>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (k: string) => {
    const raw = store.get(k)
    return raw === undefined ? null : JSON.parse(raw)
  },
  setBrowserItem: (k: string, v: unknown) => {
    store.set(k, JSON.stringify(v))
  },
  removeBrowserItem: (k: string) => {
    store.delete(k)
  },
}))

const LAYOUT_KEY = 'popup_layout'

let mod: typeof import('./popup-layout')

beforeAll(async () => {
  mod = await import('./popup-layout')
})

describe('popup-layout', () => {
  beforeEach(() => {
    store.clear()
  })

  it('getPopupSlotId/parseSlotIndex são inversos', () => {
    expect(mod.getPopupSlotId(3)).toBe('PopupWindow3')
    expect(mod.parseSlotIndex('PopupWindow12')).toBe(12)
    expect(mod.parseSlotIndex('LiturgyWebControl')).toBeNull()
    expect(mod.parseSlotIndex(null)).toBeNull()
    expect(mod.parseSlotIndex(undefined)).toBeNull()
    expect(mod.parseSlotIndex('random')).toBeNull()
  })

  it('getDefaultBounds: cascatas por índice (80,40 base; 60 offset)', () => {
    expect(mod.getDefaultBounds(1)).toEqual({
      left: 80,
      top: 40,
      width: 800,
      height: 600,
    })
    expect(mod.getDefaultBounds(3).left).toBe(200)
    expect(mod.getDefaultBounds(3).top).toBe(160)
  })

  it('getLayout default = {} quando storage vazio', () => {
    expect(mod.getLayout()).toEqual({})
    expect(mod.getLayoutEntry('PopupWindow1')).toBeNull()
  })

  it('saveSlotBounds normaliza, persiste e resolve', () => {
    mod.saveSlotBounds('PopupWindow1', {
      left: 10.4,
      top: 20.6,
      width: 800.2,
      height: 600.9,
      screenLeft: 0,
      screenTop: 0,
      screenWidth: 1920,
      screenHeight: 1080,
    })
    const entry = mod.getLayoutEntry('PopupWindow1')
    expect(entry).not.toBeNull()
    expect(entry!.left).toBe(10)
    expect(entry!.top).toBe(21)
    expect(entry!.width).toBe(800)
    expect(entry!.height).toBe(601)
    expect(entry!.screenWidth).toBe(1920)
  })

  it('saveSlotBounds ignora slotId vazio e bounds inválidos', () => {
    mod.saveSlotBounds('', { left: 1, top: 1, width: 800, height: 600 })
    expect(store.size).toBe(0)
    mod.saveSlotBounds('PopupWindow1', { left: 1, top: 1, width: 10, height: 10 })
    expect(store.size).toBe(0)
    mod.saveSlotBounds('PopupWindow1', { left: 'x', top: 1, width: 800, height: 600 })
    expect(store.size).toBe(0)
  })

  it('saveSlotBounds idempotente (mesmos valores não regravam)', () => {
    const b = { left: 5, top: 5, width: 800, height: 600 }
    mod.saveSlotBounds('PopupWindow2', b)
    const after1 = store.get(LAYOUT_KEY)
    mod.saveSlotBounds('PopupWindow2', b)
    expect(store.get(LAYOUT_KEY)).toBe(after1)
  })

  it('clearSlotBounds remove e ignora inexistente', () => {
    mod.saveSlotBounds('PopupWindow1', { left: 1, top: 1, width: 800, height: 600 })
    mod.clearSlotBounds('PopupWindow1')
    expect(mod.getLayoutEntry('PopupWindow1')).toBeNull()
    // inexistente: no-op sem erro
    expect(() => mod.clearSlotBounds('PopupWindow9')).not.toThrow()
    expect(() => mod.clearSlotBounds('')).not.toThrow()
  })

  it('resolveBounds cai no default sem layout salvo', () => {
    expect(mod.resolveBounds(2)).toEqual(mod.getDefaultBounds(2))
  })

  it('resolveBoundsForSlot: control → resolveControlBounds; slot → salvo/default; id inválido → null', () => {
    expect(mod.resolveBoundsForSlot(mod.LITURGY_CONTROL_LAYOUT_ID)).toEqual(
      mod.resolveControlBounds(),
    )
    expect(mod.resolveBoundsForSlot('PopupWindow1')).toEqual(
      mod.getDefaultBounds(1),
    )
    expect(mod.resolveBoundsForSlot('bogus')).toBeNull()
  })

  it('getDefaultControlBounds centraliza na tela disponível', () => {
    const b = mod.getDefaultControlBounds()
    expect(b.width).toBe(960)
    expect(b.height).toBe(540)
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.top).toBeGreaterThanOrEqual(0)
  })

  it('resolveControlBounds usa layout salvo antes do default', () => {
    mod.saveSlotBounds(mod.LITURGY_CONTROL_LAYOUT_ID, {
      left: 100,
      top: 50,
      width: 960,
      height: 540,
    })
    const b = mod.resolveControlBounds()
    expect(b.left).toBe(100)
    expect(b.top).toBe(50)
  })

  it('getLayoutEntry com bounds inválidos salvos → null (revalida)', () => {
    // grava direto no store pra burlar a validação do save
    store.set(
      LAYOUT_KEY,
      JSON.stringify({ PopupWindow1: { left: 1, top: 1, width: 50, height: 50 } }),
    )
    expect(mod.getLayoutEntry('PopupWindow1')).toBeNull()
  })

  it('getProjectionFullscreenBounds: usa monitor salvo quando completo', () => {
    mod.saveSlotBounds('PopupWindow1', {
      left: 10,
      top: 10,
      width: 800,
      height: 600,
      screenLeft: 1920,
      screenTop: 0,
      screenWidth: 1366,
      screenHeight: 768,
    })
    const b = mod.getProjectionFullscreenBounds(1)
    expect(b).toEqual({ left: 1920, top: 0, width: 1366, height: 768 })
  })

  it('getProjectionFullscreenBounds sem monitor salvo → monitor atual', () => {
    // jsdom screen: width/height 0 → código cai no `|| screen.width` (0) e
    // readScreenOrigin devolve 0/0. O contrato aqui é não crashar e
    // devolver estrutura completa.
    const b = mod.getProjectionFullscreenBounds(1)
    expect(b).toHaveProperty('left')
    expect(b).toHaveProperty('top')
    expect(b).toHaveProperty('width')
    expect(b).toHaveProperty('height')
  })

  it('getOpenFeatures/getControlOpenFeatures montam feature string', () => {
    const f = mod.getOpenFeatures(1)
    expect(f).toContain('popup=yes')
    expect(f).toContain('fullscreen=yes')
    expect(f).toMatch(/width=\d+/)
    expect(f).toContain('menubar=no')

    const c = mod.getControlOpenFeatures()
    expect(c).toContain('width=960')
    expect(c).toContain('height=540')
    expect(c).not.toContain('fullscreen')
  })

  it('scheduleRestoreOnWindow: ignora janela fechada/entry vazio', () => {
    expect(() => mod.scheduleRestoreOnWindow(null as never, null)).not.toThrow()
    const win = { closed: true } as unknown as Window
    expect(() => mod.scheduleRestoreOnWindow(win, { width: 800 })).not.toThrow()
  })

  it('resetLayout limpa tudo', () => {
    mod.saveSlotBounds('PopupWindow1', { left: 1, top: 1, width: 800, height: 600 })
    mod.resetLayout()
    expect(store.has(LAYOUT_KEY)).toBe(false)
  })

  it('requestWindowManagementPermission: sem API → resolve sem erro', async () => {
    await expect(mod.requestWindowManagementPermission()).resolves.toBeUndefined()
  })

  it('applyBounds: janela fechada/bounds inválidos → no-op', async () => {
    await expect(
      mod.applyBounds({ closed: true } as unknown as Window, { width: 800, height: 600, left: 0, top: 0 }),
    ).resolves.toBeUndefined()
    await expect(mod.applyBounds(window, null)).resolves.toBeUndefined()
  })
})
