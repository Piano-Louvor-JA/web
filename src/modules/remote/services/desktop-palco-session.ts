import { ref } from 'vue'

import type { WebRemoteBridge } from './web-remote-bridge'

/**
 * Sessão global do Controle Remoto do web para o desktop (Web Link invertido).
 *
 * Singleton: a view de Controle Remoto conecta e notifica via attach/detach;
 * outros consumidores (ex.: card "Telas" de Settings) leem o estado e mandam
 * queries `palco.*` pela mesma conexão.
 */

export interface PalcoSlotInfo {
  id: string
  label: string
  running: boolean
  clients: number
  httpPort: number
  wsPort: number
}

/** Roku é receiver LAN: conecta ao sender do desktop/APK; o browser só controla o slot. */
export const palcoRokuInstructions = 'Na Roku: Configuração → informe IP, porta WS e token do sender. O browser não abre conexão Roku direta.'

export interface PalcoStatusInfo {
  running: boolean
  clients: number
  url: string | null
  wsUrl: string | null
}

const bridge = ref<WebRemoteBridge | null>(null)
const connected = ref(false)

export function useDesktopPalcoSession() {
  function attach(instance: WebRemoteBridge): void {
    bridge.value = instance
    connected.value = true
  }

  function detach(instance: WebRemoteBridge): void {
    if (bridge.value === instance) {
      bridge.value = null
      connected.value = false
    }
  }

  async function fetchStatus(): Promise<PalcoStatusInfo | null> {
    const b = bridge.value
    if (!b) return null
    const ack = await b.request('palco.status')
    return ack.ok ? ((ack.data as PalcoStatusInfo) ?? null) : null
  }

  async function fetchSlots(): Promise<PalcoSlotInfo[]> {
    const b = bridge.value
    if (!b) return []
    const ack = await b.request('palco.slots')
    return ack.ok ? ((ack.data as PalcoSlotInfo[]) ?? []) : []
  }

  async function turnOn(): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.on')
    return ack.ok
  }

  async function turnOff(): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.off')
    return ack.ok
  }

  async function createTv(label: string): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.slot-add', { label })
    return ack.ok
  }

  async function removeTv(id: string): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.slot-remove', { slotId: id })
    return ack.ok
  }

  async function startTv(id: string): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.slot-start', { slotId: id })
    return ack.ok
  }

  async function stopTv(id: string): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.slot-stop', { slotId: id })
    return ack.ok
  }

  async function idle(): Promise<boolean> {
    const b = bridge.value
    if (!b) return false
    const ack = await b.request('palco.idle')
    return ack.ok
  }

  return { bridge, connected, attach, detach, fetchStatus, fetchSlots, turnOn, turnOff, idle, createTv, removeTv, startTv, stopTv }
}
