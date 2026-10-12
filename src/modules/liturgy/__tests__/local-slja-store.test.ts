// @vitest-environment node
import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { getLocalMusic, getLocalAssetUrl, putLocalAsset, putLocalMusic } from '../services/local-slja-store'

describe('persistência local de importações', () => {
  it('preserva todas as músicas em importações simultâneas', async () => {
    const names = ['Primeiro', 'Segundo', 'Terceiro']
    const ids = await Promise.all(names.map(name => putLocalMusic({ name, createdAt: 1, audioAssetId: null, slideCount: 1 })))
    expect(new Set(ids).size).toBe(names.length)
    expect(await Promise.all(ids.map(async id => (await getLocalMusic(id))?.name))).toEqual(names)
  })

  it('preserva mídias distintas mesmo quando o relógio e o aleatório coincidem', async () => {
    const { vi } = await import('vitest')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const ids = await Promise.all(['a', 'b', 'c'].map(text => putLocalAsset(new Blob([text]))))
      expect(new Set(ids).size).toBe(3)
      const texts = await Promise.all(ids.map(async id => {
        const url = await getLocalAssetUrl(id)
        expect(url).not.toBeNull()
        const text = await (await fetch(url!)).text()
        URL.revokeObjectURL(url!)
        return text
      }))
      expect(texts).toEqual(['a', 'b', 'c'])
    } finally {
      clock.mockRestore()
      random.mockRestore()
    }
  })
})
