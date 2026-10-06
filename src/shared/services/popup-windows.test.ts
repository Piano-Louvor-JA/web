import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * popup-windows com TODAS as dependências mockadas (layout, preferences,
 * routing, monitors, registry, browser-storage) — testamos a orquestração:
 * roteamento mirror/slot/tv/palco:N, ensurePopups (abrir/fechar/preservar),
 * janela de controle da liturgia e bridges de mensagem/broadcast.
 */

type FakeWin = {
  closed: boolean
  name: string
  __popupSlot?: number
  focus: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
  location: { href: string }
  document: { documentElement: { requestFullscreen: ReturnType<typeof vi.fn> } }
}

function makeFakeWindow(name: string, slot?: number): FakeWin {
  const w: FakeWin = {
    closed: false,
    name,
    focus: vi.fn(),
    close: vi.fn(),
    postMessage: vi.fn(),
    location: { href: '' },
    document: {
      documentElement: { requestFullscreen: vi.fn().mockResolvedValue(undefined) },
    },
  }
  if (slot !== undefined) w.__popupSlot = slot
  return w as unknown as FakeWin
}

// ---- mocks ----
const mockOpen = vi.fn()
const mockTimeouts: Array<{ delay: number; fn: () => void }> = []
const windowMessageListeners: Array<(e: MessageEvent) => void> = []
vi.stubGlobal('window', {
  ...globalThis.window,
  open: mockOpen,
  setTimeout: (fn: () => void, delay: number) => {
    mockTimeouts.push({ delay, fn })
    return mockTimeouts.length
  },
  location: { origin: 'https://x', href: 'https://x/' },
  addEventListener: (type: string, fn: (e: MessageEvent) => void) => {
    if (type === 'message') windowMessageListeners.push(fn)
  },
})

// popup-layout
let savedControlBounds: { left: number; top: number; width: number; height: number } | null = null
vi.mock('@shared/services/popup-layout', () => ({
  getPopupSlotId: (i: number) => `PopupWindow${i}`,
  parseSlotIndex: (s: string | null | undefined) => {
    const m = /^PopupWindow(\d+)$/.exec(s || '')
    return m ? Number.parseInt(m[1], 10) : null
  },
  LITURGY_CONTROL_LAYOUT_ID: 'LiturgyWebControl',
  getOpenFeatures: (i: number) => `feat-${i}`,
  getControlOpenFeatures: () => 'feat-control',
  resolveBoundsForSlot: vi.fn(() => savedControlBounds),
  saveSlotBounds: vi.fn(),
  captureCurrentBounds: vi.fn(() => null),
  scheduleRestoreOnWindow: vi.fn(),
  requestWindowManagementPermission: vi.fn(() => Promise.resolve()),
}))

// projection-preferences
const prefs = {
  count: 3,
  fullscreen: true,
  slots: [1, 2, 3],
}
vi.mock('@shared/services/projection-preferences', () => ({
  getPopupCount: () => prefs.count,
  getProjectionFullscreenMode: () => prefs.fullscreen,
  getTargetPopupSlots: () => prefs.slots,
}))

// popup-routing
vi.mock('./popup-routing', () => ({
  POPUP_ROUTABLE_MODULES: ['bible', 'media', 'liturgy-web', 'random', 'clock', 'timer', 'countdown'],
  getPopupRoute: vi.fn(() => 'mirror'),
}))

// slot-monitors
const slotAssignments: Record<string, string> = {}
vi.mock('@shared/services/slot-monitors', () => ({
  excludeOperatorSlots: (slots: number[]) => slots,
  loadSlotAssignments: vi.fn(() => slotAssignments),
}))

// browser-storage (módulo ativo)
const store = new Map<string, string>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (k: string) => {
    const raw = store.get(k)
    return raw === undefined ? null : JSON.parse(raw)
  },
  setBrowserItem: (k: string, v: unknown) => {
    store.set(k, JSON.stringify(v))
  },
}))

// popup-registry em memória
let registry: FakeWin[] = []
vi.mock('./popup-registry', () => ({
  getPopupRefs: () => registry.filter((p) => p && !(p as FakeWin).closed),
  setPopupRefs: (p: FakeWin[] | null | undefined) => {
    registry = (p || []).filter((x) => x && !x.closed)
    return registry
  },
}))

function openPopupModuleSync(moduleId: string, slots: number[]): boolean {
  let res = false
  void openPopupModule(moduleId, { slots }).then((r) => {
    res = r
  })
  // openPopupModule é async mas o caminho crítico (open) roda no 1º tick
  return res || true
}

import {
  closeAllPopups,
  closeScreenPopups,
  closeLiturgyControlWindow,
  exitPopupModule,
  getPopupModule,
  handlePopupBoundsMessage,
  hasLivePopups,
  installPopupOpenerBridge,
  isLiturgyControlOpen,
  isPopupModuleOpen,
  hasScreenPopups,
  LITURGY_CONTROL_WINDOW_NAME,
  openLiturgyControlWindow,
  openPopupModule,
  POPUP_STATE_CHANNEL,
  syncPopupWindows,
} from './popup-windows'
import { getPopupRoute } from './popup-routing'
import {
  captureCurrentBounds,
  saveSlotBounds,
} from '@shared/services/popup-layout'

const routeMock = vi.mocked(getPopupRoute)

beforeEach(async () => {
  // fecha janela de controle herdada do teste anterior (var module-level)
  closeLiturgyControlWindow()
  for (const k of Object.keys(slotAssignments)) delete slotAssignments[k]
  savedControlBounds = null
  ;(window as unknown as { louvorja?: unknown }).louvorja = undefined
  registry = []
  store.clear()
  mockOpen.mockReset()
  routeMock.mockReset().mockReturnValue('mirror')
  mockTimeouts.length = 0
  vi.mocked(saveSlotBounds).mockClear()
  vi.mocked(captureCurrentBounds).mockClear()
})

describe('popup-windows — estado', () => {
  it('hasLivePopups/isPopupModuleOpen/getPopupModule refletem registry+storage', async () => {
    expect(hasLivePopups()).toBe(false)
    expect(isPopupModuleOpen('bible')).toBe(false)
    store.set('louvorja_popup_module', JSON.stringify('bible'))
    expect(getPopupModule()).toBe('bible')
    // sem popups vivos → false mesmo com módulo ativo
    expect(isPopupModuleOpen('bible')).toBe(false)
    registry = [makeFakeWindow('PopupWindow1', 1) as never]
    expect(isPopupModuleOpen('bible')).toBe(true)
    expect(isPopupModuleOpen('media')).toBe(false)
    expect(hasLivePopups()).toBe(true)
  })

  it('isLiturgyControlOpen: false sem controle; true após abrir com sucesso', async () => {
    expect(isLiturgyControlOpen()).toBe(false)
    const win = makeFakeWindow(LITURGY_CONTROL_WINDOW_NAME)
    mockOpen.mockReturnValue(win)
    expect(openLiturgyControlWindow()).toBe(true)
    expect(isLiturgyControlOpen()).toBe(true)
    closeLiturgyControlWindow()
    expect(isLiturgyControlOpen()).toBe(false)
    expect(win.close).toHaveBeenCalled()
  })
})

describe('popup-windows — openPopupModule', () => {
  it('rota mirror abre todos os slots alvo e define módulo', async () => {
    const byName: Record<string, FakeWin> = {
      PopupWindow1: makeFakeWindow('PopupWindow1', 1),
      PopupWindow2: makeFakeWindow('PopupWindow2', 2),
      PopupWindow3: makeFakeWindow('PopupWindow3', 3),
    }
    mockOpen.mockImplementation((_url: string, name: string) => byName[name] ?? null)
    const res = await openPopupModule('clock')
    expect(res).toBe(true)
    expect(getPopupModule()).toBe('clock')
    expect(registry).toHaveLength(3)
    expect(mockOpen).toHaveBeenCalledTimes(3)
    // fullscreen web (preferência ON) nos três
    for (const w of Object.values(byName)) {
      expect(w.document.documentElement.requestFullscreen).toHaveBeenCalled()
    }
  })

  it('preferência fullscreen OFF não chama requestFullscreen', async () => {
    prefs.fullscreen = false
    const w1 = makeFakeWindow('PopupWindow1', 1)
    mockOpen.mockReturnValue(w1)
    await openPopupModule('clock', { slots: [1] })
    expect(w1.document.documentElement.requestFullscreen).not.toHaveBeenCalled()
    prefs.fullscreen = true
  })

  it('rota de slot dedicado abre SÓ aquele slot', async () => {
    routeMock.mockReturnValue('2')
    const w2 = makeFakeWindow('PopupWindow2', 2)
    mockOpen.mockReturnValue(w2)
    const res = await openPopupModule('bible')
    expect(res).toBe(true)
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockOpen.mock.calls[0][1]).toBe('PopupWindow2')
  })

  it("rota 'tv' NÃO abre popup nenhum, mas registra o módulo", async () => {
    routeMock.mockReturnValue('tv')
    const res = await openPopupModule('media')
    expect(res).toBe(true)
    expect(mockOpen).not.toHaveBeenCalled()
    expect(getPopupModule()).toBe('media')
  })

  it("rota 'palco:3' NÃO abre popup local", async () => {
    routeMock.mockReturnValue('palco:3')
    const res = await openPopupModule('bible')
    expect(res).toBe(true)
    expect(mockOpen).not.toHaveBeenCalled()
    expect(getPopupModule()).toBe('bible')
  })

  it('slot fora do range de getPopupCount é filtrado', async () => {
    prefs.count = 2
    prefs.slots = [1, 5]
    mockOpen.mockReturnValue(makeFakeWindow('PopupWindow1', 1) as never)
    const res = await openPopupModule('clock') // mirror, slots [1,5]
    expect(res).toBe(true)
    expect(mockOpen).toHaveBeenCalledTimes(1) // só slot 1
    prefs.count = 3
    prefs.slots = [1, 2, 3]
  })

  it('window.open bloqueado (null) → false e módulo limpo', async () => {
    mockOpen.mockReturnValue(null)
    const res = await openPopupModule('clock', { slots: [1] })
    expect(res).toBe(false)
    expect(getPopupModule()).toBe('')
  })

  it('ensurePopups fecha popups fora do alvo salvando bounds', async () => {
    // popup viva no slot 2; alvo é só slot 1
    const stale = makeFakeWindow('PopupWindow2', 2)
    registry = [stale as never]
    const w1 = makeFakeWindow('PopupWindow1', 1)
    mockOpen.mockReturnValue(w1)
    vi.mocked(captureCurrentBounds).mockReturnValue({
      left: 1,
      top: 2,
      width: 800,
      height: 600,
    })
    const res = await openPopupModule('clock', { slots: [1] })
    expect(res).toBe(true)
    expect(stale.close).toHaveBeenCalled()
    expect(saveSlotBounds).toHaveBeenCalledWith('PopupWindow2', {
      left: 1,
      top: 2,
      width: 800,
      height: 600,
    })
  })

  it('popup viva no slot alvo é preservada (não reabre)', async () => {
    const alive = makeFakeWindow('PopupWindow1', 1)
    registry = [alive as never]
    const res = await openPopupModule('clock', { slots: [1] })
    expect(res).toBe(true)
    expect(mockOpen).not.toHaveBeenCalled()
    expect(registry).toHaveLength(1)
    expect(registry[0]).toBe(alive)
  })
})

describe('popup-windows — controle da liturgia', () => {
  it('abre janela de controle; reabrir foca a existente', async () => {
    const win = makeFakeWindow(LITURGY_CONTROL_WINDOW_NAME)
    mockOpen.mockReturnValue(win)
    expect(openLiturgyControlWindow('liturgy-web')).toBe(true)
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('role=control'),
      LITURGY_CONTROL_WINDOW_NAME,
      'feat-control',
    )
    // segunda chamada: foco + href, sem novo open
    mockOpen.mockClear()
    expect(openLiturgyControlWindow('liturgy-web')).toBe(true)
    expect(mockOpen).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.location.href).toContain('module=liturgy-web')
  })

  it('open bloqueado no controle → false e limpa módulo se sem popups', async () => {
    mockOpen.mockReturnValue(null)
    expect(openLiturgyControlWindow()).toBe(false)
    expect(getPopupModule()).toBe('')
  })

  it('exitPopupModule fecha tudo (telas + controle) e limpa módulo', async () => {
    const w1 = makeFakeWindow('PopupWindow1', 1)
    const ctrl = makeFakeWindow(LITURGY_CONTROL_WINDOW_NAME)
    registry = [w1 as never]
    // simula controle aberto
    mockOpen.mockReturnValue(ctrl)
    openLiturgyControlWindow()
    await exitPopupModule()
    expect(w1.close).toHaveBeenCalled()
    expect(ctrl.close).toHaveBeenCalled()
    expect(getPopupModule()).toBe('')
    expect(hasLivePopups()).toBe(false)
  })

  it('closeScreenPopups fecha telas e mantém controle', async () => {
    const w1 = makeFakeWindow('PopupWindow1', 1)
    const ctrl = makeFakeWindow(LITURGY_CONTROL_WINDOW_NAME)
    registry = [w1 as never]
    mockOpen.mockReturnValue(ctrl)
    openLiturgyControlWindow()
    closeScreenPopups()
    expect(w1.close).toHaveBeenCalled()
    expect(ctrl.close).not.toHaveBeenCalled()
    expect(isLiturgyControlOpen()).toBe(true)
    closeAllPopups()
    expect(ctrl.close).toHaveBeenCalled()
  })
})

describe('popup-windows — sync e bridges', () => {
  it('syncPopupWindows retorna refs vivas e agenda syncs (50/250/800/1500ms)', async () => {
    const w1 = makeFakeWindow('PopupWindow1', 1)
    registry = [w1 as never]
    const res = syncPopupWindows()
    expect(res).toHaveLength(1)
    const delays = mockTimeouts.map((t) => t.delay)
    for (const d of [50, 250, 800, 1500]) expect(delays).toContain(d)
    // executa os callbacks sem crashar
    for (const t of mockTimeouts) t.fn()
  })

  it('syncStateTo postMessage nos popups vivos; fechado é ignorado', async () => {
    const alive = makeFakeWindow('PopupWindow1', 1)
    const dead = makeFakeWindow('PopupWindow2', 2)
    dead.closed = true
    registry = [alive as never, dead as never]
    store.set('louvorja_popup_module', JSON.stringify('clock'))
    syncPopupWindows()
    expect(alive.postMessage).toHaveBeenCalledWith(
      { param: 'popup_module', value: 'clock' },
      'https://x',
    )
    expect(dead.postMessage).not.toHaveBeenCalled()
  })

  it('handlePopupBoundsMessage delega pro saveSlotBounds', async () => {
    handlePopupBoundsMessage('PopupWindow1', { width: 800, height: 600, left: 0, top: 0 })
    expect(saveSlotBounds).toHaveBeenCalledWith('PopupWindow1', {
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    })
  })

  it('installPopupOpenerBridge: message popup-bounds grava layout; origin errado ignorado; idempotente', async () => {
    windowMessageListeners.length = 0
    installPopupOpenerBridge()
    installPopupOpenerBridge() // idempotente
    expect(windowMessageListeners).toHaveLength(1)

    // origin diferente → ignora
    windowMessageListeners[0]({ origin: 'https://evil', data: { action: 'popup-bounds', slot: 'PopupWindow1', bounds: { width: 800 } } } as MessageEvent)
    expect(saveSlotBounds).not.toHaveBeenCalled()

    // origin certo → grava
    windowMessageListeners[0]({ origin: 'https://x', data: { action: 'popup-bounds', slot: 'PopupWindow1', bounds: { width: 800, height: 600, left: 0, top: 0 } } } as unknown as MessageEvent)
    expect(saveSlotBounds).toHaveBeenCalledWith('PopupWindow1', { width: 800, height: 600, left: 0, top: 0 })
  })

  it('constantes de canal/window name expostas', async () => {
    expect(POPUP_STATE_CHANNEL).toBe('louvorja-popup-state')
    expect(LITURGY_CONTROL_WINDOW_NAME).toBe('LiturgyWebControl')
  })
})

describe('popup-windows — caudas (Electron bridge, erros, controle salvo)', () => {
  // módulo FRESCO: openerBridgeInstalled/controlWindowRef zerados
  let fresh: typeof import('./popup-windows')
  beforeAll(async () => {
    vi.resetModules()
    fresh = await import('./popup-windows')
  })

  beforeEach(() => {
    mockOpen.mockReset()
    routeMock.mockReset().mockReturnValue('mirror')
  })

  it('hasScreenPopups espelha registry', async () => {
    expect(hasScreenPopups()).toBe(false)
    registry = [makeFakeWindow('PopupWindow1', 1) as never]
    expect(hasScreenPopups()).toBe(true)
  })

  it('Electron: features ganham monitor=<displayId> mapeado da atribuição do slot', async () => {
    ;(window as unknown as { louvorja?: unknown }).louvorja = {
      isElectron: true,
      displays: {
        list: vi.fn().mockResolvedValue([
          { id: 7, bounds: { x: 1920, y: 0 } },
          { id: 3, bounds: { x: 0, y: 0 } },
        ]),
      },
    }
    slotAssignments['2'] = '1920:0' // slot 2 no monitor da direita
    const w2 = makeFakeWindow('PopupWindow2', 2)
    mockOpen.mockReturnValue(w2)
    fresh.installPopupOpenerBridge() // dispara primeElectronDisplays
    // aguarda o cache de displays encher (promise do .list resolve)
    await new Promise((r) => setTimeout(r, 10))
    await expect(fresh.openPopupModule('media', { slots: [2] })).resolves.toBe(true)
    const features = mockOpen.mock.calls[0][2] as string
    expect(features).toContain('monitor=7')
  })

  it('Electron sem display compatível → features sem monitor=', async () => {
    ;(window as unknown as { louvorja?: unknown }).louvorja = {
      isElectron: true,
      displays: { list: vi.fn().mockResolvedValue([{ id: 1, bounds: { x: 0, y: 0 } }]) },
    }
    slotAssignments['1'] = '9999:9999' // atribuição que não casa com display nenhum
    const w1 = makeFakeWindow('PopupWindow1', 1)
    mockOpen.mockReturnValue(w1)
    fresh.installPopupOpenerBridge()
    await new Promise((r) => setTimeout(r, 10))
    await expect(fresh.openPopupModule('media', { slots: [1] })).resolves.toBe(true)
    expect(mockOpen.mock.calls[0][2] as string).not.toContain('monitor=')
  })

  it('Electron: displays.list rejeita → cache vazio, fluxo web normal', async () => {
    ;(window as unknown as { louvorja?: unknown }).louvorja = {
      isElectron: true,
      displays: { list: vi.fn().mockRejectedValue(new Error('ipc down')) },
    }
    const w1 = makeFakeWindow('PopupWindow1', 1)
    mockOpen.mockReturnValue(w1)
    expect(() => fresh.installPopupOpenerBridge()).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    await expect(fresh.openPopupModule('media', { slots: [1] })).resolves.toBe(true)
  })

  it('popup tag sem __popupSlot: nome PopupWindowN usado; saveOpenPopupLayouts grava', async () => {
    const unnamed = makeFakeWindow('PopupWindow2') // sem slot
    registry = [unnamed as never]
    vi.mocked(captureCurrentBounds).mockReturnValue({ left: 9, top: 9, width: 800, height: 600 })
    fresh.syncPopupWindows() // roda ensurePopups → reindexa via name + requestBoundsReport
    expect(unnamed.__popupSlot).toBe(2)
    // bounds salvos: o ensurePopups de syncPopupWindows usa alvo default [1,2,3]; slot 2 está no alvo → só report, sem save. save acontece no exit:
    vi.mocked(saveSlotBounds).mockClear()
    await fresh.exitPopupModule()
    expect(saveSlotBounds).toHaveBeenCalledWith('PopupWindow2', { left: 9, top: 9, width: 800, height: 600 })
  })

  it('requestBoundsReport com postMessage lançando → console.log e segue', async () => {
    const broken = makeFakeWindow('PopupWindow1', 1)
    broken.postMessage.mockImplementation(() => { throw new Error('detached') })
    registry = [broken as never]
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => fresh.syncPopupWindows()).not.toThrow()
    log.mockRestore()
  })

  it('controle com bounds salvos → scheduleRestoreOnWindow chamado', async () => {
    savedControlBounds = { left: 10, top: 20, width: 960, height: 540 }
    const win = makeFakeWindow(LITURGY_CONTROL_WINDOW_NAME)
    mockOpen.mockReturnValue(win)
    expect(fresh.openLiturgyControlWindow()).toBe(true)
    const { scheduleRestoreOnWindow } = await import('@shared/services/popup-layout')
    expect(scheduleRestoreOnWindow).toHaveBeenCalledWith(win, savedControlBounds)
  })

  it('message close-screens fecha refs locais via handler instalado', async () => {
    const w1 = makeFakeWindow('PopupWindow1', 1)
    registry = [w1 as never]
    // instaladores são idempotentes (module var) — o bridge de testes
    // anteriores já registrou handlers; usamos o stub direto:
    if (windowMessageListeners.length === 0) {
      fresh.installPopupOpenerBridge()
    }
    const listener = windowMessageListeners[windowMessageListeners.length - 1]
    listener({ origin: 'https://x', data: { action: 'close-screens' } } as MessageEvent)
    expect(w1.close).toHaveBeenCalled()
  })
})

