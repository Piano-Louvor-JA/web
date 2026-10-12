import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import {
  getBrowserItem,
  removeBrowserItem,
  setBrowserItem,
} from '@shared/services/browser-storage'

export interface PopupBounds {
  left: number
  top: number
  width: number
  height: number
  screenLeft?: number
  screenTop?: number
  screenWidth?: number
  screenHeight?: number
}

export type PopupLayoutMap = Record<string, PopupBounds>

const POPUP_WIDTH = 800
const POPUP_HEIGHT = 600
const CONTROL_WIDTH = 960
const CONTROL_HEIGHT = 540
const POPUP_BASE_LEFT = 80
const POPUP_BASE_TOP = 40
const POPUP_OFFSET_X = 60
const POPUP_OFFSET_Y = 60

const RESTORE_DELAYS_MS = [0, 50, 150, 300, 600, 1000, 2000]

export function getPopupSlotId(index: number): string {
  return `PopupWindow${index}`
}

/** Id de layout persistido da janela de controle da liturgia. */
export const LITURGY_CONTROL_LAYOUT_ID = 'LiturgyWebControl'

export function parseSlotIndex(slotId: string | null | undefined): number | null {
  const match = /^PopupWindow(\d+)$/.exec(slotId || '')
  return match ? Number.parseInt(match[1], 10) : null
}

export function getLayout(): PopupLayoutMap {
  return getBrowserItem<PopupLayoutMap>(BROWSER_STORAGE_KEYS.popupLayout, {}) ?? {}
}

export function getLayoutEntry(slotId: string): PopupBounds | null {
  const entry = getLayout()[slotId]
  if (!entry) return null
  return normalizeBounds(entry, true)
}

export function getDefaultBounds(index: number): PopupBounds {
  return {
    left: POPUP_BASE_LEFT + (index - 1) * POPUP_OFFSET_X,
    top: POPUP_BASE_TOP + (index - 1) * POPUP_OFFSET_Y,
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  }
}

function normalizeBounds(
  bounds: Partial<PopupBounds> | null | undefined,
  keepScreen = false,
): PopupBounds | null {
  if (!bounds) return null

  const left = Number(bounds.left)
  const top = Number(bounds.top)
  const width = Number(bounds.width)
  const height = Number(bounds.height)
  if ([left, top, width, height].some((n) => Number.isNaN(n))) return null
  if (width < 200 || height < 150) return null

  const normalized: PopupBounds = {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  }

  if (keepScreen) {
    const screenLeft = Number(bounds.screenLeft)
    const screenTop = Number(bounds.screenTop)
    if (!Number.isNaN(screenLeft) && !Number.isNaN(screenTop)) {
      normalized.screenLeft = Math.round(screenLeft)
      normalized.screenTop = Math.round(screenTop)
      if (!Number.isNaN(Number(bounds.screenWidth))) {
        normalized.screenWidth = Math.round(Number(bounds.screenWidth))
      }
      if (!Number.isNaN(Number(bounds.screenHeight))) {
        normalized.screenHeight = Math.round(Number(bounds.screenHeight))
      }
    }
  }

  return normalized
}

export function resolveBounds(index: number): PopupBounds {
  const saved = getLayoutEntry(getPopupSlotId(index))
  return saved || getDefaultBounds(index)
}

export function resolveBoundsForSlot(slotId: string): PopupBounds | null {
  if (slotId === LITURGY_CONTROL_LAYOUT_ID) {
    return resolveControlBounds()
  }
  const index = parseSlotIndex(slotId)
  if (!index) return null
  return getLayoutEntry(slotId) || getDefaultBounds(index)
}

export function getDefaultControlBounds(): PopupBounds {
  const width = CONTROL_WIDTH
  const height = CONTROL_HEIGHT
  const availWidth = window.screen?.availWidth ?? width
  const availHeight = window.screen?.availHeight ?? height
  return {
    left: Math.max(0, Math.round((availWidth - width) / 2)),
    top: Math.max(0, Math.round((availHeight - height) / 2)),
    width,
    height,
  }
}

export function resolveControlBounds(): PopupBounds {
  return getLayoutEntry(LITURGY_CONTROL_LAYOUT_ID) || getDefaultControlBounds()
}

function readScreenOrigin(scr: Screen): { left: number; top: number } {
  const extended = scr as Screen & { availLeft?: number; availTop?: number }
  return {
    left: Math.round(extended.availLeft ?? 0),
    top: Math.round(extended.availTop ?? 0),
  }
}

function enrichWithScreen(targetWindow: Window, bounds: PopupBounds): PopupBounds {
  const scr = targetWindow.screen
  if (!scr || !bounds) return bounds

  const origin = readScreenOrigin(scr)
  return {
    ...bounds,
    screenLeft: origin.left,
    screenTop: origin.top,
    screenWidth: Math.round(scr.availWidth ?? scr.width ?? 0),
    screenHeight: Math.round(scr.availHeight ?? scr.height ?? 0),
  }
}

export function saveSlotBounds(slotId: string, bounds: Partial<PopupBounds>): void {
  if (!slotId) return
  const normalized = normalizeBounds(bounds, true)
  if (!normalized) return

  const layout = getLayout()
  const current = layout[slotId]
  if (
    current && // NOSONAR
    current.left === normalized.left &&
    current.top === normalized.top &&
    current.width === normalized.width &&
    current.height === normalized.height &&
    current.screenLeft === normalized.screenLeft &&
    current.screenTop === normalized.screenTop
  ) {
    return
  }

  layout[slotId] = normalized
  setBrowserItem(BROWSER_STORAGE_KEYS.popupLayout, layout)
}

/** Remove a atribuição persistida; próximo open volta ao monitor atual/default. */
export function clearSlotBounds(slotId: string): void {
  if (!slotId) return
  const layout = getLayout()
  if (!(slotId in layout)) return
  delete layout[slotId]
  setBrowserItem(BROWSER_STORAGE_KEYS.popupLayout, layout)
}

export function captureCurrentBounds(targetWindow: Window = window): PopupBounds | null {
  const bounds = normalizeBounds({
    left: targetWindow.screenX,
    top: targetWindow.screenY,
    width: targetWindow.outerWidth,
    height: targetWindow.outerHeight,
  })
  if (!bounds) return null
  return enrichWithScreen(targetWindow, bounds)
}

function isOnSavedScreen(targetWindow: Window, entry: PopupBounds): boolean {
  if (entry.screenLeft === undefined || entry.screenTop === undefined) {
    return true
  }
  const scr = targetWindow.screen
  if (!scr) return true
  const origin = readScreenOrigin(scr)
  return origin.left === entry.screenLeft && origin.top === entry.screenTop
}

async function findSavedScreen(entry: PopupBounds): Promise<ScreenDetailed | null> {
  const getScreenDetails = window.getScreenDetails
  if (!getScreenDetails) return null
  if (entry.screenLeft === undefined) return null

  try {
    const details = await getScreenDetails()
    return (
      details.screens.find(
        (screen) =>
          Math.round(screen.availLeft) === entry.screenLeft &&
          Math.round(screen.availTop) === entry.screenTop,
      ) || null
    )
  } catch {
    return null
  }
}

export async function applyBounds(
  targetWindow: Window,
  entry: Partial<PopupBounds> | null | undefined,
): Promise<void> {
  const bounds = normalizeBounds(entry, true)
  if (!targetWindow || targetWindow.closed || !bounds) return

  try {
    targetWindow.resizeTo(bounds.width, bounds.height)
    targetWindow.moveTo(bounds.left, bounds.top)

    if (!isOnSavedScreen(targetWindow, bounds)) {
      const screen = await findSavedScreen(bounds)
      if (screen) {
        const left = Math.max(
          screen.availLeft,
          Math.min(bounds.left, screen.availLeft + screen.availWidth - bounds.width),
        )
        const top = Math.max(
          screen.availTop,
          Math.min(bounds.top, screen.availTop + screen.availHeight - bounds.height),
        )
        targetWindow.moveTo(left, top)
        targetWindow.resizeTo(bounds.width, bounds.height)
      } else {
        targetWindow.moveTo(bounds.left, bounds.top)
      }
    }
  } catch (error) {
    console.log(error)
  }
}

/**
 * Telas de projeção SEMPRE abrem fullscreen. Quando o slot já foi associado
 * a outro monitor, usa a origem/dimensões daquele monitor; caso contrário,
 * usa o monitor atual. Janela de controle não passa por aqui.
 */
export function getProjectionFullscreenBounds(index: number): PopupBounds {
  const saved = getLayoutEntry(getPopupSlotId(index))
  if (
    saved?.screenLeft !== undefined &&
    saved.screenTop !== undefined &&
    saved.screenWidth &&
    saved.screenHeight
  ) {
    return {
      left: saved.screenLeft,
      top: saved.screenTop,
      width: saved.screenWidth,
      height: saved.screenHeight,
    }
  }
  const screen = window.screen
  const origin = readScreenOrigin(screen)
  return {
    left: origin.left,
    top: origin.top,
    width: Math.round(screen.availWidth || screen.width),
    height: Math.round(screen.availHeight || screen.height),
  }
}

export function getOpenFeatures(index: number): string {
  const bounds = getProjectionFullscreenBounds(index)
  return `popup=yes,fullscreen=yes,width=${bounds.width},height=${bounds.height},left=${bounds.left},top=${bounds.top},menubar=no,toolbar=no,location=no,status=no`
}

/** Features da janela de controle da liturgia (≈ Electron 960×540). */
export function getControlOpenFeatures(): string {
  const bounds = resolveControlBounds()
  return `width=${bounds.width},height=${bounds.height},left=${bounds.left},top=${bounds.top},menubar=no,toolbar=no,location=no,status=no`
}

export function scheduleRestoreOnWindow(
  targetWindow: Window,
  entry: Partial<PopupBounds> | null | undefined,
): void {
  if (!targetWindow || targetWindow.closed || !entry) return

  RESTORE_DELAYS_MS.forEach((delay) => {
    setTimeout(() => {
      if (targetWindow.closed) return
      void applyBounds(targetWindow, entry)
    }, delay)
  })
}

export async function requestWindowManagementPermission(): Promise<void> {
  const getScreenDetails = window.getScreenDetails
  if (!getScreenDetails) return
  try {
    await getScreenDetails()
  } catch (error) {
    console.log(error)
  }
}

export function resetLayout(): void {
  removeBrowserItem(BROWSER_STORAGE_KEYS.popupLayout)
}
