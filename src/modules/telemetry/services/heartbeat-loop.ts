import { watch, type WatchStopHandle } from 'vue'

import { useHomeLocation } from '@modules/home/composables/useHomeLocation'

import { sendHeartbeat } from './heartbeat'

/**
 * Loop do sinal de "online" no web (paridade com o desktop, com uma
 * diferença): envia ao iniciar e a cada 5 min **só com a aba visível** — aba
 * esquecida em segundo plano não é uso real e inflaria o painel. Ao voltar a
 * ficar visível, envia na hora. Também envia logo quando distrito/igreja
 * mudam (debounce). Nunca em navegador automatizado (E2E).
 */

export const HEARTBEAT_INTERVAL_MS = 5 * 60_000
export const LOCATION_DEBOUNCE_MS = 3_000

let intervalId: ReturnType<typeof setInterval> | null = null
let debounceId: ReturnType<typeof setTimeout> | null = null
let stopWatch: WatchStopHandle | null = null
let running = false

function safeSend(): void {
  void sendHeartbeat().catch(() => {})
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function startTimer(): void {
  if (intervalId !== null) return
  safeSend()
  intervalId = setInterval(safeSend, HEARTBEAT_INTERVAL_MS)
}

function stopTimer(): void {
  if (intervalId !== null) clearInterval(intervalId)
  intervalId = null
}

function onVisibilityChange(): void {
  if (isHidden()) stopTimer()
  else startTimer()
}

export function isHeartbeatLoopRunning(): boolean {
  return running
}

export function startHeartbeatLoop(): void {
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) return
  running = true

  if (!isHidden()) startTimer()
  document.addEventListener('visibilitychange', onVisibilityChange)

  const { profile } = useHomeLocation()
  stopWatch = watch(
    () => [profile.value.district, profile.value.church],
    () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(() => {
        debounceId = null
        safeSend()
      }, LOCATION_DEBOUNCE_MS)
    },
  )
}

/** Testes: para tudo e permite iniciar de novo. */
export function stopHeartbeatLoopForTests(): void {
  stopTimer()
  if (debounceId) clearTimeout(debounceId)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopWatch?.()
  debounceId = null
  stopWatch = null
  running = false
}
