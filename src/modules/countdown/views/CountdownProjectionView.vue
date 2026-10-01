<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { ProjectionBackground } from '@design-system/index'
import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import { useCountdownStore } from '../stores/useCountdownStore'

const { t } = useI18n()
const store = useCountdownStore()
const {
  audioMuted,
  audioVolume,
  setAudioMuted,
  setAudioVolume,
  stopAudio,
} = store

import type { StageSettings } from '../../settings/types/stage-settings'
import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage } from '../../settings/types/stage-settings'

import CountdownPreview from '../components/CountdownPreview.vue'
import {
  COUNTDOWN_CONFIG_CHANNEL,
  loadCountdownDisplayConfig,
  normalizeCountdownDisplayConfig,
} from '../services/countdown-preferences'
import {
  COUNTDOWN_RUNTIME_CHANNEL,
  COUNTDOWN_RUNTIME_STORAGE_KEY,
  normalizeCountdownRuntime,
  readCountdownRuntimeFromStorage,
} from '../services/countdown-runtime'
import type {
  CountdownDisplayConfig,
  CountdownRuntimeState,
} from '../types/countdown'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
} from '../types/countdown'

const config = ref<CountdownDisplayConfig>({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
const runtime = ref<CountdownRuntimeState>({
  ...DEFAULT_COUNTDOWN_RUNTIME,
  savedTimesMs: [],
  durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
})

const stage = ref<StageSettings>(readEffectiveStageSettings('countdown'))

let unsubStage: (() => void) | null = null

let configChannel: BroadcastChannel | null = null
let runtimeChannel: BroadcastChannel | null = null

function refreshConfig() {
  config.value = loadCountdownDisplayConfig()
}

function refreshRuntime() {
  runtime.value = readCountdownRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BROWSER_STORAGE_KEYS.userPreferences) {
    refreshConfig()
    return
  }
  if (event.key === COUNTDOWN_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onConfigMessage(event: MessageEvent<unknown>) {
  config.value = normalizeCountdownDisplayConfig(event.data)
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeCountdownRuntime(event.data)
}

onMounted(() => {
  refreshConfig()
  refreshRuntime()
  window.addEventListener('storage', onStorage)

unsubStage = subscribeStageSettings(() => {
  stage.value = readEffectiveStageSettings('countdown')
})

  try {
    configChannel = new BroadcastChannel(COUNTDOWN_CONFIG_CHANNEL)
    configChannel.addEventListener('message', onConfigMessage)
  } catch {
    configChannel = null
  }

  try {
    runtimeChannel = new BroadcastChannel(COUNTDOWN_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
unsubStage?.()
unsubStage = null
  configChannel?.removeEventListener('message', onConfigMessage)
  configChannel?.close()
  configChannel = null
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
})

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))

const stageAlign = computed(() => ({
  alignItems:
    stage.value.textVerticalAlign === 'top'
      ? 'flex-start'
      : stage.value.textVerticalAlign === 'bottom'
        ? 'flex-end'
        : 'center',
  justifyContent:
    stage.value.textAlign === 'left'
      ? 'flex-start'
      : stage.value.textAlign === 'right'
        ? 'flex-end'
        : 'center',
}))

// Características do módulo vindas do StageSettings (fonte única).
const effectiveConfig = computed(() => {
  const mod = stage.value.countdown
  return mod ? { ...config.value, ...mod } : { ...config.value }
})
</script>

<template>
  <ProjectionBackground
    class="countdown-projection"
    :style="stageStyle"
  >
    <div
      class="countdown-projection__stage"
      :style="stageAlign"
    >
      <CountdownPreview
        :config="effectiveConfig"
        :runtime="runtime"
      />
    </div>

    <!-- F2 (web#175): controles de áudio do operador na janela de projeção -->
    <div
      class="countdown-projection__audio-controls"
      data-testid="projection-audio-controls"
    >
      <button
        type="button"
        class="countdown-projection__audio-btn"
        :class="{ 'countdown-projection__audio-btn--muted': audioMuted }"
        :aria-label="audioMuted ? t('countdown.unmuteAudio') : t('countdown.muteAudio')"
        :title="audioMuted ? t('countdown.unmuteAudio') : t('countdown.muteAudio')"
        @click="setAudioMuted(!audioMuted)"
      >
        <i
          :class="audioMuted ? 'ti ti-volume-off' : 'ti ti-volume'"
          aria-hidden="true"
        />
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="countdown-projection__audio-volume"
        :value="audioVolume"
        :aria-label="t('countdown.audioVolume')"
        @input="setAudioVolume(Number(($event.target as HTMLInputElement).value))"
      >
      <button
        type="button"
        class="countdown-projection__audio-btn countdown-projection__audio-btn--stop"
        :aria-label="t('countdown.stopAudio')"
        :title="t('countdown.stopAudio')"
        @click="stopAudio()"
      >
        <i
          class="ti ti-player-stop"
          aria-hidden="true"
        />
      </button>
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.countdown-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.countdown-projection__stage {
  width: 100%;
  height: 100%;
}

/* F2 (web#175): controles de áudio do operador */
.countdown-projection__audio-controls {
  position: fixed;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, #000 55%, transparent);
  backdrop-filter: blur(6px);
  opacity: 0.35;
  transition: opacity 0.2s ease;

  &:hover,
  &:focus-within {
    opacity: 1;
  }
}

.countdown-projection__audio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;

  &:hover {
    background: rgb(255 255 255 / 15%);
  }

  &--muted {
    color: #ff8a65;
  }

  &--stop:hover {
    background: rgb(255 82 82 / 30%);
    color: #ff8a80;
  }
}

.countdown-projection__audio-volume {
  width: 5.5rem;
  accent-color: #ffb300;
}
</style>
