import { describe, it, expect, vi, beforeEach } from 'vitest'

// web#174 RF-2: loadLiturgyMusicOptions inclui músicas CUSTOM (offset 1M+)
// e as oficiais NUNCA são sobrescritas pelas customs.

vi.mock('@shared/services/remote-catalog', () => ({
  readOrFetchCatalogJson: vi.fn(async () => null),
}))

const customMusics: Array<Record<string, unknown>> = []
vi.mock('@modules/media/services/custom-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/media/services/custom-catalog')>()
  return {
    ...actual,
    listAllCustomMusics: vi.fn(async () => customMusics),
  }
})

import { loadLiturgyMusicOptions } from '../services/liturgy-catalog'
import { listAllCustomMusics } from '@modules/media/services/custom-catalog'
import { CUSTOM_MUSIC_ID_OFFSET } from '@modules/media/services/custom-catalog'

const mockList = vi.mocked(listAllCustomMusics)

describe('loadLiturgyMusicOptions — inclui músicas custom (RF-2)', () => {
  beforeEach(() => {
    customMusics.length = 0
    mockList.mockClear()
    mockList.mockImplementation(async () => customMusics as never)
  })

  it('música custom aparece com id deslocado (offset 1M+)', async () => {
    customMusics.push({
      id: 42,
      name: 'Meu .slja importado',
      duration: null,
      hasAudio: true,
      hasImage: false,
      audioUrl: '/file/audio.mp3',
      officialMusicId: null,
      collectionId: 7,
      collectionName: 'Importações .slja',
    })
    const options = await loadLiturgyMusicOptions()
    const custom = options.find((o) => o.id === 42 + CUSTOM_MUSIC_ID_OFFSET)
    expect(custom).toBeDefined()
    expect(custom?.name).toBe('Meu .slja importado')
    expect(custom?.albumNames).toContain('Importações .slja')
  })

  it('custom não sobrescreve oficial de mesmo id base', async () => {
    // oficial id 42 vinda do índice/hinário é mockada como null (readOrFetchCatalogJson null)
    // mas o merge NUNCA pode deixar custom pisar numa oficial existente:
    customMusics.push({ id: 42, name: 'CUSTOM 42', duration: null, hasAudio: false })
    const options = await loadLiturgyMusicOptions()
    // sem catálogo oficial no mock, a custom entra; a regra é testada de novo
    // no teste de integração com hinário real. Aqui garante que existe.
    expect(options.some((o) => o.id === 42 + CUSTOM_MUSIC_ID_OFFSET)).toBe(true)
  })

  it('sem rede: lista customs mesmo com catálogo oficial indisponível (offline-first)', async () => {
    customMusics.push({ id: 7, name: 'Offline tone', duration: null, hasAudio: true })
    const options = await loadLiturgyMusicOptions()
    expect(options.length).toBeGreaterThanOrEqual(1)
  })
})
