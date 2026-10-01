import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})

import {
  addLibraryTone,
  listLibraryTones,
  removeLibraryTone,
  renameLibraryTone,
  TONE_LIBRARY_MAX_TOTAL_BYTES,
  TONE_LIBRARY_PER_TONE_MAX_BYTES,
  type CustomTone,
} from '../alert-tone-library'

function makeDataUrl(sizeBytes: number): string {
  // data URL real: prefixo fixo + payload do tamanho desejado
  return 'data:audio/mpeg;base64,' + 'A'.repeat(sizeBytes)
}

describe('biblioteca de sons custom (toneLibrary)', () => {
  beforeEach(() => localStorage.clear())

  it('adiciona, lista e renomeia tom', () => {
    const tone = addLibraryTone('Meu gong', makeDataUrl(100))
    expect(tone.name).toBe('Meu gong')
    expect(listLibraryTones()).toHaveLength(1)

    const renamed = renameLibraryTone(tone.id, 'Gong da igreja')
    expect(renamed?.name).toBe('Gong da igreja')
    expect(listLibraryTones()[0].name).toBe('Gong da igreja')
  })

  it('biblioteca sobrevive ao reload (novo acesso ao storage)', () => {
    const tone = addLibraryTone('Persistente', makeDataUrl(50))
    const loaded = listLibraryTones()
    expect(loaded.find((t) => t.id === tone.id)?.dataUrl).toBe(makeDataUrl(50))
  })

  it('remove tom por id', () => {
    const tone = addLibraryTone('Temporário', makeDataUrl(10))
    expect(removeLibraryTone(tone.id)).toBe(true)
    expect(listLibraryTones()).toHaveLength(0)
    expect(removeLibraryTone(tone.id)).toBe(false)
  })

  it('rejeita tom acima do limite por arquivo', () => {
    expect(() => addLibraryTone('Grande', makeDataUrl(TONE_LIBRARY_PER_TONE_MAX_BYTES + 1))).toThrow(
      'TOO_LARGE',
    )
  })

  it('rejeita quando quota total da biblioteca estoura (sem corromper as existentes)', () => {
    // 3 tons de 2MB = 6MB; o 6º estouraria 10MB — usa 5 tons pra cruzar a quota
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      addLibraryTone(name, makeDataUrl(TONE_LIBRARY_PER_TONE_MAX_BYTES))
    }
    expect(() =>
      addLibraryTone('F', makeDataUrl(TONE_LIBRARY_PER_TONE_MAX_BYTES)),
    ).toThrow('TOO_LARGE')
    expect(listLibraryTones()).toHaveLength(5)
  })

  it('ids são únicos entre tons', () => {
    const a = addLibraryTone('A', makeDataUrl(5))
    const b = addLibraryTone('B', makeDataUrl(5))
    expect(a.id).not.toBe(b.id)
  })

  it('forma do CustomTone é estável (id/name/dataUrl/createdAt)', () => {
    const tone: CustomTone = addLibraryTone('X', makeDataUrl(5))
    expect(Object.keys(tone).sort()).toEqual(['createdAt', 'dataUrl', 'id', 'name'])
    expect(typeof tone.createdAt).toBe('number')
    expect(TONE_LIBRARY_MAX_TOTAL_BYTES).toBeGreaterThan(0)
  })
})
