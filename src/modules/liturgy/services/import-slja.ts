/**
 * web#174 RF-1: importa um arquivo .slja e o transforma em música CUSTOM
 * (Minhas Coletâneas → coletânea "Importações .slja"), pronta pra virar
 * item de liturgia via `toCustomMusicId(createdMusic.id)`.
 *
 * Reusa EXATAMENTE o pipeline do media editor (MediaEditorView.onImportFile):
 * parse → coletânea → createCustomMusic → upload áudio/imagens → lyrics.
 * Falha de upload de mídia NÃO aborta o import (segue só com texto) —
 * mesma semântica do media editor.
 */
import { parseSlja, type SljaArchive } from '@shared/services/slja'
import {
  createCustomCollection,
  createCustomMusic,
  createCustomLyric,
  listCustomCollections,
  uploadCustomFile,
  updateCustomMusic,
} from '@modules/media/services/custom-catalog'
import { getAuthSession } from '@modules/auth/services/auth-client'
import {
  putLocalAsset,
  putLocalMusic,
  type LocalSljaMusic,
} from './local-slja-store'

export interface ImportedSljaMusic {
  /** id REAL da música custom (sem offset) OU id local (900M+). */
  musicId: number
  name: string
  collectionId: number
  slides: number
  hasAudio: boolean
  uploadedImages: number
  /** Duração estimada (ms): último tempo_hms + margem. 0 = desconhecida. */
  durationMs: number
  /** true = gravado só no IndexedDB local (sem login); sync pra conta é v2. */
  local: boolean
}

const IMPORT_COLLECTION_NAME = 'Importações .slja'

async function ensureImportCollectionId(): Promise<number | null> {
  // Reaproveita a primeira "Importações .slja" existente (mesma regra do
  // media editor); só cria se ainda não houver nenhuma.
  try {
    const collections = await listCustomCollections()
    const existing = collections.find((c) => c.name === IMPORT_COLLECTION_NAME)
    if (existing) return existing.id
  } catch {
    // API indisponível — tenta criar mesmo assim
  }
  const created = await createCustomCollection(IMPORT_COLLECTION_NAME)
  return created?.id ?? null
}

export async function importSljaAsCustomMusic(
  file: File,
): Promise<ImportedSljaMusic> {
  const buffer = await file.arrayBuffer()
  const archive = await parseSlja(buffer)

  const genericTitle =
    /^v[\d.]+$/.test(archive.title?.trim() ?? '') || !archive.title?.trim()
  const name = genericTitle
    ? file.name.replace(/\.slja$/i, '')
    : archive.title.trim()

  const slides = [...archive.slides]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((slide) => slide.lyric.trim().length > 0)

  // ── Sem sessão: grava 100% LOCAL (IndexedDB) — uso local/offline-first. ──
  // A API exige identidade pra escrita e quota (api#82), então sem login
  // nada sobe; o import continua funcionando e nada se perde com reload.
  if (!getAuthSession()) {
    return importSljaLocal({ name, archive, slides })
  }

  const collectionId = await ensureImportCollectionId()
  if (collectionId == null) {
    throw new Error('SLJA_IMPORT_COLLECTION_FAILED')
  }

  const createdMusic = await createCustomMusic(collectionId, { name })
  if (!createdMusic) {
    throw new Error('SLJA_IMPORT_MUSIC_FAILED')
  }

  let hasAudio = false
  if (archive.audio) {
    const uploadedAudio = await uploadCustomFile(
      archive.audio.bytes,
      archive.audio.name,
      'audio',
    )
    if (uploadedAudio) {
      await updateCustomMusic(createdMusic.id, { id_file_audio: uploadedAudio.idFile })
      hasAudio = true
    }
  }

  let uploadedImages = 0
  const uploadedAssets: Array<{ path: string; url: string; idFile: number }> = []
  if (archive.assets?.length) {
    for (const asset of archive.assets) {
      const up = await uploadCustomFile(asset.bytes, asset.path, 'imagens')
      if (up) {
        uploadedAssets.push({ path: asset.path, url: up.url, idFile: up.idFile })
        uploadedImages += 1
      }
    }
  }

  const imageIdByUrl = new Map(uploadedAssets.map((a) => [a.url, a.idFile]))

  let slideCount = 0
  for (const slide of slides) {
    const text = slide.lyric.trim()
    if (!text) continue
    let imageUrl = ''
    if (slide.image?.name && uploadedAssets.length) {
      const match = uploadedAssets.find(
        (a) =>
          slide.image!.name.toLowerCase().includes(a.path.toLowerCase()) ||
          a.path.toLowerCase().includes(slide.image!.name.toLowerCase()),
      )
      if (match) imageUrl = match.url
    }
    await createCustomLyric(createdMusic.id, {
      lyric: text,
      time: formatMsAsTime(slide.timeMs),
      id_file_image: imageIdByUrl.get(imageUrl),
    })
    slideCount += 1
  }

  return {
    musicId: createdMusic.id,
    name,
    collectionId,
    slides: slideCount,
    hasAudio,
    uploadedImages,
    local: false,
  }
}



/**
 * Import 100% local (sem login): áudio/imagem como Blob no IndexedDB,
 * música com id 900M+ (namespace local). Nada sobe pra API — sync é v2.
 */
async function importSljaLocal({
  name,
  archive,
  slides,
}: {
  name: string
  archive: SljaArchive
  slides: SljaArchive['slides']
}): Promise<ImportedSljaMusic> {
  let audioAssetId: number | null = null
  if (archive.audio) {
    audioAssetId = await putLocalAsset(
      new Blob([archive.audio.bytes as BlobPart], { type: 'audio/mpeg' }),
    )
  }

  // Imagem de fundo (compartilhada entre slides): primeiro asset.
  let coverAssetId: number | null = null
  if (archive.assets?.length) {
    coverAssetId = await putLocalAsset(
      new Blob([archive.assets[0].bytes as BlobPart], { type: 'image/png' }),
    )
  }

  // web#174: duração estimada p/ o campo "Duração" do item — último
  // tempo_hms + margem de 30s (o MP3 real pode esticar além do último slide).
  const lastTimeMs = slides.reduce((max, s) => Math.max(max, s.timeMs), 0)
  const durationMs = lastTimeMs > 0 ? lastTimeMs + 30_000 : 0

  const id = await putLocalMusic({
    name,
    createdAt: Date.now(),
    audioAssetId,
    slideCount: slides.length,
    // metadados extras vão junto no objeto (IndexedDB é schemaless)
    ...(coverAssetId != null ? { coverAssetId } : {}),
    ...(durationMs > 0 ? { durationMs } : {}),
    // slides completos p/ o player local reconstruir a letra com timing
    slides: slides.map((slide) => ({
      lyric: slide.lyric.trim(),
      timeMs: slide.timeMs,
      imageAssetId: coverAssetId,
    })),
  } as Parameters<typeof putLocalMusic>[0] & Record<string, unknown>)

  return {
    musicId: id,
    name,
    collectionId: 0,
    slides: slides.length,
    hasAudio: audioAssetId != null,
    uploadedImages: coverAssetId != null ? 1 : 0,
    durationMs,
    local: true,
  }
}

// ── helpers locais (evitam import circular com helpers de view) ──────────

function formatMsAsTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// matching slide→asset igual ao media editor (contains bidirecional, lowercase)
