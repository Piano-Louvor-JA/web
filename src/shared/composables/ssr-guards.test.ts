// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('vuetify', () => ({ useDisplay: () => ({ smAndDown: { value: false } }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@shared/services/user-preferences', () => ({ getUserPreference: () => undefined, setUserPreference: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
describe('composables sem APIs do navegador', () => {
  it('detecção mobile retorna desktop sem window', async () => {
    const { useMobileDetection } = await import('./useMobileDetection')
    expect(useMobileDetection().isDesktop.value).toBe(true)
  })
  it('guard de rota permite navegação sem window', async () => {
    const { useMobileRouteGuard } = await import('./useMobileRouteGuard')
    expect(useMobileRouteGuard({ routeKey: 'ssr' }).isMobile.value).toBe(false)
  })
  it('zoom funciona sem document, localStorage ou window', async () => {
    const { initUiZoom, useUiZoom } = await import('./useUiZoom')
    initUiZoom()
    const zoom = useUiZoom()
    expect(zoom.setZoom(Number.NaN)).toBe(1)
    expect(zoom.setZoom(1.2)).toBe(1.2)
  })
})
it('zoom de popup não requer document', async () => {
  vi.stubGlobal('window', { location: { href: 'http://localhost/popup', pathname: '/popup' }, matchMedia: () => null, addEventListener: vi.fn() })
  const { initUiZoom, useUiZoom } = await import('./useUiZoom')
  initUiZoom()
  expect(useUiZoom().setZoom(1.4)).toBe(1)
})
