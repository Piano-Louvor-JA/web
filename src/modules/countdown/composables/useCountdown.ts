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
import { playAlertTone, getCustomAudio } from '../services/alert-tone'

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
      if (prevStatus !== 'running' && !firedMarkers.has('start') && presets.start && presets.start !== 'none') {
        firedMarkers.add('start')
        void playAlertTone(presets.start, undefined, getCustomAudio('start'))
      }
      prevStatus = runtime.value.status
      // marcos por cruzamento (prevRaw >= marco > raw — contagem decrescente)
      for (const key of ['5min', '1min'] as const) {
        const markerMs = ALERT_MARKERS_MS[key]
        const preset = presets[key]
        if (firedMarkers.has(key) || !preset || preset === 'none') continue
        if ((prevRaw ?? Infinity) >= markerMs && raw < markerMs) {
          firedMarkers.add(key)
          void playAlertTone(preset, undefined, getCustomAudio(key))
        }
      }
    })

    // Reset dos marcos quando o countdown volta pro idle (reset)
    watch(() => runtime.value.status, (status) => {
      if (status === 'idle') firedMarkers.clear()
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

  const durationParts = computed(() => durationPartsFromMs(store.runtime.durationMs))

  return {
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
