<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ hasAudio: boolean }>()
const { t } = useI18n()
const tooltipId = useId()
const open = ref(false)
</script>

<template>
  <div
    class="media-hotkey-help"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @keydown.esc.stop="open = false"
  >
    <button
      type="button"
      class="media-hotkey-help__button"
      :aria-label="t('media.hotkeys.help')"
      :aria-describedby="open ? tooltipId : undefined"
      @focus="open = true"
      @blur="open = false"
      @click="open = true"
    >
      <i class="ti ti-keyboard" aria-hidden="true" />
    </button>
    <div v-if="open" :id="tooltipId" role="tooltip" class="media-hotkey-help__tooltip">
      <strong>{{ t('media.hotkeys.help') }}</strong>
      <span>{{ t('media.hotkeys.previous') }}</span>
      <span>{{ t('media.hotkeys.next') }}</span>
      <span v-if="hasAudio">{{ t('media.hotkeys.toggle') }}</span>
      <small>{{ t('media.hotkeys.editing') }}</small>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-hotkey-help { position: relative; }
.media-hotkey-help__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  color: var(--ds-color-on-surface, #fff);
  background: var(--ds-color-surface-card, #181818);
  cursor: pointer;
  font-size: 1.2rem;
}
.media-hotkey-help__button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.media-hotkey-help__tooltip {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  right: 0;
  z-index: 10;
  display: grid;
  gap: 0.4rem;
  width: max-content;
  max-width: min(19rem, calc(100vw - 4rem));
  padding: 0.8rem;
  border-radius: 0.6rem;
  background: var(--ds-color-surface-card, #181818);
  color: var(--ds-color-on-surface, #fff);
  border: 1px solid currentColor;
  box-shadow: 0 4px 16px #0006;
  font-size: 0.85rem;
}
.media-hotkey-help__tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 0.5rem;
}
</style>
