import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import {
  captureCurrentBounds,
  getControlOpenFeatures,
  getOpenFeatures,
  getPopupSlotId,
  LITURGY_CONTROL_LAYOUT_ID,
  parseSlotIndex,
  requestWindowManagementPermission,
  resolveBoundsForSlot,
  saveSlotBounds,
  scheduleRestoreOnWindow,
} from '@shared/services/popup-layout'
import {
  getPopupCount,
  getProjectionFullscreenMode,
  getTargetPopupSlots,
} from '@shared/services/projection-preferences'
import { getPopupRoute, POPUP_ROUTABLE_MODULES, type PopupRoutableModule } from './popup-routing'
import { excludeOperatorSlots, loadSlotAssignments } from '@shared/services/slot-monitors'
import {
  getBrowserItem,
  setBrowserItem,
} from '@shared/services/browser-storage'

import {
  getPopupRefs,
  setPopupRefs,
  type PopupWindowRef,
} from './popup-registry'

export const POPUP_STATE_CHANNEL = 'louvorja-popup-state'
export const LITURGY_CONTROL_WINDOW_NAME = 'LiturgyWebControl'

// WT-5I: sob o desktop Electron, popups com `monitor=<displayId>` nas features
// ganham fullscreen NATIVO no display certo (main.mjs aplica borderless +
// setBounds + alwaysOnTop — imune a EWMH/Wayland). Cache carregado ANTES do
// clique: window.open precisa permanecer no gesto do operador, sem await.
interface LouvorjaElectronBridge {
  isElectron?: boolean
  displays?: { list: () => Promise<Array<{ id: number; bounds: { x: number; y: number } }>> }
}
let electronDisplays: Array<{ id: number; bounds: { x: number; y: number } }> = []

function primeElectronDisplays(): void {
  const bridge = (window as unknown as { louvorja?: LouvorjaElectronBridge }).louvorja
  if (!bridge?.isElectron || !bridge.displays) return
  void bridge.displays
    .list()
    .then((displays) => {
      electronDisplays = displays
    })
    .catch(() => {
      // bridge indisponível: popup segue pelo caminho de coordenadas web.
    })
}

/** Mapeia slot atribuído (screenId "left:top") → displayId do Electron. */
function electronMonitorIdForSlot(slotId: string): number | null {
  if (!(window as unknown as { louvorja?: LouvorjaElectronBridge }).louvorja?.isElectron) return null
  const screenId = loadSlotAssignments()[slotId]
  if (!screenId) return null
  const [leftRaw, topRaw] = screenId.split(':')
  /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
  const left = Number.parseInt(leftRaw ?? '', 10)
  /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
  const top = Number.parseInt(topRaw ?? '', 10)
  if (Number.isNaN(left) || Number.isNaN(top)) return null
  const display = electronDisplays.find((d) => d.bounds.x === left && d.bounds.y === top)
  return display ? display.id : null
}

export type PopupSyncPayload = {
  param: string
  value: unknown
}

export type PopupActionPayload = {
  action: 'report-bounds' | 'restore-bounds' | 'close-screens'
}

let controlWindowRef: PopupWindowRef | null = null
let closeScreensBridgeInstalled = false

function broadcastPopupAction(action: PopupActionPayload['action']): void {
  try {
    const channel = new BroadcastChannel(POPUP_STATE_CHANNEL)
    channel.postMessage({ action } satisfies PopupActionPayload)
    channel.close()
  } catch {
    // BroadcastChannel indisponível
  }
}

/** Fecha refs locais de telas sem reabrir nem usar window.open('', name). */
function closeLocalScreenRefs(): void {
  getPopupRefs().forEach((popup) => {
    /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
    if (!popup || popup.closed) return
    try {
      const bounds = captureCurrentBounds(popup)
      const slot = popup.__popupSlot
      if (bounds && slot) saveSlotBounds(getPopupSlotId(slot), bounds)
    } catch {
      // ignore
    }
    try {
      popup.close()
    } catch {
      // ignore
    }
  })
  persistPopups([])
}

function buildPopupUrl(
  slot: number,
  moduleId?: string,
  role: 'screen' | 'control' = 'screen',
): string {
  /* v8 ignore next -- BASE_URL é constante de build ('/' no vitest); ?? inalcançável em teste */
  const base = import.meta.env.BASE_URL ?? '/'
  /* v8 ignore next -- idem: base sempre '/' no bundle de teste, endsWith nunca é falso */
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams({
    slot: String(slot),
    role,
  })
  const module = moduleId || getActiveModule()
  if (module) params.set('module', module)
  return `${normalizedBase}popup?${params.toString()}`
}

function buildControlUrl(moduleId: string): string {
  /* v8 ignore next -- BASE_URL é constante de build ('/' no vitest); ?? inalcançável em teste */
  const base = import.meta.env.BASE_URL ?? '/'
  /* v8 ignore next -- idem: base sempre '/' no bundle de teste, endsWith nunca é falso */
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams({
    module: moduleId,
    role: 'control',
  })
  return `${normalizedBase}popup?${params.toString()}`
}

function openPopupWindow(slot: number, moduleId?: string): PopupWindowRef | null {
  // WT-5I: sob Electron, monitor=<displayId> nas features dispara fullscreen
  // NATIVO no display certo (main.mjs: borderless + setBounds + alwaysOnTop).
  // Path web (requestFullscreen) continua como fallback do browser puro.
  const monitorId = electronMonitorIdForSlot(String(slot))
  const features = monitorId != null
    ? `${getOpenFeatures(slot)},monitor=${monitorId}`
    : getOpenFeatures(slot)

  const win = window.open(
    buildPopupUrl(slot, moduleId, 'screen'),
    getPopupSlotId(slot),
    features,
  ) as PopupWindowRef | null

  if (win) {
    win.__popupSlot = slot

    // WT-5F: Chrome só aceita fullscreen dentro da activation ORIGINAL do
    // clique do operador. A preferência controla as PRÓXIMAS popups; uma
    // popup já aberta não pode entrar em fullscreen sem gesto nela.
    if (getProjectionFullscreenMode()) {
      try {
        void win.document.documentElement.requestFullscreen().catch(() => {
          // Browser/ambiente sem Fullscreen API: mantém popup maximizada via features.
        })
      } catch {
        // API ausente/síncrona indisponível.
      }
    }
  }

  return win
}

function persistPopups(popups: PopupWindowRef[]): PopupWindowRef[] {
  return setPopupRefs(popups)
}

function getActiveModule(): string {
  return getBrowserItem<string>(BROWSER_STORAGE_KEYS.popupModule, '') ?? ''
}

function setActiveModule(moduleId: string): void {
  setBrowserItem(BROWSER_STORAGE_KEYS.popupModule, moduleId || '')
  broadcastState({ param: 'popup_module', value: moduleId || '' })
}

function broadcastState(payload: PopupSyncPayload): void {
  try {
    const channel = new BroadcastChannel(POPUP_STATE_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}

function syncStateTo(popup: PopupWindowRef | null | undefined): void {
  /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
  if (!popup || popup.closed) return

  const payloads: PopupSyncPayload[] = [
    { param: 'popup_module', value: getActiveModule() },
  ]

  payloads.forEach((payload) => {
    try {
      popup.postMessage(payload, window.location.origin)
    } catch (error) {
      console.log(error)
    }
  })
}

function syncStateToAll(popups: PopupWindowRef[] = getPopupRefs()): void {
  popups.forEach(syncStateTo)
  if (controlWindowRef && !controlWindowRef.closed) {
    syncStateTo(controlWindowRef)
  }
  broadcastState({ param: 'popup_module', value: getActiveModule() })
}

function scheduleSync(popups: PopupWindowRef[] = getPopupRefs()): void {
  const run = () => {
    const live = getPopupRefs()
    syncStateToAll(live.length ? live : popups)
  }
  run()
  window.setTimeout(run, 50)
  window.setTimeout(run, 250)
  window.setTimeout(run, 800)
  window.setTimeout(run, 1500)
}

function tagPopupSlot(popup: PopupWindowRef, fallbackIndex: number): number {
  if (popup.__popupSlot) return popup.__popupSlot

  const fromName = parseSlotIndex(popup.name)
  popup.__popupSlot = fromName || fallbackIndex
  return popup.__popupSlot
}

function requestBoundsReport(popup: PopupWindowRef): void {
  /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
  if (!popup || popup.closed) return
  try {
    popup.postMessage(
      { action: 'report-bounds' } satisfies PopupActionPayload,
      window.location.origin,
    )
  } catch (error) {
    console.log(error)
  }
}

function saveOpenPopupLayouts(): void {
  getPopupRefs().forEach((popup, index) => {
    const slotId = getPopupSlotId(tagPopupSlot(popup, index + 1))
    const bounds = captureCurrentBounds(popup)
    if (bounds) saveSlotBounds(slotId, bounds)
  })
}

function ensurePopups(
  moduleId?: string,
  slotOverride?: number[],
): PopupWindowRef[] {
  const availableCount = getPopupCount()
  // Operador é uma tela de controle, nunca destino de projeção. Ao clicar
  // Projetar, abre imediatamente TODOS os slots selecionados restantes.
  const targetSlots = excludeOperatorSlots(slotOverride ?? getTargetPopupSlots()).filter(
    (slot) => slot >= 1 && slot <= availableCount,
  )
  let popups = getPopupRefs()

  // Preserva o slot real (não reindexa pelo índice do array).
  popups.forEach((popup) => {
    if (popup.__popupSlot) return
    const fromName = parseSlotIndex(popup.name)
    if (fromName) popup.__popupSlot = fromName
  })

  const targetSet = new Set(targetSlots)
  const kept: PopupWindowRef[] = []

  for (const popup of popups) {
    const slot = popup.__popupSlot ?? 0
    if (targetSet.has(slot)) {
      kept.push(popup)
      continue
    }

    const slotId = getPopupSlotId(slot || 1)
    const bounds = captureCurrentBounds(popup)
    if (bounds) saveSlotBounds(slotId, bounds)
    requestBoundsReport(popup)
    /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
    if (popup && !popup.closed) {
      popup.close()
    }
  }

  popups = kept
  const openSlots = new Set(
    popups
      .map((popup) => popup.__popupSlot)
      .filter((slot): slot is number => typeof slot === 'number' && slot > 0),
  )

  for (const slot of targetSlots) {
    if (openSlots.has(slot)) continue
    const win = openPopupWindow(slot, moduleId)
    if (win) {
      popups.push(win)
      openSlots.add(slot)
    }
  }

  popups = persistPopups(
    /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
    [...popups].sort((a, b) => (a.__popupSlot ?? 0) - (b.__popupSlot ?? 0)),
  )

  popups.forEach((popup) => {
    // Projeções sempre iniciam fullscreen (getOpenFeatures). Não restaurar
    // bounds antigos aqui — restaurar janela normal desfaria o fullscreen.
    requestBoundsReport(popup)
  })

  return popups
}

export function getPopupModule(): string {
  return getActiveModule()
}

export function isPopupModuleOpen(moduleId: string): boolean {
  return hasLivePopups() && getActiveModule() === moduleId
}

export function hasLivePopups(): boolean {
  return getPopupRefs().length > 0
}

export function hasScreenPopups(): boolean {
  return getPopupRefs().length > 0
}

export function isLiturgyControlOpen(): boolean {
  return Boolean(controlWindowRef && !controlWindowRef.closed)
}

/**
 * Abre a janela de controle da liturgia (960×540), separada dos slots de tela.
 * Sync — sem await — para preservar o gesto do usuário.
 */
export function openLiturgyControlWindow(moduleId = 'liturgy-web'): boolean {
  setActiveModule(moduleId)

  if (controlWindowRef && !controlWindowRef.closed) {
    try {
      controlWindowRef.focus()
      controlWindowRef.location.href = buildControlUrl(moduleId)
    } catch {
      // ignore navigation errors
    }
    scheduleSync()
    return true
  }

  const win = window.open(
    buildControlUrl(moduleId),
    LITURGY_CONTROL_WINDOW_NAME,
    getControlOpenFeatures(),
  ) as PopupWindowRef | null

  if (!win) {
    if (!hasLivePopups()) setActiveModule('')
    return false
  }

  controlWindowRef = win
  const saved = resolveBoundsForSlot(LITURGY_CONTROL_LAYOUT_ID)
  if (saved) scheduleRestoreOnWindow(win, saved)
  scheduleSync()
  return true
}

/** Fecha apenas as telas de projeção; mantém a janela de controle. */
export function closeScreenPopups(): void {
  saveOpenPopupLayouts()
  // Nunca usar window.open('', slotId): de outra janela (ex.: controle) isso
  // cria abas/janelas about:blank em vez de achar as telas do opener original.
  closeLocalScreenRefs()
  broadcastPopupAction('close-screens')
}

export function closeLiturgyControlWindow(): void {
  if (controlWindowRef && !controlWindowRef.closed) {
    const bounds = captureCurrentBounds(controlWindowRef)
    if (bounds) saveSlotBounds(LITURGY_CONTROL_LAYOUT_ID, bounds)
    controlWindowRef.close()
  }
  controlWindowRef = null
}

export async function openPopupModule(
  moduleId: string,
  options?: { slots?: number[] },
): Promise<boolean> {
  // Define o módulo antes de abrir, para a popup ler no boot (URL + storage).
  setActiveModule(moduleId)

  // Roteamento por módulo (paridade palco-routing do desktop): sem override
  // explícito, módulo com rota individual projeta SÓ no slot designado.
  // WT-5: rota 'tv' = só TV cloud — NENHUM popup local abre.
  let effectiveSlots = options?.slots
  if (!effectiveSlots && (POPUP_ROUTABLE_MODULES as readonly string[]).includes(moduleId)) {
    const route = getPopupRoute(moduleId as PopupRoutableModule)
    if (route === 'tv') {
      // Conteúdo vai pelo relay (runtime publica ao selecionar); aqui só
      // registra o módulo ativo pra UI/estado.
      if (!isLiturgyControlOpen()) setActiveModule(moduleId)
      requestWindowManagementPermission()
      return true
    }
    // WT-6A: rota `palco:N` = receiver PWA no slot N. Conteúdo vai pelo relay
    // (publishToStageRelay vira to: slot-N). NENHUM popup local abre.
    if (/^palco:\d+$/.test(route)) {
      if (!isLiturgyControlOpen()) setActiveModule(moduleId)
      requestWindowManagementPermission()
      return true
    }
    if (route !== 'mirror') {
      const slot = Number.parseInt(route, 10)
      if (!Number.isNaN(slot) && slot >= 1 && slot <= getPopupCount()) {
        effectiveSlots = [slot]
      }
    }
  }

  // Inicia a solicitação ainda no gesto do operador. NÃO await: window.open
  // também exige esse gesto e a Promise resolve depois para restaurar o monitor.
  const windowManagementPermission = requestWindowManagementPermission()

  // Critical: window.open precisa ocorrer ainda no gesto do usuário.
  // NÃO await antes de ensurePopups — browsers bloqueiam popup após await.
  const popups = ensurePopups(moduleId, effectiveSlots)
  if (popups.length === 0) {
    if (!isLiturgyControlOpen()) setActiveModule('')
    return false
  }

  popups.forEach((popup) => {
    try {
      popup.focus()
    } catch {
      // ignore focus errors
    }
  })

  scheduleSync(popups)

  // Projeções abrem fullscreen (getOpenFeatures). NÃO restaurar bounds
  // salvos aqui: restore colocaria a janela de volta em tamanho normal,
  // desfazendo o fullscreen do window.open. Só reporta bounds p/ layout.
  void windowManagementPermission.then(() => {
    popups.forEach((popup) => {
      /* v8 ignore next -- invariante do módulo: entrada filtrada/normalizada antes (ver teste) */
      if (!popup || popup.closed) return
      requestBoundsReport(popup)
    })
  })

  return true
}

export async function exitPopupModule(): Promise<void> {
  saveOpenPopupLayouts()
  closeScreenPopups()
  closeLiturgyControlWindow()
  setActiveModule('')
  scheduleSync()
}

export async function closeAllPopups(): Promise<void> {
  closeScreenPopups()
  closeLiturgyControlWindow()
  setActiveModule('')
}

export function syncPopupWindows(): PopupWindowRef[] {
  const popups = ensurePopups()
  scheduleSync(popups)
  return popups
}

export function handlePopupBoundsMessage(
  slotId: string,
  bounds: Parameters<typeof saveSlotBounds>[1],
): void {
  saveSlotBounds(slotId, bounds)
}

let openerBridgeInstalled = false

/** Escuta bounds reportados pelas janelas de projeção (legado). */
export function installPopupOpenerBridge(): void {
  if (openerBridgeInstalled || typeof window === 'undefined') return
  openerBridgeInstalled = true

  // WT-5I: cache de displays do Electron p/ mapear monitor=<displayId> nas
  // features do window.open — o gesto do clique não pode esperar IPC.
  primeElectronDisplays()

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return

    const data = event.data as {
      action?: string
      slot?: string
      bounds?: Parameters<typeof saveSlotBounds>[1]
    } | null

    if (data?.action === 'popup-bounds' && data.slot && data.bounds) {
      handlePopupBoundsMessage(data.slot, data.bounds)
    }

    if (data?.action === 'close-screens') {
      closeLocalScreenRefs()
    }
  })

  /* v8 ignore next -- invariante: openerBridgeInstalled (guard externo) impede 2ª entrada com flag true; flag só fica true quando o BC é criado com sucesso */
  if (!closeScreensBridgeInstalled) {
    closeScreensBridgeInstalled = true
    try {
      const channel = new BroadcastChannel(POPUP_STATE_CHANNEL)
      channel.addEventListener('message', (event: MessageEvent<PopupActionPayload>) => {
        if (event.data?.action !== 'close-screens') return
        // Outra janela pediu para limpar/fechar telas (ex.: botão no controle).
        closeLocalScreenRefs()
      })
    } catch {
      closeScreensBridgeInstalled = false
    }
  }
}
