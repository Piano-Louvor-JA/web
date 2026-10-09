import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

import {
  computeRemainingMs,
  computeRemainingRawMs,
  durationPartsFromMs,
  formatCountdownWithSign,
  formatElapsedMs,
} from '../services/countdown-format'
import type {
  CountdownDisplayConfig,
  CountdownRuntimeState,
} from '../types/countdown'
import { useCountdownStore } from '../stores/useCountdownStore'
import { clearAlertQueue, enqueueAlert, getCustomAudio, pauseAllAlerts, playAlertTone, resumeAllAlerts, stopAllAlerts } from '../services/alert-tone'

export function useCountdownTick(active: MaybeRefOrGetter<boolean> = true) {
  const now = ref(Date.now())
  let frameId = 0

  function tick() {
    if (toValue(active)) {
      now.value = Date.now()
    }
    frameId = requestAnimationFrame(tick)
  }

  onMounted(() => {
    frameId = requestAnimationFrame(tick)
  })

  onUnmounted(() => {
    cancelAnimationFrame(frameId)
  })

  return { now }
}

export const DEFAULT_ALERT_TONE_PRESETS: NonNullable<
  CountdownDisplayConfig['alertTonePresets']
> = {
  start: 'abertura_es',
  '5min': '5min_es',
  '1min': '1min_es',
}

/** Marcos em ms restantes que disparam alerta. */
const ALERT_MARKERS_MS = { start: 0, '5min': 300_000, '1min': 60_000 } as const

export function useCountdownDisplay(
  configSource?: MaybeRefOrGetter<CountdownDisplayConfig>,
  runtimeSource?: MaybeRefOrGetter<CountdownRuntimeState>,
) {
  const store = useCountdownStore()
  const config = computed(() => toValue(configSource) ?? store.config)
  const runtime = computed(() => toValue(runtimeSource) ?? store.runtime)
  const { now } = useCountdownTick(() => runtime.value.status === 'running')

  const remainingRawMs = computed(() =>
    computeRemainingRawMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      now.value,
    ),
  )

  const remainingMs = computed(() =>
    computeRemainingMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      now.value,
    ),
  )

  const formattedTime = computed(() =>
    formatElapsedMs(remainingMs.value, config.value.timeFormat),
  )

  const formattedTimeWithSign = computed(() =>
    formatCountdownWithSign(remainingRawMs.value, config.value.timeFormat),
  )

  const isNegative = computed(() => remainingRawMs.value < 0)

  const isUrgent = computed(
    () =>
      remainingMs.value > 0 &&
      remainingMs.value <= 60_000 &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused'),
  )

  const isFinished = computed(
      () =>
        runtime.value.finished ||
        (remainingMs.value <= 0 &&
          runtime.value.durationMs > 0 &&
          runtime.value.accumulatedMs > 0),
    )

  // ── Disparo de alertas nos marcos ────────────────────────────────────
  // Observa o tempo restante "caindo" e dispara o preset quando cruza o marco.
  // 'start' dispara na transição idle/running; os demais quando cruzam o valor.
  const firedMarkers = new Set<string>()

    let prevStatus: CountdownRuntimeState['status'] = runtime.value.status

    watch(remainingRawMs, (raw, prevRaw) => {
      if (runtime.value.status !== 'running') return
      const presets = config.value.alertTonePresets ?? DEFAULT_ALERT_TONE_PRESETS
      // start: primeira observação com status running
      // (const local preserva a narrowing do preset dentro do closure)
      const startPreset = presets.start
      if (prevStatus !== 'running' && !firedMarkers.has('start') && startPreset && startPreset !== 'none') {
        firedMarkers.add('start')
        enqueueAlert(() => playAlertTone(startPreset, undefined, getCustomAudio('start')))
      }
      prevStatus = runtime.value.status
      // marcos por cruzamento (prevRaw >= marco > raw — contagem decrescente)
      // Feedback Ezequias: "5min toca faltando 4" — no primeiro tick de running
      // prevRaw é undefined (Infinity): se o cronômetro já iniciou com remaining
      // abaixo do marco (ex.: start faltando 4:30), o cruzamento "Infinity >= 5min
      // > raw" disparava o alerta FORA DE HORA. Primeiro tick só arma; marcos já
      // vencidos são pulados (alerta que perdeu a hora não toca atrasado).
      const firstTick = prevRaw == null
      for (const key of ['5min', '1min'] as const) {
        const markerMs = ALERT_MARKERS_MS[key]
        const preset = presets[key]
        if (firedMarkers.has(key) || !preset || preset === 'none') continue
        if (firstTick) {
          if (raw < markerMs) firedMarkers.add(key) // já vencido no start — pula sem tocar
          continue
        }
        if (prevRaw >= markerMs && raw < markerMs) {
          firedMarkers.add(key)
          enqueueAlert(() => playAlertTone(preset, undefined, getCustomAudio(key)))
        }
      }
    })

    // Reset dos marcos quando o countdown volta pro idle (reset)
    watch(() => runtime.value.status, (status) => {
      if (status === 'idle') {
        firedMarkers.clear()
        clearAlertQueue()
      }
    })

    return {
      now,
      config,
      runtime,
      remainingMs,
      formattedTime,
      formattedTimeWithSign,
      isUrgent,
      isFinished,
      isNegative,
    }
}

export function useCountdownFeature() {
  const store = useCountdownStore()

  store.hydrate()

  // Toggle play/pause do áudio (feedback Ezequias) — vive no módulo,
  // compartilhado entre a view e a feature (arquitetura web: composable).
  const audioPaused = ref(false)
  function setAudioPaused(paused: boolean) {
    audioPaused.value = paused
    if (paused) pauseAllAlerts()
    else resumeAllAlerts()
  }

  const durationParts = computed(() => durationPartsFromMs(store.runtime.durationMs))

  return {
    audioPaused,
    setAudioPaused,
    config: computed(() => store.config),
    runtime: computed(() => store.runtime),
    durationParts,
    isProjecting: computed(() => store.isProjecting),
    configOpen: computed(() => store.configOpen),
    displayConfigOpen: computed(() => store.displayConfigOpen),
    isRunning: computed(() => store.isRunning),
    isPaused: computed(() => store.isPaused),
    canStart: computed(() => store.canStart),
    setTimeFormat: store.setTimeFormat,
    setBgColor: store.setBgColor,
    setTextColor: store.setTextColor,
    resetDisplayToDefault: store.resetDisplayToDefault,
    openConfig: store.openConfig,
        closeConfig: store.closeConfig,
        openDisplayConfig: store.openDisplayConfig,
        closeDisplayConfig: store.closeDisplayConfig,
        setAllowNegative: store.setAllowNegative,
        setAlertTonePreset: store.setAlertTonePreset,
        setMode: store.setMode,
        setSabbathConfig: store.setSabbathConfig,
        setDurationMs: store.setDurationMs,
        adjustTime: store.adjustTime,
        start: store.start,
    pause: store.pause,
    reset: store.reset,
    saveMark: store.saveMark,
    removeSavedMark: store.removeSavedMark,
    clearSavedMarks: store.clearSavedMarks,
    toggleProjection: store.toggleProjection,
    syncProjection: store.syncProjection,
    clearProjection: store.clearProjection,
    refreshProjectionState: store.refreshProjectionState,
  }
}
