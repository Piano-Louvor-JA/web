<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import eulaText from '../../../docs/LEGAL/eula/pt-BR.txt?raw'

import { GlassCard } from '@design-system/index'
import { VBtn } from 'vuetify/components'

import { useEula } from '@shared/composables/useEula'

const { t } = useI18n()
const { accept, decline, currentVersion } = useEula()

const hasScrolledToBottom = ref(false)
const showConfirm = ref(false)
const hasExited = ref(false)

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4
  if (isBottom) {
    hasScrolledToBottom.value = true
  }
}

function onAccept() {
  accept()
}

function onDeclineClick() {
  showConfirm.value = true
}

function onConfirmDecline() {
  decline()
  showConfirm.value = false
  hasExited.value = true
}

function onConfirmCancel() {
  showConfirm.value = false
}
</script>

<template>
  <!-- Tela de saida: usuario recusou definitivamente -->
  <div v-if="hasExited" class="eula-exit" role="alert">
    <GlassCard class="eula-exit__card">
      <div class="eula-exit__icon" aria-hidden="true">
        <i class="ti ti-shield-x" />
      </div>
      <p class="eula-exit__text">{{ t('eula.exitMessage') }}</p>
    </GlassCard>
  </div>

  <!-- Dialog EULA principal -->
  <div
    v-else
    class="eula-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="eula-title"
  >
    <GlassCard class="eula-dialog__card" elevated>
      <div class="eula-dialog__header">
        <div class="eula-dialog__icon" aria-hidden="true">
          <i class="ti ti-license" />
        </div>

        <h2 id="eula-title" class="eula-dialog__title">
          {{ t('eula.title') }}
        </h2>

        <p class="eula-dialog__intro">
          {{ t('eula.intro') }}
        </p>
      </div>

      <div
        class="eula-dialog__text-area"
        role="region"
        aria-label="Texto completo da licença"
        tabindex="0"
        @scroll="onScroll"
      >
        <pre class="eula-dialog__text-content">{{ eulaText }}</pre>
      </div>

      <p v-if="!hasScrolledToBottom" class="eula-dialog__scroll-hint">
        <i class="ti ti-arrow-down" />
        {{ t('eula.scrollHint') }}
      </p>

      <p class="eula-dialog__version">
        {{ t('eula.version') }} {{ currentVersion }}
      </p>

      <div class="eula-dialog__actions">
        <VBtn
          variant="outlined"
          size="large"
          class="eula-dialog__btn-decline"
          @click="onDeclineClick"
        >
          {{ t('eula.decline') }}
        </VBtn>

        <VBtn
          :variant="hasScrolledToBottom ? 'flat' : 'tonal'"
          size="large"
          class="eula-dialog__btn-accept"
          :class="{ 'eula-dialog__btn-accept--ready': hasScrolledToBottom }"
          :disabled="!hasScrolledToBottom"
          @click="onAccept"
        >
          {{ t('eula.accept') }}
        </VBtn>
      </div>
    </GlassCard>
  </div>

  <!-- Dialog de confirmacao ao recusar -->
  <Teleport to="body">
    <div
      v-if="showConfirm"
      class="eula-confirm-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="eula-confirm-title"
    >
      <GlassCard class="eula-confirm__card">
        <h2 id="eula-confirm-title" class="eula-confirm__title">
          {{ t('eula.confirmTitle') }}
        </h2>
        <p class="eula-confirm__message">{{ t('eula.confirmMessage') }}</p>
        <div class="eula-confirm__actions">
          <VBtn variant="text" size="large" @click="onConfirmCancel">
            {{ t('eula.confirmNo') }}
          </VBtn>
          <VBtn
            variant="flat"
            size="large"
            class="eula-confirm__btn-yes"
            @click="onConfirmDecline"
          >
            {{ t('eula.confirmYes') }}
          </VBtn>
        </div>
      </GlassCard>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.eula-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-spacing-4, 1rem);
  background: color-mix(in srgb, var(--ds-color-surface) 95%, transparent);
  backdrop-filter: blur(4px);
  z-index: 2000;
  animation: eulaFadeIn 200ms ease;

  @keyframes eulaFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}

.eula-dialog__card {
  width: 100%;
  max-width: 36rem;
  max-height: 90vh;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  border-radius: var(--ds-radius-xl, 1.5rem);
  overflow: hidden;
}

.eula-dialog__header {
  text-align: center;
  flex-shrink: 0;
  margin-bottom: 1.5rem;
}

.eula-dialog__icon {
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.75rem;
  }
}

.eula-dialog__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ds-color-on-surface);
  line-height: 1.3;
}

.eula-dialog__intro {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ds-color-on-surface-variant);
  line-height: 1.5;
}

.eula-dialog__text-area {
  flex: 1;
  min-height: 0;
  max-height: 40vh;
  overflow-y: auto;
  margin-bottom: 1rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--ds-color-surface-variant) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.75rem);
  border: 1px solid color-mix(in srgb, var(--ds-color-outline) 20%, transparent);
  scrollbar-width: thin;
  scrollbar-color: var(--ds-color-primary) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--ds-color-primary) 50%, transparent);
    border-radius: 3px;
  }
}

.eula-dialog__text-content {
  margin: 0;
  padding: 0 0.5rem;
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--ds-color-on-surface-variant);
  white-space: pre-wrap;
  word-break: break-word;
}

.eula-dialog__scroll-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: var(--ds-color-primary);
  animation: eulaBounce 1.5s ease infinite;

  .ti {
    font-size: 0.875rem;
  }

  @keyframes eulaBounce {
    0%, 100% { transform: translateY(0); opacity: 0.7; }
    50% { transform: translateY(3px); opacity: 1; }
  }
}

.eula-dialog__version {
  margin: 0 0 1rem;
  font-size: 0.75rem;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.6;
  flex-shrink: 0;
}

.eula-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex-shrink: 0;

  @media (min-width: 480px) {
    flex-direction: row;
    justify-content: center;
  }
}

.eula-dialog__btn-decline,
.eula-dialog__btn-accept {
  flex: 1;
  min-width: 0;
}

/* web#175-adjacente: botão "aceitar" ganha destaque (bg primary) quando a
   barra rola até o fim e o aceite é liberado */
.eula-dialog__btn-accept--ready {
  background: var(--ds-color-primary) !important;
  color: var(--ds-color-on-primary, #131313) !important;
}

/* Confirmacao dupla */
.eula-confirm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-spacing-4, 1rem);
  background: color-mix(in srgb, #000 60%, transparent);
  backdrop-filter: blur(2px);
  z-index: 3000;
  animation: eulaFadeIn 150ms ease;
}

.eula-confirm__card {
  width: 100%;
  max-width: 26rem;
  padding: 1.75rem;
  text-align: center;
}

.eula-confirm__title {
  margin: 0 0 0.75rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--ds-color-on-surface);
}

.eula-confirm__message {
  margin: 0 0 1.5rem;
  font-size: 0.875rem;
  color: var(--ds-color-on-surface-variant);
  line-height: 1.5;
}

.eula-confirm__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  @media (min-width: 480px) {
    flex-direction: row-reverse;
    justify-content: center;
  }
}

.eula-confirm__btn-yes {
  background: #d32f2f !important;
  color: #fff !important;
}

/* Tela de saida */
.eula-exit {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-spacing-4, 1rem);
  background: var(--ds-color-surface);
  z-index: 2000;
}

.eula-exit__card {
  width: 100%;
  max-width: 28rem;
  padding: 2.5rem 2rem;
  text-align: center;
}

.eula-exit__icon {
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, #d32f2f 12%, transparent);
  color: #d32f2f;

  .ti {
    font-size: 2rem;
  }
}

.eula-exit__text {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ds-color-on-surface-variant);
  line-height: 1.6;
}
</style>

<style lang="scss">
[data-mode='light'] .eula-dialog {
  background: color-mix(in srgb, #ffffff 95%, transparent);
}
</style>
