import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// web#174 RF-1/B1: parser→item. .slja importado vira música custom com
// lyrics (timing preservado) e o chamador recebe id pronto pro offset 1M+.

const mocks = {
  collections: [] as Array<{ id: number; name: string }>,
  createdMusics: [] as Array<{ id: number }>,
  createdLyrics: [] as Array<{ musicId: number; lyric: string; time: string }>,
  uploads: [] as Array<{ name: string; folder: string }>,
  nextMusicId: 500,
}

vi.mock('@modules/media/services/custom-catalog', () => ({
  parseSlja: vi.fn(),
  createCustomCollection: vi.fn(async (name: string) => {
    const existing = mocks.collections.find((c) => c.name === name)
    if (existing) return { id: existing.id }
    const id = mocks.collections.length + 900
    mocks.collections.push({ id, name })
    return { id }
  }),
  createCustomMusic: vi.fn(async (_collectionId: number, _opts: unknown) => {
    const id = ++mocks.nextMusicId
    mocks.createdMusics.push({ id })
    return { id }
  }),
  createCustomLyric: vi.fn(
    async (musicId: number, opts: { lyric: string; time: string }) => {
      mocks.createdLyrics.push({ musicId, lyric: opts.lyric, time: opts.time })
      return { id: mocks.createdLyrics.length }
    },
  ),
  listCustomCollections: vi.fn(async () => mocks.collections),
  uploadCustomFile: vi.fn(
    async (bytes: Uint8Array, name: string, folder: string) => {
      mocks.uploads.push({ name, folder })
      void bytes
      return { url: `https://stg/${folder}/${name}`, idFile: mocks.uploads.length + 100 }
    },
  ),
  updateCustomMusic: vi.fn(async () => ({ id: 1 })),
}))

import { importSljaAsCustomMusic } from '../services/import-slja'
import { getAuthSession } from '@modules/auth/services/auth-client'

vi.mock('@modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(() => ({ token: 't', user: { id_user: 1, email: 'e', displayName: 'd' } })),
}))

const mockGetAuthSession = vi.mocked(getAuthSession)
import { parseSlja } from '@shared/services/slja'

vi.mock('@shared/services/slja', () => ({
  parseSlja: vi.fn(async () => ({
    title: 'Santo Espírito',
    slides: [
      { lyric: 'Santo Espírito', timeMs: 0, order: 1 },
      { lyric: 'Vem habitar', timeMs: 30_000, order: 2 },
      { lyric: '', timeMs: 60_000, order: 3 }, // vazio → ignorado
    ],
    audio: { name: 'audio.mp3', bytes: new Uint8Array([1, 2, 3]) },
    assets: [{ path: 'fundo.jpg', bytes: new Uint8Array([4]) }],
  })),
}))

const mockParse = vi.mocked(parseSlja)

function makeFile(name = 'santo-espirito.slja'): File {
  return new File([new Uint8Array([1])], name)
}

describe('importSljaAsCustomMusic (RF-1/B1)', () => {
  beforeEach(() => {
    mocks.collections.length = 0
    mocks.createdMusics.length = 0
    mocks.createdLyrics.length = 0
    mocks.uploads.length = 0
    mockGetAuthSession.mockClear()
    mockParse.mockClear()
  })

  it('sem login: grava 100% LOCAL (IndexedDB) com id 900M+ e local=true', async () => {
    mockGetAuthSession.mockReturnValueOnce(null)
    const result = await importSljaAsCustomMusic(makeFile())
    expect(result.local).toBe(true)
    expect(result.musicId).toBeGreaterThanOrEqual(900_000_001)
    expect(result.hasAudio).toBe(true)
    expect(result.slides).toBe(2)
    // nenhuma chamada de API de escrita aconteceu (coletânea nem criada)
    expect(mocks.createdMusics).toHaveLength(0)
  })

  it('.slja vira música custom com lyrics preservando o timing', async () => {
    const result = await importSljaAsCustomMusic(makeFile())
    expect(result.musicId).toBeGreaterThan(0)
    expect(result.name).toBe('Santo Espírito')
    expect(mocks.createdLyrics).toHaveLength(2) // slide vazio ignorado
    expect(mocks.createdLyrics[0]).toMatchObject({
      lyric: 'Santo Espírito',
      time: '00:00',
    })
    expect(mocks.createdLyrics[1]?.time).toBe('00:30')
  })

  it('faz upload de áudio e imagens do arquivo', async () => {
    const result = await importSljaAsCustomMusic(makeFile())
    expect(result.hasAudio).toBe(true)
    expect(result.uploadedImages).toBe(1)
    expect(mocks.uploads.map((u) => u.folder)).toContain('audio')
    expect(mocks.uploads.map((u) => u.folder)).toContain('imagens')
  })

  it('título genérico do parser cai pro nome do arquivo', async () => {
    mockParse.mockImplementationOnce(async () => ({
      title: 'v1.2',
      slides: [{ lyric: 'Texto', timeMs: 0, order: 1 }],
      audio: null,
      assets: [],
    }) as never)
    const result = await importSljaAsCustomMusic(makeFile('meu-hino.slja'))
    expect(result.name).toBe('meu-hino')
  })

  it('falha de upload de áudio NÃO aborta o import (segue só texto)', async () => {
    const { uploadCustomFile } = await import('@modules/media/services/custom-catalog')
    vi.mocked(uploadCustomFile).mockImplementationOnce(async () => null)
    const result = await importSljaAsCustomMusic(makeFile())
    expect(result.hasAudio).toBe(false)
    expect(result.slides).toBe(2)
  })
})
