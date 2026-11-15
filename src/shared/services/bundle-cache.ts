/** Snapshots grandes usam uma transação IndexedDB por artifact. */
const DATABASE = 'piano-bundle-cache'
const STORE = 'bundles'
type Snapshot = Record<string, string>

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('bundle-cache-blocked'))
    }
  })
}

export async function readBundleSnapshot(key: string): Promise<Snapshot | null> {
  if (typeof indexedDB !== 'undefined') {
    let database: IDBDatabase | undefined
    try {
      database = await openDatabase()
      const value = await new Promise<Snapshot | undefined>((resolve, reject) => {
        const request = database!.transaction(STORE).objectStore(STORE).get(key)
        request.onsuccess = () => resolve(request.result as Snapshot | undefined)
        request.onerror = () => reject(request.error)
      })
      if (value) return value
    } catch { /* cache legado permanece disponível se IndexedDB não puder ser lido */ }
    finally { database?.close() }
  }
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as Snapshot | null }
  catch { return null }
}

export async function writeBundleSnapshot(key: string, snapshot: Snapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    localStorage.setItem(key, JSON.stringify(snapshot))
    return
  }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      // Erros de requests abortam a transação; onabort fornece a causa definitiva.
      transaction.onabort = () => reject(transaction.error ?? new Error('bundle-cache-aborted'))
      transaction.objectStore(STORE).put(snapshot, key)
    })
    // Remove apenas o snapshot legado depois de confirmar o commit da transação.
    try { localStorage.removeItem(key) } catch { /* limpeza não invalida o commit */ }
  } finally { database.close() }
}
