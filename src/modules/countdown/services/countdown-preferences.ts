import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  COUNTDOWN_TIME_FORMATS,
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  type CountdownDisplayConfig,
  type CountdownTimeFormat,
  type SabbathModeConfig,
} from '../types/countdown'

export const COUNTDOWN_CONFIG_CHANNEL = 'louvorja-countdown-config'

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asTimeFormat(value: unknown): CountdownTimeFormat {
  return COUNTDOWN_TIME_FORMATS.includes(value as CountdownTimeFormat)
    ? (value as CountdownTimeFormat)
    : DEFAULT_COUNTDOWN_DISPLAY_CONFIG.timeFormat
}

export function normalizeCountdownDisplayConfig(raw: unknown): CountdownDisplayConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }
  }

  const source = raw as Record<string, unknown>

  return {
    timeFormat: asTimeFormat(source.timeFormat),
    bgColor: asString(source.bgColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.bgColor),
    textColor: asString(source.textColor, DEFAULT_COUNTDOWN_DISPLAY_CONFIG.textColor),
    allowNegative: source.allowNegative === true,
    mode: source.mode === 'sabbath' ? 'sabbath' : 'standard',
    sabbathConfig: asSabbathConfig(source.sabbathConfig),
    alertTonePresets: asAlertTonePresets(source.alertTonePresets),
  }
}

function asSabbathConfig(value: unknown): SabbathModeConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const scheduleMode = source.scheduleMode === 'start' ? 'start' : 'endOnly'
  const endTime = asString(source.endTime, '')
  if (!/^\d{2}:\d{2}$/.test(endTime)) return undefined
  const startTime =
    typeof source.startTime === 'string' && /^\d{2}:\d{2}$/.test(source.startTime)
      ? source.startTime
      : undefined
  return { scheduleMode, endTime, startTime }
}

function asAlertTonePresets(
  value: unknown,
): CountdownDisplayConfig['alertTonePresets'] {
  if (!value || typeof value !== 'object') return undefined
  const out: Partial<Record<'start' | '5min' | '1min', string>> = {}
  for (const key of ['start', '5min', '1min'] as const) {
    const entry = (value as Record<string, unknown>)[key]
    if (typeof entry === 'string' && entry.length > 0) out[key] = entry
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function loadCountdownDisplayConfig(): CountdownDisplayConfig {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.countdownConfig, null)
  return normalizeCountdownDisplayConfig(stored)
}

export function saveCountdownDisplayConfig(config: CountdownDisplayConfig): void {
  setUserPreference(USER_PREFERENCE_KEYS.countdownConfig, config)

  try {
    const channel = new BroadcastChannel(COUNTDOWN_CONFIG_CHANNEL)
    channel.postMessage(config)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}
