import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * slot-monitors: atribuição slot↔monitor físico (persistida), monitor do
 * operador e exclusão de slots do PC do operador.
 *
 * popup-layout mockado (bounds vão pro map de layout); browser-storage em
 * memória. Evento 'louvorja-slot-monitors-changed' espiado no window real.
 */
const store = new Map<string, string>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (k: string) => {
    const raw = store.get(k)
    return raw === undefined ? null : JSON.parse(raw)
  },
  setBrowserItem: (k: string, v: unknown) => {
    store.set(k, JSON.stringify(v))
  },
  removeBrowserItem: (k: string) => {
    store.delete(k)
  },
}))

vi.mock('@shared/services/popup-layout', () => ({
  getPopupSlotId: (i: number) => `PopupWindow${i}`,
  saveSlotBounds: vi.fn(),
  clearSlotBounds: vi.fn(),
}))

import {
  assignScreenToSlot,
  clearScreenAssignment,
  excludeOperatorSlots,
  findSlotForScreen,
  getOperatorMonitor,
  loadSlotAssignments,
  pickSlotForScreen,
  setOperatorMonitor,
} from './slot-monitors'
import { clearSlotBounds, saveSlotBounds } from '@shared/services/popup-layout'

const SCREEN = { id: '1024x768@0,0', label: 'Tela 1', left: 0, top: 0, width: 1024, height: 768, isPrimary: true, isInternal: false }
const SCREEN2 = { id: '1920x1080@1920,0', label: 'Tela 2', left: 1920, top: 0, width: 1920, height: 1080, isPrimary: false, isInternal: false }

beforeEach(() => {
  store.clear()
  vi.mocked(saveSlotBounds).mockClear()
  vi.mocked(clearSlotBounds).mockClear()
})

describe('slot-monitors', () => {
  it('loadSlotAssignments vazio → {}', () => {
    expect(loadSlotAssignments()).toEqual({})
  })

  it('assignScreenToSlot persiste bounds + screenId; findSlotForScreen resolve', () => {
    assignScreenToSlot('2', SCREEN2)
    expect(saveSlotBounds).toHaveBeenCalledWith('PopupWindow2', {
      left: 1920,
      top: 0,
      width: 1920,
      height: 1080,
      screenLeft: 1920,
      screenTop: 0,
      screenWidth: 1920,
      screenHeight: 1080,
    })
    expect(loadSlotAssignments()).toEqual({ '2': SCREEN2.id })
    expect(findSlotForScreen(SCREEN2.id)).toBe('2')
    expect(findSlotForScreen('desconhecido')).toBeNull()
  })

  it('clearScreenAssignment limpa bounds e o mapeamento; inexistente é no-op', () => {
    assignScreenToSlot('1', SCREEN)
    clearScreenAssignment('1')
    expect(clearSlotBounds).toHaveBeenCalledWith('PopupWindow1')
    expect(loadSlotAssignments()).toEqual({})
    // inexistente: clearSlotBounds nem é chamado de novo... é chamado; map sem slot → sem persist extra
    clearScreenAssignment('9')
    expect(clearSlotBounds).toHaveBeenCalledWith('PopupWindow9')
    expect(loadSlotAssignments()).toEqual({})
  })

  it('operator monitor: default null; set/get; vazio → null; dispara evento', () => {
    expect(getOperatorMonitor()).toBeNull()
    const spy = vi.fn()
    window.addEventListener('louvorja-slot-monitors-changed', spy)
    setOperatorMonitor(SCREEN.id)
    expect(getOperatorMonitor()).toBe(SCREEN.id)
    expect(spy).toHaveBeenCalledTimes(1)
    setOperatorMonitor(null)
    expect(getOperatorMonitor()).toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
    window.removeEventListener('louvorja-slot-monitors-changed', spy)
  })

  it('excludeOperatorSlots: sem operador → intocado; com operador filtra slots dele', () => {
    expect(excludeOperatorSlots([1, 2, 3])).toEqual([1, 2, 3])
    setOperatorMonitor(SCREEN.id)
    assignScreenToSlot('2', SCREEN) // slot 2 é o operador
    expect(excludeOperatorSlots([1, 2, 3])).toEqual([1, 3])
  })

  it('pickSlotForScreen: reusa slot do monitor; senão primeiro livre; senão 1', () => {
    expect(pickSlotForScreen(SCREEN.id, 3)).toBe('1') // livre → 1
    assignScreenToSlot('3', SCREEN2)
    expect(pickSlotForScreen(SCREEN2.id, 3)).toBe('3') // já atribuído
    assignScreenToSlot('1', SCREEN)
    expect(pickSlotForScreen(SCREEN.id, 3)).toBe('1') // reusa
    // operador ocupa 1; livre = 2
    expect(pickSlotForScreen(SCREEN.id, 3)).toBe('1')
    // todos ocupados → '1'
    assignScreenToSlot('2', SCREEN)
    assignScreenToSlot('3', SCREEN)
    expect(pickSlotForScreen('novo-monitor', 3)).toBe('1')
  })

  it('loadSlotAssignments com lixo no storage → {}', () => {
    store.set('louvorja-slot-monitors', JSON.stringify('não-objeto'))
    expect(loadSlotAssignments()).toEqual({})
  })
})
