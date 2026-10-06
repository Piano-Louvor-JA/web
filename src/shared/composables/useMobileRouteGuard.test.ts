import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * matchMedia stub (mesmo padrão do useMobileDetection.test) — instalado
 * antes do import dinâmico do módulo.
 */
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

function setMobile(mobile: boolean) {
  matches = mobile
  for (const fn of [...listeners]) fn({ matches })
}

// mocks dos contextos Vue (composable usa useI18n/useRouter/useDisplay)
const pushMock = vi.fn()
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('vuetify', () => ({
  useDisplay: () => ({ smAndDown: { value: false } }),
}))

let mod: typeof import('./useMobileRouteGuard')

beforeAll(async () => {
  mod = await import('./useMobileRouteGuard')
})

describe('useMobileRouteGuard', () => {
  beforeEach(() => {
    matches = false
    setMobile(false)
    pushMock.mockReset()
    // reset do singleton dismissed via nova instância com routeKey única
  })

  it('desktop → checkRoute sempre true', () => {
    setMobile(false)
    const g = mod.useMobileRouteGuard({ routeKey: 'guard-a' })
    expect(g.checkRoute({ meta: {} } as any)).toBe(true)
    expect(g.isMobile.value).toBe(false)
    expect(g.shouldShowWarning.value).toBe(false)
  })

  it('mobile + rota não dismissada → bloqueia e mostra warning', () => {
    setMobile(true)
    const g = mod.useMobileRouteGuard({ routeKey: 'guard-b' })
    expect(g.checkRoute({ meta: {} } as any)).toBe(false)
    expect(g.shouldShowWarning.value).toBe(true)
  })

  it('dismissWarning → navegação liberada e warning some', () => {
    setMobile(true)
    const g = mod.useMobileRouteGuard({ routeKey: 'guard-c' })
    expect(g.checkRoute({ meta: {} } as any)).toBe(false)
    g.dismissWarning()
    expect(g.checkRoute({ meta: {} } as any)).toBe(true)
    expect(g.shouldShowWarning.value).toBe(false)
  })

  it('goToDesktop: dismiss + redirect se desktopRedirectRoute', () => {
    setMobile(true)
    const g = mod.useMobileRouteGuard({
      routeKey: 'guard-d',
      desktopRedirectRoute: 'home',
    })
    g.goToDesktop()
    expect(pushMock).toHaveBeenCalledWith('home')
    expect(g.shouldShowWarning.value).toBe(false)
  })

  it('goToDesktop sem redirect: só dismiss', () => {
    setMobile(true)
    const g = mod.useMobileRouteGuard({ routeKey: 'guard-e' })
    g.goToDesktop()
    expect(pushMock).not.toHaveBeenCalled()
    expect(g.shouldShowWarning.value).toBe(false)
  })
})

describe('createMobileRouteGuard (guard global do router)', () => {
  beforeEach(() => {
    matches = false
    setMobile(false)
  })

  it('desktop → true sempre', () => {
    const guard = mod.createMobileRouteGuard()
    expect(guard({ meta: { desktopOnly: true }, name: 'x' } as any)).toBe(true)
  })

  it('mobile + rota sem meta.desktopOnly → true', () => {
    setMobile(true)
    const guard = mod.createMobileRouteGuard()
    expect(guard({ meta: {}, name: 'home' } as any)).toBe(true)
  })

  it('mobile + desktopOnly → redireciona home + dispara evento', () => {
    setMobile(true)
    const events: CustomEvent[] = []
    window.addEventListener('mobile-route-blocked', (e) =>
      events.push(e as CustomEvent),
    )
    const guard = mod.createMobileRouteGuard()
    const res = guard({
      meta: { desktopOnly: true },
      name: 'settings-media',
    } as any)
    expect(res).toEqual({ name: 'home', replace: true })
    expect(events.length).toBe(1)
    expect((events[0] as CustomEvent).detail.routeKey).toBe('settings-media')
  })

  it('rota já dismissada por routeKey → true', () => {
    setMobile(true)
    const guard = mod.createMobileRouteGuard()
    // 1ª: bloqueia via useMobileRouteGuard.dismissWarning? NÃO — dismissed
    // é do guard de componente. No global, dismissamos via createMobileRouteGuard
    // já bloqueado antes... usamos um guard de componente com o MESMO routeKey:
    const g = mod.useMobileRouteGuard({ routeKey: 'settings-media-2' })
    void g
    const guard2 = mod.createMobileRouteGuard()
    const res1 = guard2({
      meta: { desktopOnly: true, mobileRouteKey: 'rk-shared' },
      name: 's',
    } as any)
    expect(res1).toEqual({ name: 'home', replace: true })
    // dismissar via composable com mesma chave
    mod.useMobileRouteGuard({ routeKey: 'rk-shared' }).dismissWarning()
    const res2 = guard2({
      meta: { desktopOnly: true, mobileRouteKey: 'rk-shared' },
      name: 's',
    } as any)
    expect(res2).toBe(true)
  })
})
