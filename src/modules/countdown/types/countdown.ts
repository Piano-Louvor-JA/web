export type CountdownTimeFormat =
  | 'hh:mm:ss.ms'
  | 'hh:mm:ss'
  | 'mm:ss.ms'
  | 'mm:ss'

import type { AlertPresetKey } from '../services/alert-tone'

export type CountdownStatus = 'idle' | 'running' | 'paused'

export type CountdownMode = 'standard' | 'sabbath'

export interface SabbathModeConfig {
  /** 'start' = usuário define horário início + fim; 'endOnly' = só fim */
  scheduleMode: 'start' | 'endOnly'
  /** Horário de fim (ex: "10:15") — obrigatório. */
  endTime: string
  /** Horário de início (ex: "09:00") — opcional, só se scheduleMode === 'start'. */
  startTime?: string
}

export interface CountdownDisplayConfig {
  timeFormat: CountdownTimeFormat
  bgColor: string
  textColor: string
  /** Se true, o cronômetro continua rodando após zerar (tempo negativo).
   *  Se false (padrão), trava em zero e pausa automaticamente. */
  allowNegative?: boolean
  /** Mapeia marco → preset de áudio. Chaves: 'start', '5min', '1min'.
   *  Valor: key de ALERT_PRESETS, 'none' (desabilitado) ou 'custom' (áudio do usuário). */
  alertTonePresets?: Partial<Record<'start' | '5min' | '1min', AlertPresetKey | 'none'>>
  /** Modo de operação. 'sabbath' carrega todas as funcionalidades da Escola Sabatina. */
  mode?: CountdownMode
  /** Configuração extra quando mode === 'sabbath'. */
  sabbathConfig?: SabbathModeConfig
}

export interface CountdownRuntimeState {
  status: CountdownStatus
  /** Epoch ms when the current running segment started. */
  segmentStartedAt: number | null
  /** Milliseconds already counted down before the current segment. */
  accumulatedMs: number
  /** Total countdown duration set by the user. */
  durationMs: number
  savedTimesMs: number[]
  finished: boolean
}

export interface CountdownDurationParts {
  hours: number
  minutes: number
  seconds: number
}

/** Duração inicial do Timer: 0h 05m 00s */
export const DEFAULT_COUNTDOWN_DURATION_PARTS: CountdownDurationParts = {
  hours: 0,
  minutes: 5,
  seconds: 0,
}

export const DEFAULT_COUNTDOWN_DURATION_MS =
  DEFAULT_COUNTDOWN_DURATION_PARTS.hours * 3_600_000 +
  DEFAULT_COUNTDOWN_DURATION_PARTS.minutes * 60_000 +
  DEFAULT_COUNTDOWN_DURATION_PARTS.seconds * 1_000

export const DEFAULT_COUNTDOWN_DISPLAY_CONFIG: CountdownDisplayConfig = {
  timeFormat: 'hh:mm:ss',
  bgColor: '#000000',
  textColor: '#FFFFFF',
}

export const DEFAULT_COUNTDOWN_RUNTIME: CountdownRuntimeState = {
  status: 'idle',
  segmentStartedAt: null,
  accumulatedMs: 0,
  durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
  savedTimesMs: [],
  finished: false,
}

export const COUNTDOWN_TIME_FORMATS: CountdownTimeFormat[] = [
  'hh:mm:ss.ms',
  'hh:mm:ss',
  'mm:ss.ms',
  'mm:ss',
]

export const COUNTDOWN_BG_PRESETS = [
  '#000000',
  '#1A1A1A',
  '#FFFFFF',
  '#1976D2',
  '#388E3C',
  '#D32F2F',
  '#F57C00',
  '#7B1FA2',
] as const

export const COUNTDOWN_TEXT_PRESETS = [
  '#FFFFFF',
  '#000000',
  '#f6c32a',
  '#FF6B6B',
  '#4ECDC4',
  '#96CEB4',
  '#FFEAA7',
  '#0097d7',
] as const
