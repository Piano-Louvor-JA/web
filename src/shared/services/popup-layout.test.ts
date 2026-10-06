import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('popup-layout — capture/apply/restore (janelas fake)', () => {
  beforeEach(() => {
    store.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeWin(overrides: Record<string, unknown> = {}) {
    return {
      closed: false,
      screenX: 100,
      screenY: 50,
      outerWidth: 800,
      outerHeight: 600,
      screen: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080, width: 1920, height: 1080 },
      resizeTo: vi.fn(),
      moveTo: vi.fn(),
      getScreenDetails: undefined as unknown,
      ...overrides,
    } as unknown as Window & Record<string, ReturnType<typeof vi.fn>>
  }

  it('captureCurrentBounds: janela normal → bounds + screen enriquecido', async () => {
    const w = makeWin()
    const bounds = mod.captureCurrentBounds(w as unknown as Window)
    expect(bounds).toMatchObject({ left: 100, top: 50, width: 800, height: 600, screenLeft: 0, screenTop: 0, screenWidth: 1920, screenHeight: 1080 })
  })

  it('captureCurrentBounds: janela pequena demais → null', () => {
    const w = makeWin({ outerWidth: 50, outerHeight: 40 })
    expect(mod.captureCurrentBounds(w as unknown as Window)).toBeNull()
  })

  it('applyBounds: mesma tela → só resize/move; sem getScreenDetails → moveTo default', async () => {
    const w = makeWin()
    await mod.applyBounds(w as unknown as Window, { left: 200, top: 100, width: 900, height: 700, screenLeft: 0, screenTop: 0 })
    expect(w.resizeTo).toHaveBeenCalledWith(900, 700)
    expect(w.moveTo).toHaveBeenCalledWith(200, 100)
  })

  it('applyBounds: tela salva diferente + getScreenDetails achando o monitor → clamp no monitor', async () => {
    const screenDetails = {
      screens: [{ availLeft: 1920, availTop: 0, availWidth: 1366, availHeight: 768 }],
    }
    const w = makeWin({
      getScreenDetails: vi.fn().mockResolvedValue(screenDetails),
    })
    // entrada salva no monitor 2 (1920,0) — janela atual está no monitor 1
    await mod.applyBounds(w as unknown as Window, { left: 2000, top: 100, width: 800, height: 600, screenLeft: 1920, screenTop: 0, screenWidth: 1366, screenHeight: 768 })
    // clamp: left entre 1920 e 1920+1366-800=2486 → 2000 ok; top entre 0 e 168 → 100 ok
    expect(w.moveTo).toHaveBeenLastCalledWith(2000, 100)
    expect(w.resizeTo).toHaveBeenLastCalledWith(800, 600)
  })

  it('applyBounds: getScreenDetails sem monitor compatível → moveTo original', async () => {
    const w = makeWin({ getScreenDetails: vi.fn().mockResolvedValue({ screens: [] }) })
    await mod.applyBounds(w as unknown as Window, { left: 2000, top: 100, width: 800, height: 600, screenLeft: 9999, screenTop: 9999 })
    expect(w.moveTo).toHaveBeenLastCalledWith(2000, 100)
  })

  it('applyBounds: resize lança → catch silencioso (console.log)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const w = makeWin({ resizeTo: vi.fn(() => { throw new Error('boom') }) })
    await expect(mod.applyBounds(w as unknown as Window, { left: 1, top: 1, width: 800, height: 600 })).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('scheduleRestoreOnWindow agenda as 7 tentativas e respeita closed', async () => {
    const w = makeWin()
    mod.scheduleRestoreOnWindow(w as unknown as Window, { left: 1, top: 1, width: 800, height: 600 })
    await vi.advanceTimersByTimeAsync(2100)
    expect(w.resizeTo).toHaveBeenCalled()
    // janela fechada → callbacks não fazem nada
    const w2 = makeWin({ closed: true })
    mod.scheduleRestoreOnWindow(w2 as unknown as Window, { left: 1, top: 1, width: 800, height: 600 })
    await vi.advanceTimersByTimeAsync(2100)
    expect(w2.resizeTo).not.toHaveBeenCalled()
  })

  it('requestWindowManagementPermission: com API ok e com erro', async () => {
    const w = makeWin({ getScreenDetails: vi.fn().mockResolvedValue({ screens: [] }) })
    window.getScreenDetails = w.getScreenDetails as never
    await expect(mod.requestWindowManagementPermission()).resolves.toBeUndefined()
    window.getScreenDetails = vi.fn().mockRejectedValue(new Error('denied')) as never
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(mod.requestWindowManagementPermission()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
    delete (window as { getScreenDetails?: unknown }).getScreenDetails
  })

describe('popup-layout — caudas getScreenDetails', () => {
  beforeEach(() => {
    store.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as { getScreenDetails?: unknown }).getScreenDetails
  })

  function makeWin(overrides: Record<string, unknown> = {}) {
    return {
      closed: false,
      screenX: 100,
      screenY: 50,
      outerWidth: 800,
      outerHeight: 600,
      screen: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080, width: 1920, height: 1080 },
      resizeTo: vi.fn(),
      moveTo: vi.fn(),
      ...overrides,
    } as unknown as Window & Record<string, ReturnType<typeof vi.fn>>
  }

  it('applyBounds: getScreenDetails acha o monitor → clamp dentro do monitor e re-aplica', async () => {
    const w = makeWin({
      getScreenDetails: vi.fn().mockResolvedValue({
        screens: [
          { availLeft: 1920, availTop: 0, availWidth: 1366, availHeight: 768 },
        ],
      }),
    })
    ;(window as unknown as { getScreenDetails?: unknown }).getScreenDetails = w.getScreenDetails
    // bounds salvos muito fora do monitor 2 → clampa para dentro dele
    await mod.applyBounds(w as unknown as Window, {
      left: 5000,
      top: -400,
      width: 800,
      height: 600,
      screenLeft: 1920,
      screenTop: 0,
      screenWidth: 1366,
      screenHeight: 768,
    })
    // left clamp: max(1920, min(5000, 1920+1366-800=2486)) = 2486
    // top clamp: max(0, min(-400, 0+768-600=168)) = 0
    expect(w.moveTo).toHaveBeenLastCalledWith(2486, 0)
    expect(w.resizeTo).toHaveBeenLastCalledWith(800, 600)
  })

  it('applyBounds: getScreenDetails lança → fallback moveTo original', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const w = makeWin({
      getScreenDetails: vi.fn().mockRejectedValue(new Error('no perm')),
    })
    ;(window as unknown as { getScreenDetails?: unknown }).getScreenDetails = w.getScreenDetails
    await mod.applyBounds(w as unknown as Window, {
      left: 2000,
      top: 100,
      width: 800,
      height: 600,
      screenLeft: 1920,
      screenTop: 0,
    })
    expect(w.moveTo).toHaveBeenLastCalledWith(2000, 100)
    log.mockRestore()
  })

  it('scheduleRestore: janela fecha entre os delays → callback não faz nada', async () => {
    const w = makeWin()
    mod.scheduleRestoreOnWindow(w as unknown as Window, { left: 1, top: 1, width: 800, height: 600 })
    await vi.advanceTimersByTimeAsync(100) // 0+50 já rodaram
    w.closed = true
    await vi.advanceTimersByTimeAsync(2000) // resto dos delays
    const calls = (w.resizeTo as ReturnType<typeof vi.fn>).mock.calls.length
    // depois de fechada não cresce
    await vi.advanceTimersByTimeAsync(100)
    expect((w.resizeTo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })

  it('enrichWithScreen: screen sem availWidth cai no width', async () => {
    const w = makeWin({
      screen: { availLeft: 5, availTop: 6, width: 1280, height: 720 },
    })
    const b = mod.captureCurrentBounds(w as unknown as Window)
    expect(b).toMatchObject({ screenLeft: 5, screenTop: 6, screenWidth: 1280, screenHeight: 720 })
  })
})

describe('popup-layout — caudas finais', () => {
  beforeEach(() => {
    store.clear()
  })

  it('getDefaultControlBounds com screen sem avail* (jsdom) → usa width/height como fallback', () => {
    // jsdom screen.width=0 → availWidth undefined → ?? width
    const b = mod.getDefaultControlBounds()
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.top).toBeGreaterThanOrEqual(0)
    expect(b.width).toBe(960)
  })

  it('enrichWithScreen: window sem screen → bounds originais (142)', () => {
    const w = { screenX: 1, screenY: 2, outerWidth: 800, outerHeight: 600, screen: undefined } as unknown as Window
    const b = mod.captureCurrentBounds(w)
    expect(b).toMatchObject({ left: 1, top: 2, width: 800, height: 600 })
    expect(b?.screenLeft).toBeUndefined()
  })

  it('isOnSavedScreen: entry sem screen coords → true (nao compara); window sem screen → true', async () => {
    const w = { screen: undefined, closed: false, resizeTo: vi.fn(), moveTo: vi.fn() } as unknown as Window
    // entry com screenLeft definido + window sem screen → true (não migra)
    await mod.applyBounds(w, { left: 1, top: 1, width: 800, height: 600, screenLeft: 100, screenTop: 100 })
    expect(w.moveTo).toHaveBeenCalledWith(1, 1)
  })

  it('findSavedScreen sem screenLeft no entry → null (210) — via applyBounds com getScreenDetails', async () => {
    const w = {
      closed: false,
      screen: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080, width: 1920, height: 1080 },
      resizeTo: vi.fn(),
      moveTo: vi.fn(),
    } as unknown as Window & Record<string, ReturnType<typeof vi.fn>>
    ;(window as unknown as { getScreenDetails?: unknown }).getScreenDetails = vi.fn().mockResolvedValue({ screens: [] })
    // entry SEM screenLeft → findSavedScreen null → moveTo original
    await mod.applyBounds(w, { left: 55, top: 66, width: 800, height: 600 })
    expect(w.moveTo).toHaveBeenLastCalledWith(55, 66)
    delete (window as { getScreenDetails?: unknown }).getScreenDetails
  })
})
})
