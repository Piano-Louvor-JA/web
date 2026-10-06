import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * display-service-web: Window Management API (getScreenDetails) com fallback
 * "limited" pra tela atual; identifyScreens com blob windows; hotplug.
 */

const primary = {
  label: 'Dell U2718Q',
  availLeft: 0,
  availTop: 0,
  availWidth: 1920,
  availHeight: 1040,
  width: 1920,
  height: 1080,
  isPrimary: true,
  isInternal: false,
}
const secondary = {
  label: '  ',
  availLeft: 1920,
  availTop: 0,
  availWidth: 1366,
  availHeight: 728,
  width: 1366,
  height: 768,
  isPrimary: false,
  isInternal: true,
}

let getScreenDetails: unknown = undefined

beforeEach(() => {
  getScreenDetails = undefined
  delete (window as { getScreenDetails?: unknown }).getScreenDetails
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as { getScreenDetails?: unknown }).getScreenDetails
})

function setApi(impl: unknown) {
  getScreenDetails = impl
  ;(window as unknown as { getScreenDetails?: unknown }).getScreenDetails = impl
}

let mod: typeof import('./display-service-web')

beforeAll(async () => {
  mod = await import('./display-service-web')
})

describe('listScreens / requestScreenAccess', () => {
  it('sem API → fallback limitado (supported=false)', async () => {
    const res = await mod.listScreens()
    expect(res.supported).toBe(false)
    expect(res.limited).toBe(true)
    expect(res.screens).toHaveLength(1)
    expect(res.screens[0].id).toBe('0:0')

    const det = await mod.requestScreenAccess()
    expect(det.supported).toBe(false)
    expect(det.screens).toHaveLength(1)
  })

  it('API com 2 telas → mapeadas (label default p/ vazio), limited=false', async () => {
    setApi(vi.fn().mockResolvedValue({ screens: [primary, secondary] }))
    const res = await mod.listScreens()
    expect(res.supported).toBe(true)
    expect(res.limited).toBe(false)
    expect(res.screens).toHaveLength(2)
    expect(res.screens[0]).toMatchObject({
      id: '0:0',
      label: 'Dell U2718Q',
      width: 1920,
      height: 1040,
      isPrimary: true,
    })
    // label vazio → 'Monitor 2'
    expect(res.screens[1]).toMatchObject({
      id: '1920:0',
      label: 'Monitor 2',
      width: 1366,
    })
  })

  it('API responde telas vazias → fallback limited=true (supported=true)', async () => {
    setApi(vi.fn().mockResolvedValue({ screens: [] }))
    const res = await mod.listScreens()
    expect(res.supported).toBe(true)
    expect(res.limited).toBe(true)
    expect(res.screens).toHaveLength(1)
  })

  it('API rejeita (permissão negada) → fallback limited=true, sem throw', async () => {
    setApi(vi.fn().mockRejectedValue(new Error('denied')))
    await expect(mod.listScreens()).resolves.toMatchObject({
      limited: true,
      supported: true,
    })
    await expect(mod.requestScreenAccess()).resolves.toMatchObject({
      limited: true,
      supported: true,
    })
  })

  it('requestScreenAccess com telas → lista completa', async () => {
    setApi(vi.fn().mockResolvedValue({ screens: [primary] }))
    const det = await mod.requestScreenAccess()
    expect(det.limited).toBe(false)
    expect(det.screens[0].height).toBe(1040)
  })
})

describe('identifyScreens', () => {
  it('abre janela numerada por tela e fecha após 3s', async () => {
    vi.useFakeTimers()
    const wins = [0, 1].map(() => {
      const w = { close: vi.fn() }
      return w as unknown as Window
    })
    let call = 0
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => wins[call++] ?? null)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:identify')

    const opened = mod.identifyScreens([
      { id: '0:0', label: 'A', left: 0, top: 0, width: 1920, height: 1080, isPrimary: true, isInternal: false },
      { id: '1920:0', label: 'B', left: 1920, top: 0, width: 1366, height: 768, isPrimary: false, isInternal: true },
    ])

    expect(opened).toHaveLength(2)
    expect(openSpy).toHaveBeenCalledTimes(2)
    const [, name2, features2] = openSpy.mock.calls[1]
    expect(name2).toBe('identify-1920:0')
    expect(features2).toContain('left=1920')
    expect(features2).toContain('width=1366')

    await vi.advanceTimersByTimeAsync(3100)
    expect(wins[0].close).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:identify')
    void create

    vi.useRealTimers()
  })

  it('window.open bloqueado → janela não entra na lista, close tolerado', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const opened = mod.identifyScreens([
      { id: '0:0', label: 'A', left: 0, top: 0, width: 800, height: 600, isPrimary: true, isInternal: false },
    ])
    expect(opened).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(3100)
    expect(revoke).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('subscribeScreensChanged', () => {
  it('sem API → unsubscribe no-op', () => {
    const unsub = mod.subscribeScreensChanged(() => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })

  it('com API → escuta screenschange e descadastro remove', () => {
    setApi(vi.fn())
    const spy = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const unsub = mod.subscribeScreensChanged(spy)
    expect(addSpy).toHaveBeenCalledWith('screenschange', spy)
    window.dispatchEvent(new Event('screenschange'))
    expect(spy).toHaveBeenCalledTimes(1)

    unsub()
    expect(removeSpy).toHaveBeenCalledWith('screenschange', spy)
  })

describe('display-service-web — caudas', () => {
  it('getScreenDetails sem screens (undefined) → fallback', async () => {
    setApi(vi.fn().mockResolvedValue({}))
    const res = await mod.listScreens()
    expect(res.limited).toBe(true)
    expect(res.supported).toBe(true)
    expect(res.screens).toHaveLength(1)
  })

  it('requestScreenAccess: screens vazio → fallback limited=false?? (contrato atual: limited=true só quando vazio)', async () => {
    setApi(vi.fn().mockResolvedValue({ screens: [] }))
    const det = await mod.requestScreenAccess()
    expect(det.screens).toHaveLength(1)
    expect(det.limited).toBe(true)
  })

  it('requestScreenAccess: telas presentes → limited=false', async () => {
    setApi(vi.fn().mockResolvedValue({ screens: [primary, secondary] }))
    const det = await mod.requestScreenAccess()
    expect(det.limited).toBe(false)
    expect(det.screens).toHaveLength(2)
  })
})
})
