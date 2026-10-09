import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAlertQueue, enqueueAlert, pendingAlertCount, playAlertTone, stopAllAlerts } from '../services/alert-tone'

afterEach(() => { clearAlertQueue(); stopAllAlerts() })

describe('fila de alertas', () => {
  it('aguarda o áudio terminar antes do próximo alerta', async () => {
    const audio = Object.assign(new EventTarget(), { play: vi.fn(async () => {}), pause: vi.fn(), currentTime: 0, volume: 1 })
    const next = vi.fn(async () => {})
    enqueueAlert(() => playAlertTone('custom', undefined, audio as unknown as HTMLAudioElement))
    enqueueAlert(next)
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce())
    expect(next).not.toHaveBeenCalled()
    audio.dispatchEvent(new Event('ended'))
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
  })

  it('limpar cancela alertas pendentes sem contador negativo', async () => {
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const first = vi.fn(() => gate)
    const next = vi.fn(async () => {})
    enqueueAlert(first)
    enqueueAlert(next)
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce())
    clearAlertQueue()
    finish()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(next).not.toHaveBeenCalled()
    expect(pendingAlertCount()).toBe(0)
  })

  it('parar áudio libera uma reprodução aguardando ended', async () => {
    const audio = Object.assign(new EventTarget(), { play: vi.fn(async () => {}), pause: vi.fn(), currentTime: 0, volume: 1 })
    const finished = vi.fn()
    const playback = playAlertTone('custom', undefined, audio as unknown as HTMLAudioElement).then(finished)
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce())
    expect(finished).not.toHaveBeenCalled()
    stopAllAlerts()
    await playback
    expect(finished).toHaveBeenCalledOnce()
    expect(audio.pause).toHaveBeenCalledOnce()
  })
})
