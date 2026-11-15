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

it('JSON legado corrompido retorna cache vazio', async () => {
  vi.stubGlobal('indexedDB', undefined)
  localStorage.setItem('catalog', '{')
  expect(await readBundleSnapshot('catalog')).toBeNull()
})

it('erro ao abrir IndexedDB mantém leitura legada e rejeita gravação sem apagar dados', async () => {
  const request = {} as IDBOpenDBRequest
  const error = new DOMException('Storage indisponível', 'SecurityError')
  Object.defineProperty(request, 'error', { value: error })
  vi.stubGlobal('indexedDB', { open: () => request })
  localStorage.setItem('catalog', '{"config":"old"}')
  const reading = readBundleSnapshot('catalog')
  request.onerror?.call(request, new Event('error'))
  expect(await reading).toEqual({ config: 'old' })
  const writing = writeBundleSnapshot('catalog', { config: 'new' })
  const rejection = expect(writing).rejects.toBe(error)
  request.onerror?.call(request, new Event('error'))
  await rejection
  expect(localStorage.getItem('catalog')).toBe('{"config":"old"}')
})

it('abertura bloqueada usa legado e fecha conexão liberada depois do bloqueio', async () => {
  const request = {} as IDBOpenDBRequest
  const close = vi.fn()
  Object.defineProperty(request, 'result', { value: { close } })
  vi.stubGlobal('indexedDB', { open: () => request })
  localStorage.setItem('catalog', '{"config":"old"}')
  const reading = readBundleSnapshot('catalog')
  request.onblocked?.call(request, new Event('blocked') as IDBVersionChangeEvent)
  expect(await reading).toEqual({ config: 'old' })
  request.onsuccess?.call(request, new Event('success'))
  expect(close).toHaveBeenCalledOnce()
})

it('falha na limpeza legada não invalida o novo commit persistente', async () => {
  localStorage.setItem('catalog', '{"config":"old"}')
  const cleanup = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage bloqueado') })
  try {
    await writeBundleSnapshot('catalog', { config: 'new' })
    expect(await readBundleSnapshot('catalog')).toEqual({ config: 'new' })
  } finally { cleanup.mockRestore() }
})

it('erro de leitura IndexedDB preserva fallback legado', async () => {
  const { IDBObjectStore: FakeStore } = await import('fake-indexeddb')
  localStorage.setItem('catalog', '{"config":"old"}')
  const request = {} as IDBRequest
  Object.defineProperty(request, 'error', { value: new DOMException('I/O', 'UnknownError') })
  const get = vi.spyOn(FakeStore.prototype, 'get').mockImplementation(() => {
    queueMicrotask(() => request.onerror?.call(request, new Event('error')))
    return request
  })
  try { expect(await readBundleSnapshot('catalog')).toEqual({ config: 'old' }) }
  finally { get.mockRestore() }
})

it('abortar a transação mantém o snapshot anterior', async () => {
  const { IDBDatabase: FakeDatabase } = await import('fake-indexeddb')
  await writeBundleSnapshot('catalog', { config: 'old' })
  const original = FakeDatabase.prototype.transaction
  const transaction = vi.spyOn(FakeDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof original>) {
    const tx = original.apply(this, args)
    if (args[1] === 'readwrite') queueMicrotask(() => tx.abort())
    return tx
  })
  try { await expect(writeBundleSnapshot('catalog', { config: 'new' })).rejects.toThrow('bundle-cache-aborted') }
  finally { transaction.mockRestore() }
  expect(await readBundleSnapshot('catalog')).toEqual({ config: 'old' })
})

it('erro assíncrono de persistência não remove o legado nem altera outro snapshot', async () => {
  const opened = indexedDB.open('piano-bundle-cache', 1)
  opened.onupgradeneeded = () => opened.result.createObjectStore('bundles').createIndex('unique-config', 'config', { unique: true })
  await new Promise<void>((resolve, reject) => { opened.onsuccess = () => resolve(); opened.onerror = () => reject(opened.error) })
  opened.result.close()
  await writeBundleSnapshot('other', { config: 'same' })
  localStorage.setItem('catalog', '{"config":"old"}')
  await expect(writeBundleSnapshot('catalog', { config: 'same' })).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await readBundleSnapshot('catalog')).toEqual({ config: 'old' })
  expect(await readBundleSnapshot('other')).toEqual({ config: 'same' })
})

it('primeiro uso sem IndexedDB nem snapshot legado retorna cache vazio', async () => {
  expect(await readBundleSnapshot('missing')).toBeNull()
  vi.stubGlobal('indexedDB', undefined)
  expect(await readBundleSnapshot('missing')).toBeNull()
})
