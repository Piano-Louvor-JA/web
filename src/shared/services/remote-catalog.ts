import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'
import { fetchWithApiFallback } from '@shared/services/api-fallback'
import { readCachedBundleJson } from '@shared/services/bundle-sync'

function sessionCacheKey(filename: string): string {
  return `${BROWSER_STORAGE_KEYS.catalogSessionPrefix}${filename}`
}

export function resolveDatabaseUrl(relativePath: string): string {
  const base = import.meta.env.VITE_URL_DATABASE ?? 'https://api.pianolouvorja.com.br/json_db'
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${base}${path}`
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchRemoteCatalogJson<T = unknown>(
  file: string,
  retries = 5,
  delayMs = 1000,
): Promise<T> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '') // NOSONAR
  const token = import.meta.env.VITE_API_TOKEN

  try {
    const response = await fetch(`${resolveDatabaseUrl(`/${file}`)}?${date}`, { // NOSONAR
      headers: token ? { 'Api-Token': token } : undefined,
    })

    if (response.status === 429 && retries > 0) {
      await delay(delayMs)
      return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
    }

    if (!response.ok) {
      if (retries > 0 && response.status >= 500) {
        await delay(delayMs)
        return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
      }
      throw new Error(`Servidor retornou erro ${response.status}`)
    }

    const data = (await response.json()) as T
    setBrowserItem(sessionCacheKey(file), data, 'session')
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      retries > 0 &&
      (message.includes('Failed to fetch') || message.includes('NetworkError'))
    ) {
      await delay(delayMs)
      return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
    }

    const { data } = await fetchWithApiFallback<T>('database', file, { retries, delayMs })
    setBrowserItem(sessionCacheKey(file), data, 'session')
    return data
  }
}

/** Lê cache bundle persistente, sessão, então legado lazy individual. */
export async function readOrFetchCatalogJson<T = unknown>(
  filename: string,
): Promise<T | null> {
  const bundleKind = filename.startsWith('bible_') || filename.startsWith('pt_bible_')
    ? 'bible'
    : 'catalog'
  const bundled = readCachedBundleJson<T>(bundleKind, filename)
  if (bundled != null) return bundled

  const cached = getBrowserItem<T>(sessionCacheKey(filename), null, 'session')
  if (cached != null) return cached

  try {
    return await fetchRemoteCatalogJson<T>(filename)
  } catch (error) {
    console.warn(`[catalog] falha ao obter ${filename}`, error)
    return null
  }
}
