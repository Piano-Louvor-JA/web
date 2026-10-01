import { describe, it, expect, vi } from 'vitest'
import { playAlertTone, ALERT_PRESETS } from '../services/alert-tone'

function makeCtx(lastPlayed: number[] = []) {
  const ctx = {
    currentTime: 100,
    destination: {},
    createOscillator: () => ({
      type: '',
      frequency: { value: 0, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  }
  return { ctx, lastPlayed }
}

describe('alert-tone', () => {
  it('tem presets padrao incluindo escola sabatina', () => {
    expect(Object.keys(ALERT_PRESETS)).toContain('beep')
    expect(Object.keys(ALERT_PRESETS)).toContain('chime')
    expect(Object.keys(ALERT_PRESETS)).toContain('gong')
  })

  it('playAlertTone nao lanca quando AudioContext existe e toca oscilador', () => {
    const played: string[] = []
    const ctx = {
      currentTime: 100,
      destination: {},
      createOscillator: () => {
        const osc = {
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: () => played.push('osc'),
          start: vi.fn(),
          stop: vi.fn(),
        }
        return osc
      },
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    }
    expect(() => playAlertTone('beep', ctx as unknown as AudioContext)).not.toThrow()
    expect(played).toContain('osc')
  })

  it('playAlertTone com audio custom (HTMLAudioElement) usa play()', async () => {
    const played = vi.fn().mockResolvedValue(undefined)
    const audio = { play: played } as unknown as HTMLAudioElement
    await playAlertTone('custom', undefined, audio)
    expect(played).toHaveBeenCalled()
  })

  it('nao lanca se play() rejeita (autoplay bloqueado)', async () => {
    const played = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const audio = { play: played } as unknown as HTMLAudioElement
    await expect(playAlertTone('custom', undefined, audio)).resolves.toBeUndefined()
  })
})
