import { resolveReportedHomeLocation } from '@modules/home/services/home-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { CLIENT_PLATFORM, CLIENT_VERSION } from '@shared/lib/client-platform'
import { apiCandidateBases } from '@shared/services/api-fallback'
import { getUserPreference } from '@shared/services/user-preferences'

import { getOrCreateInstallId } from './telemetry-preferences'

/**
 * Sinal de "online" do web para a API (POST /v1/telemetry/heartbeat —
 * contrato em api/src/v1/telemetry/telemetry.routes.ts). Paridade com o
 * desktop (app/src/modules/telemetry). Os headers X-Client-* entram pelo
 * patch global de fetch (client-platform.ts). Falha é silenciosa.
 */

export interface HeartbeatBody {
  install_id: string
  platform: string
  app_version: string | null
  os: { name: string; release: string; arch: string } | null
  locale: string | null
  timezone: string | null
  district: string | null
  church: string | null
}

const HEARTBEAT_PATH = '/v1/telemetry/heartbeat'
const TIMEOUT_MS = 8_000

/** Só a API Piano (STG/prod/local); a API PHP legada não tem o endpoint. */
export function isPianoApiHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'pianolouvorja.com.br' ||
    host.endsWith('.pianolouvorja.com.br')
  )
}

export function heartbeatUrls(): string[] {
  const urls: string[] = []
  for (const base of apiCandidateBases('database')) {
    try {
      const { origin, hostname } = new URL(base)
      const url = `${origin}${HEARTBEAT_PATH}`
      if (isPianoApiHost(hostname) && !urls.includes(url)) urls.push(url)
    } catch {
      // base inválida: ignora
    }
  }
  return urls
}

const OS_PATTERNS: Array<[RegExp, string]> = [
  [/Windows/i, 'Windows'],
  [/Android/i, 'Android'],
  [/iPhone|iPad|iPod/i, 'iOS'],
  [/CrOS/i, 'ChromeOS'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/Linux/i, 'Linux'],
]

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+).*Safari/, 'Safari'],
]

/** SO e navegador pelo user agent (ex.: "Windows" + "Chrome 130"). */
export function osFromUserAgent(ua: string): HeartbeatBody['os'] {
  const name = OS_PATTERNS.find(([re]) => re.test(ua))?.[1]
  if (!name) return null
  let release = ''
  for (const [re, browser] of BROWSER_PATTERNS) {
    const match = re.exec(ua)
    if (match) {
      release = `${browser} ${match[1]}`
      break
    }
  }
  return { name, release, arch: '' }
}

function timezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    /* v8 ignore next 2 -- Intl sempre existe nos navegadores suportados */
    return null
  }
}

export function buildHeartbeatBody(): HeartbeatBody {
  const location = resolveReportedHomeLocation()
  const language = getUserPreference<string>(USER_PREFERENCE_KEYS.language, null)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return {
    install_id: getOrCreateInstallId(),
    platform: CLIENT_PLATFORM,
    app_version: CLIENT_VERSION || null,
    os: osFromUserAgent(ua),
    locale: language || (typeof navigator !== 'undefined' ? navigator.language : null) || null,
    timezone: timezone(),
    district: location.district || null,
    church: location.church || null,
  }
}

/**
 * Envia para o primeiro host que responder. Erro de rede ou 5xx passa ao
 * próximo; 4xx não insiste. Sempre ligado (recurso padrão, sem opção de
 * desativar).
 */
export async function sendHeartbeat(fetchImpl: typeof fetch = globalThis.fetch): Promise<boolean> {
  const body = JSON.stringify(buildHeartbeatBody())
  for (const url of heartbeatUrls()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        cache: 'no-store',
        signal: controller.signal,
      })
      if (res.ok) return true
      if (res.status < 500) return false
    } catch {
      // rede/timeout: tenta o próximo host
    } finally {
      clearTimeout(timer)
    }
  }
  return false
}
