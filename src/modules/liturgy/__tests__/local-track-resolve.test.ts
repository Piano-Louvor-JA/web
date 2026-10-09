import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { importSljaAsCustomMusic } from '../services/import-slja'
import { resolveMediaTrack } from '@modules/media/services/custom-catalog'
import { getAuthSession } from '@modules/auth/services/auth-client'

// resolveMediaTrack REAL com o media-catalog mockado: se a branch local
// estiver errada (custom primeiro), fetch de /musics/899... quebraria.
vi.mock('@modules/media/services/media-catalog', () => ({
  loadMediaTrack: vi.fn(async () => {
    throw new Error('NÃO DEVERIA consultar o catálogo oficial pra id local')
  }),
  resolveMediaTrackDirect: vi.fn(),
}))
vi.mock('@modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(() => null),
}))
vi.mock('@shared/services/slja', () => ({
  parseSlja: vi.fn(async () => ({
    title: 'Missão Para Todos',
    slides: [
      { lyric: 'Missão', timeMs: 0, order: 1 },
      { lyric: 'Para todos', timeMs: 20_000, order: 2 },
    ],
    audio: { name: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) },
    assets: [],
  })),
}))

describe('import local → resolveMediaTrack (900M+ ANTES de custom 1M+)', () => {
  it('música importada local carrega no player (não cai na branch custom)', async () => {
    const imported = await importSljaAsCustomMusic(new File([new Uint8Array([1])], 't.slja'))
    expect(imported.local).toBe(true)
    const track = await resolveMediaTrack(imported.musicId)
    expect(track).not.toBeNull()
    expect(track?.name).toBe('Missão Para Todos')
    expect(track?.audioUrl).toMatch(/^blob:/)
    expect(track?.lyrics).toHaveLength(2)
    expect(track?.lyrics[0]?.time).toBe('00:00')
    expect(track?.lyrics[1]?.time).toBe('00:20')
  })

  it('id local desconhecido → null (sem fetch remoto)', async () => {
    const track = await resolveMediaTrack(900_000_999)
    expect(track).toBeNull()
  })
})
