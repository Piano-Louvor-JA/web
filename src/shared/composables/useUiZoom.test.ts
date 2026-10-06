import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * matchMedia + user-preferences mockados; location de página normal
 * (não-popup) para o zoom ficar habilitado.
 */
const listeners: Array<(e: { matches: boolean }) => void> = []
let mobileMatches = false
const mql = {
  get matches() {
    return mobileMatches
  },
  addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
    listeners.push(fn)
  },
  removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  },
}
if (
  typeof window !== 'undefined' &&
  typeof window.matchMedia !== 'function'
) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => mql,
  })
}

// user-preferences em memória
const store = new Map<string, unknown>()
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: (k: string) => store.get(k),
  setUserPreference: (k: string, v: unknown) => {
    store.set(k, v)
  },
}))

vi.mock('@design-system/tokens/breakpoints', () => ({
  breakpoints: { md: 960 },
}))

const UI_ZOOM_KEY = 'ui.zoom'

let mod: typeof import('./useUiZoom')

beforeAll(async () => {
  // location normal (não popup)
  window.history.replaceState(null, '', '/')
  mod = await import('./useUiZoom')
  mod.initUiZoom()
})

function setMobile(mobile: boolean) {
  mobileMatches = mobile
  for (const fn of [...listeners]) fn({ matches: mobile })
}

describe('useUiZoom', () => {
  beforeEach(() => {
    store.clear()
    setMobile(false)
    mod.useUiZoom().resetZoom()
  })

  it('zoom padrão 100% e percentual formatado', () => {
    const z = mod.useUiZoom()
    expect(z.zoom.value).toBe(1)
    expect(z.zoomPercent.value).toBe(100)
  })

  it('setZoom aplica, persiste e clampa nos limites (0.7–1.5)', () => {
    const z = mod.useUiZoom()
    expect(z.setZoom(1.3)).toBe(1.3)
    expect(store.get(UI_ZOOM_KEY)).toBe(1.3)
    // acima do máximo
    expect(z.setZoom(2.5)).toBe(1.5)
    // abaixo do mínimo
    expect(z.setZoom(0.1)).toBe(0.7)
  })

  it('snapZoom: 0.99–1.01 viram 1.0', () => {
    const z = mod.useUiZoom()
    expect(z.setZoom(1.01)).toBe(1)
    expect(z.setZoom(0.99)).toBe(1)
  })

  it('zoomIn/zoomOut sobem/descem por nível 1.2^0.5', () => {
    const z = mod.useUiZoom()
    z.zoomIn()
    const afterIn = z.zoom.value
    expect(afterIn).toBeGreaterThan(1)
    z.zoomOut()
    expect(z.zoom.value).toBeCloseTo(1, 5)
  })

  it('zoomIn/zoomOut param nos limites', () => {
    const z = mod.useUiZoom()
    for (let i = 0; i < 20; i++) z.zoomIn()
    expect(z.zoom.value).toBe(1.5)
    expect(z.canZoomIn.value).toBe(false)
    for (let i = 0; i < 20; i++) z.zoomOut()
    expect(z.zoom.value).toBe(0.7)
    expect(z.canZoomOut.value).toBe(false)
    // e pode voltar a dar in a partir do mínimo
    expect(z.canZoomIn.value).toBe(true)
  })

  it('resetZoom volta ao padrão', () => {
    const z = mod.useUiZoom()
    z.setZoom(1.4)
    z.resetZoom()
    expect(z.zoom.value).toBe(1)
  })

  it('atalho Ctrl+= dá zoom in; Ctrl+- dá out; Ctrl+0 reseta', () => {
    const z = mod.useUiZoom()
    const fire = (init: KeyboardEventInit) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }))

    fire({ key: '=', ctrlKey: true, cancelable: true })
    expect(z.zoom.value).toBeGreaterThan(1)

    fire({ key: '-', ctrlKey: true, cancelable: true })
    expect(z.zoom.value).toBeCloseTo(1, 5)

    z.setZoom(1.4)
    fire({ key: '0', ctrlKey: true, cancelable: true })
    expect(z.zoom.value).toBe(1)
  })

  it('atalho sem Ctrl é ignorado', () => {
    const z = mod.useUiZoom()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '=', bubbles: true }),
    )
    expect(z.zoom.value).toBe(1)
  })

  it('mobile: zoom desabilitado — setZoom zera CSS e volta ao padrão', () => {
    setMobile(true)
    const z = mod.useUiZoom()
    expect(z.setZoom(1.4)).toBe(1)
    expect(z.canZoomIn.value).toBe(false)
    // documentElement sem propriedade zoom
    expect(
      document.documentElement.style.getPropertyValue('zoom') || '',
    ).toBe('')
  })

  it('popup: location #/popup → zoom desabilitado', () => {
    window.location.hash = '#/popup'
    const z = mod.useUiZoom()
    expect(z.setZoom(1.4)).toBe(1)
    window.location.hash = ''
  })

  it('preferência persistida como string numérica é lida no boot', async () => {
    store.set(UI_ZOOM_KEY, '1.25')
    // syncZoomToViewport reaplica o persistido
    const z = mod.useUiZoom()
    // dispara sync via initUiZoom (idempotente p/ listeners)
    mod.initUiZoom()
    expect(z.zoom.value).toBe(1.25)
  })

  it('preferência inválida (não numérica) → padrão', () => {
    store.set(UI_ZOOM_KEY, 'abc')
    const z = mod.useUiZoom()
    mod.initUiZoom()
    expect(z.zoom.value).toBe(1)
  })

describe('useUiZoom — caudas', () => {
  beforeEach(() => {
    store.clear()
    setMobile(false)
    mod.useUiZoom().resetZoom()
  })

  it('stored numérico (não string) é lido e clamped no boot', async () => {
    store.set(UI_ZOOM_KEY, 1.3)
    mod.initUiZoom()
    expect(mod.useUiZoom().zoom.value).toBe(1.3)
    // fora do range → clamp
    store.set(UI_ZOOM_KEY, 42)
    mod.initUiZoom()
    expect(mod.useUiZoom().zoom.value).toBe(1.5)
  })

  it('atalhos alternativos: NumpadAdd, NumpadSubtract, Digit0/Numpad0, metaKey, com alt ignorado', () => {
    const z = mod.useUiZoom()
    const fire = (init: KeyboardEventInit) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }))

    fire({ code: 'NumpadAdd', key: '+', ctrlKey: true })
    expect(z.zoom.value).toBeGreaterThan(1)
    fire({ code: 'NumpadSubtract', key: '-', ctrlKey: true })
    expect(z.zoom.value).toBeCloseTo(1, 5)
    fire({ code: 'NumpadAdd', key: '+', metaKey: true })
    expect(z.zoom.value).toBeGreaterThan(1)
    fire({ key: '0', metaKey: true, code: 'Digit0' })
    expect(z.zoom.value).toBe(1)
    // alt+combo não é atalho de zoom
    fire({ key: '+', ctrlKey: true, altKey: true })
    expect(z.zoom.value).toBe(1)
    // tecla sem ação de zoom (ex.: 'x' com ctrl) é ignorada
    fire({ key: 'x', ctrlKey: true })
    expect(z.zoom.value).toBe(1)
  })

  it('mobile desabilita: zoomIn/zoomOut/reset/shortcut e canZoom* false', () => {
    setMobile(true)
    const z = mod.useUiZoom()
    z.setZoom(1) // set em mobile zera
    z.zoomIn()
    z.zoomOut()
    z.resetZoom()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true }))
    expect(z.zoom.value).toBe(1)
    expect(z.canZoomIn.value).toBe(false)
    expect(z.canZoomOut.value).toBe(false)
    expect(z.zoomPercent.value).toBe(100)
  })

  it('popup (hash #/popup) desabilita zoom por completo', () => {
    window.location.hash = '#/popup'
    const z = mod.useUiZoom()
    z.setZoom(1.4)
    z.zoomIn()
    expect(z.zoom.value).toBe(1)
    expect(z.canZoomIn.value).toBe(false)
    window.location.hash = ''
  })

  it('resetZoom em mobile é no-op (não reseta de outro módulo ativo)', () => {
    setMobile(true)
    const z = mod.useUiZoom()
    z.resetZoom()
    expect(z.zoom.value).toBe(1)
  })

  it('formatZoomPercent arredonda frações', () => {
    const z = mod.useUiZoom()
    z.setZoom(1.234)
    expect(z.zoomPercent.value).toBe(123)
    z.setZoom(0.777)
    expect(z.zoomPercent.value).toBe(78)
  })
})

describe('useUiZoom — ciclo de vida (onMounted)', () => {
  beforeEach(() => {
    store.clear()
    setMobile(false)
  })

  it('montar componente chama install + sync (232-234)', async () => {
    const { mount } = await import('@vue/test-utils')
    const { defineComponent, h } = await import('vue')
    store.set(UI_ZOOM_KEY, '1.2')
    const wrapper = mount(
      defineComponent({
        setup() {
          mod.useUiZoom()
          return () => h('div')
        },
      }),
    )
    expect(mod.useUiZoom().zoom.value).toBe(1.2)
    wrapper.unmount()
  })
})
})
