import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// matchMedia tem que existir ANTES do primeiro import do módulo (lê no
// import). jsdom não implementa matchMedia; instalamos no window logo no
// início — este módulo roda antes do import dinâmico do composable.
const listeners: Array<(e: { matches: boolean }) => void> = []
let matches = false
const mql = {
  get matches() {
    return matches
  },
  addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
    listeners.push(fn)
  },
  removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  },
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => mql,
  })
}

function setMobile(mobile: boolean) {
  matches = mobile
  for (const fn of listeners) fn({ matches })
}

// módulo carregado 1x por worker (estado module-level persiste entre testes)
let mod: typeof import('./useMobileDetection')

beforeAll(async () => {
  mod = await import('./useMobileDetection')
})

describe('useMobileDetection', () => {
  beforeEach(() => {
    matches = false
    // NÃO zerar listeners: o módulo registrou o dele no import (beforeAll);
    // zerar aqui o desconectaria dos testes seguintes.
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('desktop por padrão (viewport > 768)', () => {
    const { isMobile, isDesktop } = mod.useMobileDetection()
    expect(isMobile.value).toBe(false)
    expect(isDesktop.value).toBe(true)
  })

  it('reage a mudança do media query (desktop → mobile)', () => {
    const { isMobile, isDesktop } = mod.useMobileDetection()
    setMobile(true)
    expect(isMobile.value).toBe(true)
    expect(isDesktop.value).toBe(false)
    setMobile(false)
    expect(isMobile.value).toBe(false)
  })

  it('isDesktopOnlyRoute reconhece rotas da lista', () => {
    expect(mod.isDesktopOnlyRoute('settings-media')).toBe(true)
    expect(mod.isDesktopOnlyRoute('liturgy')).toBe(true)
    expect(mod.isDesktopOnlyRoute('home')).toBe(false)
    expect(mod.isDesktopOnlyRoute(null)).toBe(false)
    expect(mod.isDesktopOnlyRoute(undefined)).toBe(false)
    expect(mod.isDesktopOnlyRoute('')).toBe(false)
  })

  it('DESKTOP_ONLY_ROUTES inclui settings e projeção', () => {
    expect(mod.DESKTOP_ONLY_ROUTES).toContain('settings-appearance')
    expect(mod.DESKTOP_ONLY_ROUTES).toContain('settings-projection')
    expect(mod.DESKTOP_ONLY_ROUTES).toContain('media')
  })

  describe('useDesktopOnlyGuard', () => {
    it('mobile + rota desktop-only → bloqueia (false)', () => {
      setMobile(true)
      const { checkAndWarn } = mod.useDesktopOnlyGuard()
      expect(checkAndWarn('settings-media')).toBe(false)
    })

    it('mobile + rota normal → deixa passar', () => {
      setMobile(true)
      const { checkAndWarn } = mod.useDesktopOnlyGuard()
      expect(checkAndWarn('home')).toBe(true)
    })

    it('desktop + rota desktop-only → deixa passar', () => {
      setMobile(false)
      const { checkAndWarn } = mod.useDesktopOnlyGuard()
      expect(checkAndWarn('settings-media')).toBe(true)
    })

    it('sem rota → deixa passar', () => {
      setMobile(true)
      const { checkAndWarn } = mod.useDesktopOnlyGuard()
      expect(checkAndWarn(null)).toBe(true)
    })
  })

  it('DESKTOP_ONLY_MESSAGE tem campos de UI completos', () => {
    expect(mod.DESKTOP_ONLY_MESSAGE.title).toBeTruthy()
    expect(mod.DESKTOP_ONLY_MESSAGE.description).toBeTruthy()
    expect(mod.DESKTOP_ONLY_MESSAGE.actionLabel).toBeTruthy()
    expect(mod.DESKTOP_ONLY_MESSAGE.actionHref).toBe('/')
  })
})
