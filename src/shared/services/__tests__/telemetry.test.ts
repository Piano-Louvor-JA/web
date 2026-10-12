import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { initMock, captureMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
}))

vi.mock('@sentry/browser', () => ({ init: initMock, captureException: captureMock }))

describe('telemetria web', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__APP_VERSION__', '1.23.1')
    initMock.mockReset()
    captureMock.mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('sem DSN não inicializa nem envia eventos', async () => {
    vi.stubEnv('VITE_TELEMETRIA_DSN', '')
    const { startTelemetry, reportError } = await import('../telemetry')
    await startTelemetry()
    reportError(new Error('não enviar'))
    expect(initMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('com DSN inicializa sem PII/tracing e captura erro técnico', async () => {
    vi.stubEnv('VITE_TELEMETRIA_DSN', 'https://key@errors.example/1')
    const { startTelemetry, reportError } = await import('../telemetry')
    await startTelemetry()
    const error = new Error('falhou')
    reportError(error, { scope: 'sync' })
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://key@errors.example/1',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    }))
    expect(captureMock).toHaveBeenCalledWith(error, { extra: { scope: 'sync' } })
  })
  it('inicializa uma única vez e filtra níveis inferiores a erro', async () => {
    vi.stubEnv('VITE_TELEMETRIA_DSN', 'https://key@errors.example/1')
    const { startTelemetry } = await import('../telemetry')
    await Promise.all([startTelemetry(), startTelemetry()])
    expect(initMock).toHaveBeenCalledTimes(1)
    const beforeSend = initMock.mock.calls[0]![0].beforeSend
    for (const level of ['error', 'fatal', undefined]) {
      const event = { level }
      expect(beforeSend(event)).toBe(event)
    }
    for (const level of ['warning', 'info', 'debug']) expect(beforeSend({ level })).toBeNull()
  })

  it('falha do SDK não interrompe a aplicação', async () => {
    vi.stubEnv('VITE_TELEMETRIA_DSN', 'https://key@errors.example/1')
    initMock.mockImplementation(() => { throw new Error('SDK indisponível') })
    const { startTelemetry, reportError } = await import('../telemetry')
    await expect(startTelemetry()).resolves.toBeUndefined()
    expect(() => reportError(new Error('teste'))).not.toThrow()
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('falha ao capturar não propaga erro para o usuário', async () => {
    vi.stubEnv('VITE_TELEMETRIA_DSN', 'https://key@errors.example/1')
    captureMock.mockImplementation(() => { throw new Error('captura indisponível') })
    const { startTelemetry, reportError } = await import('../telemetry')
    await startTelemetry()
    expect(() => reportError(new Error('teste'))).not.toThrow()
  })

})
