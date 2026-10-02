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
import { parseSlja } from '@shared/services/slja'
import {
  createCustomCollection,
  createCustomMusic,
  createCustomLyric,
  listCustomCollections,
  uploadCustomFile,
  updateCustomMusic,
} from '@modules/media/services/custom-catalog'

export interface ImportedSljaMusic {
  /** id REAL da música custom (sem offset). Use toCustomMusicId() no item. */
  musicId: number
  name: string
  collectionId: number
  slides: number
  hasAudio: boolean
  uploadedImages: number
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

  const slides = [...archive.slides].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
