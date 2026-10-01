<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import {
  COUNTDOWN_TIME_FORMATS,
  type CountdownDisplayConfig,
  type CountdownMode,
  type CountdownTimeFormat,
  type SabbathModeConfig,
} from '../types/countdown'
import {
  getAvailablePresets,
  getCustomAudio,
  getPresetDurationMs,
  saveCustomTone,
  type AlertPresetKey,
} from '../services/alert-tone'
import { DEFAULT_ALERT_TONE_PRESETS } from '../composables/useCountdown'
import { useCountdownStore } from '../stores/useCountdownStore'

type ToneMarkerKey = keyof NonNullable<CountdownDisplayConfig['alertTonePresets']>

const ALERT_MARKERS: Array<{ key: 'start' | '5min' | '1min'; labelKey: string }> = [
  { key: 'start', labelKey: 'countdown.toneMarkerStart' },
  { key: '5min', labelKey: 'countdown.toneMarker5min' },
  { key: '1min', labelKey: 'countdown.toneMarker1min' },
]

const DEFAULT_TONE_PRESETS = DEFAULT_ALERT_TONE_PRESETS

const props = defineProps<{
  open: boolean
  config: CountdownDisplayConfig
}>()

const emit = defineEmits<{
  close: []
  'update:timeFormat': [value: CountdownTimeFormat]
  'update:allowNegative': [value: boolean]
  'update:alertTonePreset': [value: { marker: ToneMarkerKey; preset: string }]
  'update:mode': [value: CountdownMode]
  'update:sabbathConfig': [value: SabbathModeConfig]
  reset: []
}>()

const { t } = useI18n()

/** Duração legível (ex.: 30s) do preset selecionado em cada marco. */
function presetDurationLabel(marker: 'start' | '5min' | '1min', config: CountdownDisplayConfig): string {
  const preset = config.alertTonePresets?.[marker] ?? DEFAULT_TONE_PRESETS[marker]
  if (!preset || preset === 'none') return ''
  const ms = getPresetDurationMs(preset, getCustomAudio(marker))
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`
}

/** Soma das durações dos áudios habilitados — tempo mínimo recomendado. */
function totalTonesMs(config: CountdownDisplayConfig): number {
  return (['start', '5min', '1min'] as const).reduce((total, marker) => {
    const preset = config.alertTonePresets?.[marker] ?? DEFAULT_TONE_PRESETS[marker]
    if (!preset || preset === 'none') return total
    return total + getPresetDurationMs(preset, getCustomAudio(marker))
  }, 0)
}

const runtime = computed(() => useCountdownStore().runtime)
const tooShortWarning = computed(() => {
  const total = totalTonesMs(props.config)
  if (total <= 0) return ''
  if (runtime.value.durationMs >= total) return ''
  const s = Math.round(total / 1000)
  const label = s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`
  return t('countdown.toneMinDurationWarning', { min: label })
})

function onCustomAudioFile(marker: 'start' | '5min' | '1min', event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      saveCustomTone(marker, String(reader.result))
      // seleciona 'custom' automaticamente no select
      emit('update:alertTonePreset', { marker, preset: 'custom' })
    } catch {
      alert(t('countdown.customToneTooLarge'))
    }
  }
  reader.readAsDataURL(file)
}


</script>

<template>
  <Teleport to="body">
    <Transition name="countdown-config-fade">
      <div
        v-if="open"
        class="countdown-config"
        role="dialog"
        aria-modal="true"
        :aria-label="t('countdown.configTitle')"
      >
        <GlassCard
          class="countdown-config__panel"
          elevated
          :padding="false"
        >
          <header class="countdown-config__header">
                      <div class="countdown-config__heading">
                        <div class="countdown-config__heading-icon">
                          <i
                            class="ti ti-settings"
                            aria-hidden="true"
                          />
                        </div>
                        <div>
                          <h2 class="countdown-config__title">
                            {{ t('countdown.configTitle') }}
                          </h2>
                          <p class="countdown-config__subtitle">
                            {{ t('countdown.configSubtitle') }}
                          </p>
                        </div>
                      </div>
            <button
              type="button"
              class="countdown-config__icon-btn"
              :aria-label="t('countdown.close')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="countdown-config__body">
            <section class="countdown-config__section">
              <div class="countdown-config__section-head">
                <i
                  class="ti ti-clock"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('countdown.timeFormat') }}</h3>
                  <p>{{ t('countdown.timeFormatHint') }}</p>
                </div>
              </div>
              <div
                class="countdown-config__formats"
                role="radiogroup"
                :aria-label="t('countdown.timeFormat')"
              >
                <button
                  v-for="format in COUNTDOWN_TIME_FORMATS"
                  :key="format"
                  type="button"
                  class="countdown-config__format-btn"
                  :class="{ 'countdown-config__format-btn--active': config.timeFormat === format }"
                  role="radio"
                  :aria-checked="config.timeFormat === format"
                  @click="emit('update:timeFormat', format)"
                >
                  {{ format }}
                </button>
              </div>
            </section>

            <section class="countdown-config__section">
                          <div class="countdown-config__section-head">
                            <i
                              class="ti ti-clock-pause"
                              aria-hidden="true"
                            />
                            <div>
                              <h3>{{ t('countdown.allowNegative') }}</h3>
                              <p>{{ t('countdown.allowNegativeHint') }}</p>
                            </div>
                          </div>
                          <label class="countdown-config__toggle">
                            <input
                              type="checkbox"
                              role="switch"
                              :checked="config.allowNegative ?? false"
                              :aria-label="t('countdown.allowNegative')"
                              @change="emit('update:allowNegative', ($event.target as HTMLInputElement).checked)"
                            >
                          </label>
                        </section>

                        <section class="countdown-config__section">
              <div class="countdown-config__section-head">
                <i
                  class="ti ti-bell"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('countdown.alertTones') }}</h3>
                  <p>{{ t('countdown.alertTonesHint') }}</p>
                </div>
              </div>
              <div
                v-for="marker in ALERT_MARKERS"
                :key="marker.key"
                class="countdown-config__tone-block"
              >
                <div class="countdown-config__tone-row">
                  <span class="countdown-config__tone-marker">{{ t(marker.labelKey) }}</span>
                  <select
                    class="countdown-config__tone-select"
                    :value="config.alertTonePresets?.[marker.key] ?? DEFAULT_TONE_PRESETS[marker.key]"
                    :aria-label="t(marker.labelKey)"
                    @change="emit('update:alertTonePreset', { marker: marker.key, preset: ($event.target as HTMLSelectElement).value })"
                  >
                    <option
                      v-for="p in getAvailablePresets()"
                      :key="p.key"
                      :value="p.key"
                    >
                      {{ p.label }}
                    </option>
                  </select>
                </div>
                <span
                    v-if="presetDurationLabel(marker.key, config)"
                    class="countdown-config__tone-duration"
                  >{{ t('countdown.toneDuration', { dur: presetDurationLabel(marker.key, config) }) }}</span>
                <label class="countdown-config__tone-file">
                  <input
                    type="file"
                    accept="audio/*"
                    @change="onCustomAudioFile(marker.key, $event)"
                  >
                </label>
              </div>
            </section>
          </div>

          <footer class="countdown-config__footer">
            <p
              v-if="tooShortWarning"
              class="countdown-config__tone-warning"
              role="alert"
            >
              <i
                class="ti ti-alert-triangle"
                aria-hidden="true"
              />
              {{ tooShortWarning }}
            </p>
            <button
              type="button"
              class="countdown-config__btn countdown-config__btn--danger"
              @click="emit('reset')"
            >
              {{ t('countdown.resetDisplay') }}
            </button>
            <button
              type="button"
              class="countdown-config__btn countdown-config__btn--primary"
              @click="emit('close')"
            >
              {{ t('countdown.apply') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.countdown-config {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(2px);
}

.countdown-config__panel {
  display: flex;
  width: min(100%, 42rem);
  max-height: min(90vh, 40rem);
  flex-direction: column;
  overflow: hidden;
}

.countdown-config__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.countdown-config__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.countdown-config__heading-icon {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.25rem;
  }
}

.countdown-config__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.countdown-config__subtitle {
  margin: 0.15rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1.3;
}

.countdown-config__icon-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
    color: var(--ds-color-on-surface);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.countdown-config__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.countdown-config__section {
  padding: 1rem;
  border-radius: var(--ds-radius-md, 0.75rem);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.countdown-config__tone-block {
  padding: 0.5rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);

  &:last-child {
    border-bottom: none;
  }
}

.countdown-config__tone-duration {
            display: block;
            font-size: 0.72rem;
            color: var(--ds-color-on-surface-muted, var(--ds-color-on-surface));
            margin-top: 0.1rem;
          }

          .countdown-config__tone-warning {
            display: flex;
            flex-basis: 100%;
            align-items: center;
            gap: 0.4rem;
            margin: 0 0 0.5rem;
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background: color-mix(in srgb, #f59e0b 15%, transparent);
            color: #b45309;
            font-size: 0.78rem;
          }

          .countdown-config__tone-file {
  display: block;
  margin-top: 0.35rem;
  margin-left: calc(180px + 1rem);
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);

  input[type='file'] {
    max-width: 320px;
    font-size: 0.85rem;
  }
}

.countdown-config__tone-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;

  > label,
  > span.countdown-config__tone-marker {
    flex: 0 0 180px;
    color: var(--ds-color-on-surface);
    font-size: 0.95rem;
  }

  .countdown-config__tone-select {
    flex: 1;
    max-width: 320px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-surface-container);
    color: var(--ds-color-on-surface);
    font-size: 0.95rem;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
  }
}

.countdown-config__section-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;

  > .ti {
    margin-top: 0.15rem;
    color: var(--ds-color-primary);
    font-size: 1.35rem;
  }

  h3 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    margin: 0.15rem 0 0;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.75rem;
    line-height: 1.3;
  }
}

.countdown-config__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.countdown-config__swatch {
  width: 2.25rem;
  height: 2.25rem;
  border: 2px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 9999px;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &--active {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
    transform: scale(1.12);
  }

  &:hover {
    transform: scale(1.08);
  }
}

.countdown-config__custom {
  position: relative;
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  border-radius: 9999px;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .ti {
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.countdown-config__formats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.countdown-config__format-btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  font-weight: 700;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.countdown-config__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.countdown-config__btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 16%, transparent);
    color: var(--ds-color-error, #ffb4ab);
  }

  &--primary {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }
}

.countdown-config-fade-enter-active,
.countdown-config-fade-leave-active {
  transition: opacity 180ms ease;
}

.countdown-config-fade-enter-from,
.countdown-config-fade-leave-to {
  opacity: 0;
}
</style>
