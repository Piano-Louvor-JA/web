import { readOrFetchCatalogJson } from '@shared/services/remote-catalog'
import { catalogMusicLang } from './album-music-search'

import type { AlbumCategory, AlbumCollection } from '../types/albums'

/** Coletâneas excluídas do catálogo (mesmo critério da biblioteca). */
const EXCLUDED_ALBUM_IDS = new Set([712, 629])

type CatalogCategoryAlbum = {
  id_album: number | string
  name?: string
  subtitle?: string
  url_image?: string | null
}

type CatalogCategory = {
  id_category?: number | string
  name?: string
  albums?: CatalogCategoryAlbum[]
}

type CatalogHymnalEntry = {
  id_music?: number | string
}

function resolveRemoteCoverUrl(urlPath: string): string {
  // API oficial (14/09/2026): URLs absolutas (host Mayco ou R2) usadas na íntegra.
  if (/^https?:\/\//i.test(urlPath)) return urlPath
  const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
  // Dev: proxy same-origin /tunnel-file (VITE_DEV_MEDIA_PROXY) — Image() contra
  // URLs absolutas do túnel Cloudflare falha silenciosamente (fetch 200 ok,
  // img onerror); proxy local renderiza. Prod: URL absoluta da API.
  const proxyTarget = import.meta.env.VITE_DEV_MEDIA_PROXY
  if (proxyTarget) return `/tunnel-file/${cleanPath}`
  const base = import.meta.env.VITE_URL_FILES ?? 'https://files.louvorja.com.br'
  return `${base}/${cleanPath}`
}

/** Covers oficiais dos hinários servidos pela API (/covers/hinario_*.jpeg). */
const HYMNAL_COVER_PATHS: Record<string, string> = {
  hymnal: 'covers/hinario_novo.jpeg',
  hymnal_1996: 'covers/hinario_1996.jpeg',
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  return readOrFetchCatalogJson<T>(filename)
}

async function resolveCoverUrl(urlImage: string | null | undefined): Promise<string | null> {
  if (!urlImage) return null
  return resolveRemoteCoverUrl(urlImage)
}

async function buildHymnalCollections(): Promise<AlbumCollection[]> {
  const collections: AlbumCollection[] = []
  const lang = catalogMusicLang()

  const hymnal = await readOrFetchCatalog<CatalogHymnalEntry[]>(`${lang}_hymnal`)
  if (Array.isArray(hymnal) && hymnal.length > 0) {
    collections.push({
      id: 'hymnal',
      kind: 'hymnal',
      name: 'Hinário Adventista',
      subtitle: '',
      coverUrl: resolveRemoteCoverUrl(HYMNAL_COVER_PATHS.hymnal),
      trackCount: hymnal.length,
      catalogKey: `${lang}_hymnal`,
    })
  }

  const hymnal1996 = await readOrFetchCatalog<CatalogHymnalEntry[]>(`${lang}_hymnal_1996`)
  if (Array.isArray(hymnal1996) && hymnal1996.length > 0) {
    collections.push({
      id: 'hymnal_1996',
      kind: 'hymnal',
      name: 'Hinário Adventista - Edição 1996',
      subtitle: '',
      coverUrl: resolveRemoteCoverUrl(HYMNAL_COVER_PATHS.hymnal_1996),
      trackCount: hymnal1996.length,
      catalogKey: `${lang}_hymnal_1996`,
    })
  }

  return collections
}

/** Catálogo de hinários e coletâneas para navegação no módulo Álbuns. */
export async function loadAlbumCategories(): Promise<AlbumCategory[]> {
  const result: AlbumCategory[] = []

  const hymnals = await buildHymnalCollections()
  if (hymnals.length > 0) {
    result.push({
      id: 'hymnals',
      name: 'Hinários',
      collections: hymnals,
    })
  }

  const categories = await readOrFetchCatalog<CatalogCategory[]>(
    `${catalogMusicLang()}_categories`,
  )
  if (!Array.isArray(categories)) return result

  for (const category of categories) {
    if (!category.albums?.length) continue

    const collections: AlbumCollection[] = []

    for (const album of category.albums) {
      const albumId = Number(album.id_album)
      if (!Number.isFinite(albumId) || EXCLUDED_ALBUM_IDS.has(albumId)) continue

      const name = String(album.name ?? '').trim()
      if (!name) continue

      collections.push({
        id: albumId,
        kind: 'album',
        name,
        subtitle: String(album.subtitle ?? '').trim(),
        coverUrl: await resolveCoverUrl(album.url_image),
        trackCount: null,
        catalogKey: `album_${albumId}`,
      })
    }

    if (collections.length > 0) {
      result.push({
        id: category.id_category ?? category.name ?? collections[0]!.id,
        name: String(category.name ?? '').trim() || 'Coletâneas',
        collections,
      })
    }
  }

  return result
}

export function findCollectionById(
  categories: AlbumCategory[],
  collectionId: string,
): AlbumCollection | null {
  for (const category of categories) {
    for (const collection of category.collections) {
      if (String(collection.id) === collectionId) return collection
    }
  }
  return null
}
