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
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

/** Próximo id local disponível (900_000_000+). */
async function nextLocalId(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METAS, 'readonly')
    const request = tx.objectStore(STORE_METAS).openCursor(null, 'prev')
    request.onsuccess = () => {
      const cursor = request.result
      db.close()
      const highest = cursor ? (cursor.key as number) : LOCAL_MUSIC_ID_BASE
      resolve(highest + 1)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

export async function putLocalAsset(
  blob: Blob,
): Promise<number> {
  const bytes = await blob.arrayBuffer()
  const id = Date.now() + Math.floor(Math.random() * 1000)
  await withStore(STORE_ASSETS, 'readwrite', (store) =>
    store.put({ id, mime: blob.type || 'application/octet-stream', bytes } satisfies LocalSljaAsset),
  )
  return id
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
  const id = await nextLocalId()
  await withStore(STORE_METAS, 'readwrite', (store) =>
    store.put({ ...meta, id } satisfies LocalSljaMusic),
  )
  return id
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
