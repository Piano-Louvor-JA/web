import { computed, onMounted, ref } from 'vue'

import { breakpoints } from '@design-system/tokens/breakpoints'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

/** Limites alinhados aos botões (70%–150%). */
const ZOOM_MIN = 0.7
const ZOOM_MAX = 1.5
const ZOOM_DEFAULT = 1

/**
 * Mesmo motor do Chromium / Electron: factor = 1.2 ^ level.
 * Ctrl+/Ctrl− no Chromium usam presets; no Electron o bridge sobe/desce 0.5 de nível.
 * Na web replicamos o passo de nível do Electron para o botão e o atalho baterem.
 */
const ZOOM_LEVEL_RATIO = 1.2
const ZOOM_LEVEL_STEP = 0.5

/**
 * Alinha com Vuetify `smAndDown` (width < md): mesmo critério do dock
 * (Liturgia/Utilitários) e dos controles de projeção / multi-telas.
 */
const MOBILE_MAX_WIDTH = breakpoints.md - 1

/**
 * Chromium às vezes devolve ~1.01 (101%) no nível 0.
 * Valores que arredondam para 99–101% viram exatamente 100%.
 */
/* v8 ignore next -- defensivo: entradas já passam por Number.isFinite em readStoredZoom/levelToFactor */
function snapZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
  const percent = Math.round(clamped * 100)
  if (percent >= 99 && percent <= 101) return ZOOM_DEFAULT
  return clamped
}

function clampZoom(value: number): number {
  return snapZoom(value)
}

function formatZoomPercent(factor: number): number {
  return Math.round(snapZoom(factor) * 100)
}

function factorToLevel(factor: number): number {
  return Math.log(Math.max(factor, 1e-6)) / Math.log(ZOOM_LEVEL_RATIO)
}

function levelToFactor(level: number): number {
  return ZOOM_LEVEL_RATIO ** level
}

function isProjectionPopupLocation(): boolean {
/* v8 ignore next -- guard de ambiente (web é SPA; no browser o branch ativo é sempre este) */
  if (typeof window === 'undefined') return false
  const href = window.location.href
  const path = window.location.pathname
  return href.includes('#/popup') || path.includes('/popup') || href.includes('/popup?')
}

/* v8 ignore next 4 -- module-level: avaliado no import; SPA nunca roda sem window (SSR) */
const mobileMediaQuery =
  typeof window !== 'undefined'
    ? window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    : null

/* v8 ignore next 2 -- module-level: avaliado no import; SPA nunca roda sem window (SSR) */
const isMobileViewport = ref(mobileMediaQuery?.matches ?? false)

function onMobileViewportChange(event: MediaQueryListEvent) {
  isMobileViewport.value = event.matches
  syncZoomToViewport()
}

function isZoomDisabled(): boolean {
  return isProjectionPopupLocation() || isMobileViewport.value
}

function readStoredZoom(): number {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.uiZoom)
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clampZoom(stored)
  }
  if (typeof stored === 'string') {
    const parsed = Number.parseFloat(stored)
    if (Number.isFinite(parsed)) return clampZoom(parsed)
  }
  return ZOOM_DEFAULT
}

const zoom = ref(readStoredZoom())

let shortcutInstalled = false
let mobileListenerInstalled = false

function clearCssZoom(): void {
/* v8 ignore next -- guard de ambiente (web é SPA; no browser o branch ativo é sempre este) */
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.removeProperty('zoom')
  root.style.removeProperty('--ui-zoom')
}

function persistZoom(value: number): void {
/* v8 ignore next -- guard de ambiente (web é SPA; no browser o branch ativo é sempre este) */
  if (typeof localStorage === 'undefined') return
  setUserPreference(USER_PREFERENCE_KEYS.uiZoom, value)
}

/** Aplica zoom via CSS (web não tem webFrame do Electron). */
function applyZoom(value: number): number {
  const next = clampZoom(value)
/* v8 ignore next -- guard de ambiente (web é SPA; no browser o branch ativo é sempre este) */
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.zoom = String(next)
    root.style.setProperty('--ui-zoom', String(next))
  }
  zoom.value = next
  return next
}

/** Mobile/popup: zera CSS; desktop: reaplica o fator persistido. */
function syncZoomToViewport(): void {
  if (isZoomDisabled()) {
    clearCssZoom()
    zoom.value = ZOOM_DEFAULT
    return
  }
  applyZoom(readStoredZoom())
}

function setZoom(value: number): number {
  if (isZoomDisabled()) {
    clearCssZoom()
    zoom.value = ZOOM_DEFAULT
    return ZOOM_DEFAULT
  }
  const applied = applyZoom(value)
  persistZoom(applied)
  return applied
}

function stepZoomLevel(delta: number): number {
  const currentLevel = factorToLevel(zoom.value)
  return setZoom(levelToFactor(currentLevel + delta))
}

function zoomIn(): void {
  if (isZoomDisabled()) return
  if (zoom.value >= ZOOM_MAX - 1e-9) return
  stepZoomLevel(ZOOM_LEVEL_STEP)
}

function zoomOut(): void {
  if (isZoomDisabled()) return
  if (zoom.value <= ZOOM_MIN + 1e-9) return
  stepZoomLevel(-ZOOM_LEVEL_STEP)
}

function resetZoom(): void {
  if (isZoomDisabled()) return
  setZoom(ZOOM_DEFAULT)
}

function isZoomModifier(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey
}

function onZoomShortcut(event: KeyboardEvent): void {
  if (isZoomDisabled()) return
  if (!isZoomModifier(event)) return

  const key = event.key
  const code = event.code

  const zoomInKey =
    key === '+' || key === '=' || code === 'NumpadAdd' || code === 'Equal'
  const zoomOutKey =
    key === '-' || key === '_' || code === 'NumpadSubtract' || code === 'Minus'
  const zoomResetKey =
    key === '0' || code === 'Digit0' || code === 'Numpad0'

  if (zoomInKey) {
    event.preventDefault()
    zoomIn()
    return
  }
  if (zoomOutKey) {
    event.preventDefault()
    zoomOut()
    return
  }
  if (zoomResetKey) {
    event.preventDefault()
    resetZoom()
  }
}

function installZoomShortcuts(): void {
  if (typeof window === 'undefined' || shortcutInstalled) return
  window.addEventListener('keydown', onZoomShortcut, { capture: true })
  shortcutInstalled = true
}

function installMobileViewportListener(): void {
  if (!mobileMediaQuery || mobileListenerInstalled) return
  mobileMediaQuery.addEventListener('change', onMobileViewportChange)
  mobileListenerInstalled = true
}

/** Aplica o zoom persistido (chamar no boot). */
export function initUiZoom(): void {
  installMobileViewportListener()
  installZoomShortcuts()
  syncZoomToViewport()
}

export function useUiZoom() {
  const zoomPercent = computed(() => formatZoomPercent(zoom.value))
  const canZoomIn = computed(
    () => !isZoomDisabled() && zoom.value < ZOOM_MAX - 1e-9,
  )
  const canZoomOut = computed(
    () => !isZoomDisabled() && zoom.value > ZOOM_MIN + 1e-9,
  )

  onMounted(() => {
    installMobileViewportListener()
    installZoomShortcuts()
    syncZoomToViewport()
  })

  return {
    zoom,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    min: ZOOM_MIN,
    max: ZOOM_MAX,
  }
}
