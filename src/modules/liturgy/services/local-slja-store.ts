/**
 * web#174: store LOCAL (IndexedDB) de músicas .slja importadas sem login.
 *
 * Requisito do Rafael: o import deve funcionar independente de autenticar
 * (uso local/offline-first). A API exige identidade pra escrita (api#82)
 * e pra quota de upload — então, sem sessão, gravamos TUDO local:
 * metadados + áudio/imagem como Blob. Nada se perde com reload.
 *
 * Namespace de ids: 900_000_000 + seq — separado do custom remoto (1M+),
 * resolvido por branch própria em resolveMediaTrack().
 */

const DB_NAME = 'liturgy-slja-local'
const DB_VERSION = 1
const STORE_METAS = 'musics'
const STORE_ASSETS = 'assets'

const LOCAL_MUSIC_ID_BASE = 900_000_000

export interface LocalSljaMusic {
  id: number
  name: string
  createdAt: number
  audioAssetId: number | null
  slideCount: number
}

export interface LocalSljaAsset {
  id: number
  mime: string
  bytes: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_METAS)) {
        db.createObjectStore(STORE_METAS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = fn(tx.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onabort = () => { db.close(); reject(tx.error ?? request.error) }
    tx.onerror = () => { db.close(); reject(tx.error ?? request.error) }
  })
}

/** Aloca e grava na mesma transação para não sobrescrever importações concorrentes. */
async function addWithNextId(storeName: string, value: object, minimum: number): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const cursor = store.openCursor(null, 'prev')
    let id: number
    cursor.onsuccess = () => {
      id = Math.max(Number(cursor.result?.key ?? minimum), minimum) + 1
      store.add({ ...value, id })
    }
    tx.oncomplete = () => { db.close(); resolve(id) }
    tx.onabort = () => { db.close(); reject(tx.error ?? cursor.error) }
    tx.onerror = () => { db.close(); reject(tx.error ?? cursor.error) }
  })
}

export async function putLocalAsset(
  blob: Blob,
): Promise<number> {
  const bytes = await blob.arrayBuffer()
  return addWithNextId(STORE_ASSETS, {
    mime: blob.type || 'application/octet-stream', bytes,
  }, 0)
}

export async function getLocalAssetUrl(assetId: number): Promise<string | null> {
  try {
    const asset = await withStore<LocalSljaAsset | undefined>(
      STORE_ASSETS,
      'readonly',
      (store) => store.get(assetId) as IDBRequest<LocalSljaAsset | undefined>,
    )
    if (!asset) return null
    return URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }))
  } catch {
    return null
  }
}

export async function putLocalMusic(meta: Omit<LocalSljaMusic, 'id'>): Promise<number> {
  return addWithNextId(STORE_METAS, meta, LOCAL_MUSIC_ID_BASE)
}

export async function getLocalMusic(id: number): Promise<LocalSljaMusic | null> {
  try {
    const meta = await withStore<LocalSljaMusic | undefined>(
      STORE_METAS,
      'readonly',
      (store) => store.get(id) as IDBRequest<LocalSljaMusic | undefined>,
    )
    return meta ?? null
  } catch {
    return null
  }
}

export async function listLocalMusics(): Promise<LocalSljaMusic[]> {
  try {
    const all = await withStore<LocalSljaMusic[]>(
      STORE_METAS,
      'readonly',
      (store) => store.getAll() as IDBRequest<LocalSljaMusic[]>,
    )
    return all.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export function isLocalSljaMusicId(musicId: number): boolean {
  return musicId > LOCAL_MUSIC_ID_BASE
}
