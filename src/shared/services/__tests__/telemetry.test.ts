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
    initMock.mockClear()
    captureMock.mockClear()
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
})
