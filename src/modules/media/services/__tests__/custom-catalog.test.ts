import { describe, expect, it, vi } from 'vitest'

import { saveSession } from '../../../auth/services/auth-client'
import {
  createCustomCollection,
  loadCustomMusicTrack,
} from '../custom-catalog'

describe('custom-catalog', () => {
  it('carrega música customizada e mapeia estrofes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id_music: 10,
            id_collection: 1,
            name: 'Meu Hino',
            lyric: 'texto completo',
            audio_url: 'audio.mp3',
            image_url: 'img.jpg',
            image_position: '5',
            lyrics: [
              {
                id_lyric: 1,
                lyric: 'estrofe 1',
                aux_lyric: null,
                time: '00:15',
                instrumental_time: '00:00',
                show_slide: 1,
                order: 1,
              },
              {
                id_lyric: 2,
                lyric: 'estrofe 2',
                aux_lyric: 'tradução',
                time: '00:30',
                show_slide: 1,
                order: 2,
              },
            ],
          }),
      }),
    )

    const track = await loadCustomMusicTrack(10)
    expect(track).not.toBeNull()
    expect(track?.name).toBe('Meu Hino')
    expect(track?.audioUrl).toBe('audio.mp3')
    expect(track?.categories).toEqual(['Minhas Coletâneas'])
    expect(track?.lyrics).toHaveLength(2)
    expect(track?.lyrics[0]?.isCover).toBe(true)
    expect(track?.lyrics[0]?.time).toBe('00:15:00')
    expect(track?.lyrics[1]?.auxLyric).toBe('tradução')

    vi.unstubAllGlobals()
  })

  it('retorna null quando API falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    )
    const track = await loadCustomMusicTrack(999)
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })

  it('retorna null quando fetch lança exceção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const track = await loadCustomMusicTrack(1)
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })

  it('cria coletânea via POST quando autenticado', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    })
    saveSession({
      token: 'test-token',
      user: { id_user: 1, email: 'test@louvorja.com', displayName: 'Test' },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id_collection: 5 }),
      }),
    )
    const result = await createCustomCollection('Nova', 'desc')
    expect(result).toEqual({ id: 5 })
    vi.unstubAllGlobals()
  })
})
