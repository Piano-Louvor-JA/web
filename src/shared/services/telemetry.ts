type ErrorContext = Record<string, unknown>

type SentryBrowser = {
  captureException(error: unknown, hint?: { extra?: ErrorContext }): void
  init(options: Record<string, unknown>): void
}

let captureException: SentryBrowser['captureException'] | null = null
let started = false

export async function startTelemetry(): Promise<void> {
  if (started) return
  started = true

  const dsn = import.meta.env.VITE_TELEMETRIA_DSN
  if (!dsn) return

  try {
    const sentry = (await import('@sentry/browser')) as SentryBrowser
    sentry.init({
      dsn,
      environment: import.meta.env.DEV ? 'development' : 'production',
      release: `louvorja-web@${__APP_VERSION__}`,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(event: { level?: string }) {
        return !event.level || event.level === 'error' || event.level === 'fatal'
          ? event
          : null
      },
    })
    captureException = sentry.captureException
  } catch {
    // Telemetria opcional: indisponibilidade nunca quebra o culto.
  }
}

export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    captureException?.(error, context ? { extra: context } : undefined)
  } catch {
    // SDK opcional: nunca propaga erro de diagnóstico.
  }
}
