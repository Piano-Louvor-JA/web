<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { usePageTransition } from '@design-system/composables'
import { DockFooter, GradientBackground } from '@design-system/index'
import type { DockNavItem } from '@design-system/types/navigation'
import { useBibleStore } from '@modules/bible/stores/useBibleStore'
import { useClockStore } from '@modules/clock/stores/useClockStore'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import { useLiturgyStore } from '@modules/liturgy/stores/useLiturgyStore'
import MediaChrome from '@modules/media/components/MediaChrome.vue'
import { useMediaPlayer } from '@modules/media/composables/useMediaPlayer'
import { useRandomStore } from '@modules/random/stores/useRandomStore'
import { useTimerStore } from '@modules/timer/stores/useTimerStore'
import { mainNavRoutes } from '@shared/constants/navigation'
import DownloadQueueIndicator from '@modules/sync/components/DownloadQueueIndicator.vue'
import PopupScreenControls from '@shared/components/PopupScreenControls.vue'
import UiZoomControls from '@shared/components/UiZoomControls.vue'
import { useOperatorEscapeToCloseAllProjections } from '@shared/composables/useOperatorEscapeToCloseAllProjections'
import logoUrl from '@assets/brand/logo-louvor-ja.svg'
import CodenameLogo from '@assets/brand/CodenameLogo.vue'
import { APP_VERSION } from '@shared/constants/app'
import AuthAccountDialog from '@modules/auth/components/AuthAccountDialog.vue'
import { useAuth } from '@modules/auth/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { transitionName } = usePageTransition()
const { smAndDown } = useDisplay()

// ESC no operador fecha TODAS as projeções ativas (com confirmação) — paridade app.
useOperatorEscapeToCloseAllProjections()

// WT-5G: reconexão do relay do palco GLOBAL, não só no mount do ScreensCard.
// Antes: reload na /bible deixava o operador desconectado da sessão cloud
// (window.__palcoRelaySend ausente) — TVs/kiosk não recebiam nada até abrir
// /settings/projection. O guard evita attach duplicado quando o ScreensCard
// também monta (double attach = race de geração já tratada no attachCode,
// mas economiza um token fetch).
import { attachStoredSession } from '@modules/remote/services/stage-relay'
void attachStoredSession()

const {
  hasSession: hasMediaSession,
  isProjecting: isMediaProjecting,
  toggleProjection: toggleMediaProjection,
} = useMediaPlayer()

const bibleStore = useBibleStore()
const { isProjecting: isBibleProjecting, projection: bibleProjection } =
  storeToRefs(bibleStore)

const randomStore = useRandomStore()
const { isProjecting: isRandomProjecting } = storeToRefs(randomStore)

const timerStore = useTimerStore()
const { isProjecting: isTimerProjecting } = storeToRefs(timerStore)

const countdownStore = useCountdownStore()
const { isProjecting: isCountdownProjecting } = storeToRefs(countdownStore)

const clockStore = useClockStore()
const { isProjecting: isClockProjecting } = storeToRefs(clockStore)

const liturgyStore = useLiturgyStore()
const {
  siteProjectionItemId,
  videoProjectionItemId,
  selectedItemIndex,
  selectedItem,
} = storeToRefs(liturgyStore)

/** Tipos da liturgia que o header Projetar consegue abrir nas telas. */
const LITURGY_PROJECTABLE = new Set([
  'music',
  'site',
  'online_video',
  'video',
  'images',
  'pdf',
  'presentation',
])

/** Auth: dialog control + notifier. */
const authDialogOpen = ref(false)
const { session, isLoggedIn, userName, login, logout } = useAuth()

function showAuthDialog(): void {
  authDialogOpen.value = true
}

const hasBibleContent = computed(
  () =>
    bibleProjection.value.verses.length > 0 &&
    Boolean(bibleProjection.value.text),
)

const isOnRandomRoute = computed(() => route.name === 'utilities-random')
const isOnTimerRoute = computed(() => route.name === 'utilities-timer')
const isOnCountdownRoute = computed(() => route.name === 'utilities-countdown')
const isOnClockRoute = computed(() => route.name === 'utilities-clock')
const isOnLiturgyRoute = computed(() => route.meta.navKey === 'liturgy')

const isLiturgyProjecting = computed(
  () =>
    siteProjectionItemId.value != null || videoProjectionItemId.value != null,
)

const hasLiturgyProjectableSelection = computed(() => {
  const item = selectedItem.value
  return (
    item != null &&
    !item.done &&
    LITURGY_PROJECTABLE.has(item.type)
  )
})

const isProjecting = computed(
  () =>
    isMediaProjecting.value ||
    isBibleProjecting.value ||
    isRandomProjecting.value ||
    isTimerProjecting.value ||
    isCountdownProjecting.value ||
    isClockProjecting.value ||
    isLiturgyProjecting.value,
)

/** Há conteúdo projetável ou projeção ativa. */
const canToggleProjection = computed(
  () =>
    hasMediaSession.value ||
    isMediaProjecting.value ||
    hasBibleContent.value ||
    isBibleProjecting.value ||
    isOnRandomRoute.value ||
    isRandomProjecting.value ||
    isOnTimerRoute.value ||
    isTimerProjecting.value ||
    isOnCountdownRoute.value ||
    isCountdownProjecting.value ||
    isOnClockRoute.value ||
    isClockProjecting.value ||
    isLiturgyProjecting.value ||
    (isOnLiturgyRoute.value && hasLiturgyProjectableSelection.value),
)

const projectAriaLabel = computed(() => {
  if (isLiturgyProjecting.value) return t('liturgy.actions.stopSiteProjection')
  if (isClockProjecting.value) return t('clock.clearProjection')
  if (isCountdownProjecting.value) return t('countdown.clearProjection')
  if (isTimerProjecting.value) return t('timer.clearProjection')
  if (isRandomProjecting.value) return t('random.clearProjection')
  if (isBibleProjecting.value) return t('bible.clearProjection')
  if (isMediaProjecting.value) return t('media.clearProjection')
  if (isOnLiturgyRoute.value) return t('liturgy.actions.project')
  if (isOnClockRoute.value) return t('clock.project')
  if (isOnCountdownRoute.value) return t('countdown.project')
  if (isOnTimerRoute.value) return t('timer.project')
  if (isOnRandomRoute.value) return t('random.project')
  if (route.meta.navKey === 'bible') return t('bible.project')
  return t('media.project')
})

async function onToggleProjection() {
  if (!canToggleProjection.value) return

  if (isMediaProjecting.value) {
    await toggleMediaProjection()
    return
  }
  if (isBibleProjecting.value) {
    await bibleStore.clearProjectionWindow()
    return
  }
  if (isRandomProjecting.value) {
    await randomStore.clearProjection()
    return
  }
  if (isTimerProjecting.value) {
    await timerStore.clearProjection()
    return
  }
  if (isCountdownProjecting.value) {
    await countdownStore.clearProjection()
    return
  }
  if (isClockProjecting.value) {
    await clockStore.clearProjection()
    return
  }
  if (isLiturgyProjecting.value) {
    await liturgyStore.clearWebProjection()
    return
  }

  // Preferência: módulo atual; senão o que tiver conteúdo.
  if (isOnLiturgyRoute.value && hasLiturgyProjectableSelection.value) {
    const index = selectedItemIndex.value
    if (index != null) await liturgyStore.playItemOnScreens(index)
    return
  }
  if (isOnClockRoute.value) {
    await clockStore.toggleProjection()
    return
  }
  if (isOnCountdownRoute.value) {
    await countdownStore.toggleProjection()
    return
  }
  if (isOnTimerRoute.value) {
    await timerStore.toggleProjection()
    return
  }
  if (isOnRandomRoute.value) {
    await randomStore.toggleProjection()
    return
  }
  if (route.meta.navKey === 'bible' && hasBibleContent.value) {
    await bibleStore.toggleProjection()
    return
  }
  if (hasMediaSession.value) {
    await toggleMediaProjection()
    return
  }
  if (hasBibleContent.value) {
    await bibleStore.toggleProjection()
  }
}

const activeKey = computed(() => {
  const navKey = route.meta.navKey
  return typeof navKey === 'string' ? navKey : 'home'
})

/** Items ocultos no dock em mobile (issue #3 — Ezequias 24/07/2026).
 * Settings permanece por questões cosméticas. */
const DOCK_HIDDEN_ON_MOBILE = new Set<string>(['liturgy', 'utilities'])

const navItems = computed<DockNavItem[]>(() =>
  mainNavRoutes
    .filter((item) => !smAndDown.value || !DOCK_HIDDEN_ON_MOBILE.has(item.key))
    .map((item) => {
      let label = t(item.labelKey)
      if (smAndDown.value) {
        if (item.key === 'settings') {
          label = 'config'
        } else if (item.key === 'albums') {
          label = 'midia'
        }
      }
      return {
        key: item.key,
        icon: item.icon,
        label,
        to: item.to,
      }
    }),
)

function onNavigate(key: string) {
  const item = mainNavRoutes.find((nav) => nav.key === key)
  if (item) {
    router.push(item.to)
  }
}

function viewKey(viewRoute: typeof route) {
  const navKey = viewRoute.meta.navKey
  return typeof navKey === 'string' ? navKey : String(viewRoute.name ?? viewRoute.path)
}
</script>

<template>
  <GradientBackground class="app-shell">
    <header class="app-shell__header">
      <div class="app-shell__brand-group" :aria-label="t('app.name')">
        <img
          v-if="activeKey !== 'home'"
          class="app-shell__logo"
          :src="logoUrl"
          :alt="t('app.name')"
          width="52"
          height="52"
        >
        <span class="app-shell__brand">
          <span class="app-shell__brand-louvor">{{ t('app.nameLouvor') }}</span>
          <span class="app-shell__brand-ja">{{ t('app.nameJa') }}</span>
        </span>
      </div>
      <div class="app-shell__header-end">
        <!-- app#338 paridade app: fila de downloads com feedback visual -->
        <DownloadQueueIndicator v-if="!smAndDown" />

        <!-- Zoom + projeção + multi-telas: desktop only (mesmo critério smAndDown do dock) -->
        <UiZoomControls v-if="!smAndDown" />
        <div
          v-if="!smAndDown"
          class="app-shell__projection"
        >
          <PopupScreenControls class="app-shell__screens" />
          <button
            type="button"
            class="app-shell__project-btn"
            :class="{ 'app-shell__project-btn--on': isProjecting }"
            :disabled="!canToggleProjection"
            :aria-label="projectAriaLabel"
            :title="projectAriaLabel"
            @click="onToggleProjection"
          >
            <i
              class="ti"
              :class="isProjecting ? 'ti-player-stop' : 'ti-presentation'"
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="app-shell__codename-block">
                  <CodenameLogo
                    class="app-shell__codename"
                  />
                  <span class="app-shell__version" aria-hidden="true">{{ APP_VERSION }}</span>
                </div>
                <!-- Botão de conta (desktop only) -->
                <div v-if="!smAndDown" class="app-shell__account-block">
                  <button
                    type="button"
                    class="app-shell__account-btn"
                    :class="{ 'is-authenticated': isLoggedIn }"
                    @click="showAuthDialog"
                    :aria-label="isLoggedIn ? t('auth.logout') : t('auth.title')"
                  >
                    <i
                      class="ti"
                      :class="isLoggedIn ? 'ti-user-check' : 'ti-user'"
                      aria-hidden="true"
                    />
                    <span v-if="isLoggedIn" class="app-shell__account-name">
                      {{ userName }}
                    </span>
                  </button>
                </div>
              </div>
    </header>

    <main class="app-shell__main">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition :name="transitionName" mode="out-in">
          <component
            :is="Component"
            :key="viewKey(viewRoute)"
          />
        </Transition>
      </RouterView>
    </main>

    <MediaChrome />

    <DockFooter
          :items="navItems"
          :active-key="activeKey"
          @select="onNavigate"
        />
        <!-- Auth dialog -->
        <AuthAccountDialog v-model="authDialogOpen" />
      </GradientBackground>
    </template>

<style scoped lang="scss">
.app-shell {
  min-height: 100%;
}

.app-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  height: var(--ds-header-height, 5.5rem);
  padding: 0 var(--ds-spacing-page);
  border-bottom: 1px solid var(--ds-color-outline);
  background: var(--ds-color-background);
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  z-index: 100;
}

.app-shell__brand-group {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
}

.app-shell__logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

.app-shell__brand {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.app-shell__brand-louvor {
  color: var(--ds-color-on-surface);
}

.app-shell__brand-ja {
  color: var(--ds-color-brand-yellow);
}

.app-shell__header-end {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.app-shell__projection {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.app-shell__screens {
  flex-shrink: 0;
}

.app-shell__project-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1.1rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  &--on {
    background: color-mix(in srgb, var(--ds-color-primary) 32%, transparent);
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
}

.app-shell__codename-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

.app-shell__codename {
  display: block;
  height: 2.2rem;
  width: auto;
  flex-shrink: 0;
  opacity: 0.4;
}

/* Tema claro: codename com 100% de opacidade — seletor global para vencer especificidade scoped */
:global(html[data-mode='light'] .app-shell__codename) {
  opacity: 1 !important;
}

.app-shell__version {
  color: var(--ds-color-on-surface-variant);
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.02em;
  opacity: 0.7;
}

.app-shell__account {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  transition: color 200ms ease, transform 150ms ease;

  .ti {
    font-size: 32px;
    line-height: 1;
  }

  &:hover {
    color: var(--ds-color-primary-soft);
  }

  &:active {
    transform: scale(0.95);
  }
}

.app-shell__main {
  position: relative;
  z-index: 1;
  padding-top: var(--ds-header-height, 5.5rem);
  min-height: calc(100 * var(--ui-vh));
  box-sizing: border-box;
  padding-bottom: var(--ds-dock-height);
}

/* Desktop médio / 1024×768: chrome mais compacto */
@media (max-width: 1280px) {
  .app-shell__header {
    gap: 1rem;
  }

  .app-shell__brand-group {
    gap: 0.75rem;
  }

  .app-shell__logo {
    width: 44px;
    height: 44px;
  }

  .app-shell__brand {
    font-size: 28px;
  }

  .app-shell__codename {
    height: 1.75rem;
  }

  .app-shell__version {
    font-size: 13px;
  }

  .app-shell__account .ti {
    font-size: 26px;
  }

  .app-shell__header-end {
    gap: 0.75rem;
  }

  .app-shell__codename-block {
    gap: 0.5rem;
  }
}

/* ── Responsivo: telas pequenas (≤ 600px = breakpoint sm do Vuetify) ── */
@media (max-width: 600px) {
  .app-shell__header {
    padding: 0 var(--ds-spacing-2, 0.75rem);
    gap: 0.75rem;
  }

  .app-shell__brand-group {
    gap: 0.75rem;
  }

  .app-shell__logo {
    width: 42px;
    height: 42px;
  }

  .app-shell__brand {
    font-size: 28px;
    gap: 0.25em;
    white-space: nowrap;
  }

  .app-shell__codename {
    width: auto !important;
    height: 1.6rem !important;
  }

  .app-shell__version {
    font-size: 12px;
    white-space: nowrap;
  }
}

@media (max-width: 360px) {
  .app-shell__header {
    padding: 0 0.5rem;
    gap: 0.5rem;
  }

  .app-shell__brand-group {
    gap: 0.5rem;
  }

  .app-shell__logo {
    width: 36px;
    height: 36px;
  }

  .app-shell__brand {
    font-size: 24px;
  }

  .app-shell__codename {
    width: auto !important;
    height: 1.4rem !important;
  }

  .app-shell__version {
    font-size: 11px;
  }
}

/* Auth account button */
.app-shell__account-block {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.app-shell__account-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 9999px;
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover {
    background: var(--ds-color-surface-container-high);
    border-color: var(--ds-color-outline-variant);
  }

  &:active {
    transform: scale(0.98);
  }

  /* Logado: destaque visual claro (borda + ícone na cor primária) */
  &.is-authenticated {
    border-color: var(--ds-color-primary);
    color: var(--ds-color-primary);

    .app-shell__account-name {
      color: var(--ds-color-on-surface);
    }

    &:hover {
      background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    }
  }
}

.app-shell__account-name {
  font-size: 0.85rem;
  font-weight: 500;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
