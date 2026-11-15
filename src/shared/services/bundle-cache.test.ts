import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { readBundleSnapshot, writeBundleSnapshot } from './bundle-cache'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

it('persiste e recupera snapshot maior que a quota de localStorage sem gravá-lo ali', async () => {
  const snapshot = { bible_10_100_1: JSON.stringify({ '1': 'a'.repeat(8 * 1024 * 1024) }) }
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  try {
    await writeBundleSnapshot('piano:bundle:bible', snapshot)
    expect(await readBundleSnapshot('piano:bundle:bible')).toEqual(snapshot)
    expect(write).not.toHaveBeenCalled()
  } finally { write.mockRestore() }
})

it('gravação inválida não substitui o snapshot anterior', async () => {
  await writeBundleSnapshot('catalog', { config: '{"version":1}' })
  await expect(writeBundleSnapshot('catalog', { bad: (() => {}) as unknown as string })).rejects.toThrow()
  expect(await readBundleSnapshot('catalog')).toEqual({ config: '{"version":1}' })
})

it('lê snapshot legado e só o remove depois de salvar o novo em IndexedDB', async () => {
  localStorage.setItem('catalog', '{"config":"old"}')
  expect(await readBundleSnapshot('catalog')).toEqual({ config: 'old' })
  await writeBundleSnapshot('catalog', { config: 'new' })
  expect(localStorage.getItem('catalog')).toBeNull()
  expect(await readBundleSnapshot('catalog')).toEqual({ config: 'new' })
})

it('sem IndexedDB preserva o fallback de cache legado', async () => {
  vi.stubGlobal('indexedDB', undefined)
  await writeBundleSnapshot('catalog', { config: 'fallback' })
  expect(await readBundleSnapshot('catalog')).toEqual({ config: 'fallback' })
})
