/**
 * web#174: converte uma música .slja do store LOCAL (IndexedDB, ids 900M+)
 * num MediaTrackRecord pro player — áudio/capa via blob: URL gerada na
 * leitura, lyrics com o timing do .slja.
 */
import {
  getLocalMusic,
  getLocalAssetUrl,
  type LocalSljaMusic,
} from './local-slja-store'
import type { MediaTrackRecord } from '@modules/media/types/media'

interface LocalSlide {
  lyric: string
  timeMs: number
  imageAssetId?: number | null
}

function formatDurationLabel(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export async function loadLocalSljaTrack(
  musicId: number,
): Promise<MediaTrackRecord | null> {
  const meta = (await getLocalMusic(musicId)) as
    | (LocalSljaMusic & {
        slides?: LocalSlide[]
        coverAssetId?: number | null
      })
    | null
  if (!meta) return null

  const audioUrl = meta.audioAssetId != null
    ? await getLocalAssetUrl(meta.audioAssetId)
    : null

  const coverUrl = meta.coverAssetId != null
    ? await getLocalAssetUrl(meta.coverAssetId)
    : null

  const slides = meta.slides ?? []
  const firstTimeMs = slides[0]?.timeMs ?? 0
  const lastTimeMs = slides[slides.length - 1]?.timeMs ?? 0

  return {
    id: musicId,
    name: meta.name,
    durationLabel:
      formatDurationLabel(slides.length > 1 ? lastTimeMs - firstTimeMs : null) ??
      '',
    audioUrl,
    instrumentalUrl: null,
    coverUrl,
    coverPosition: null,
    albums: [],
    categories: ['Importações .slja (local)'],
    lyrics: slides.map((slide, index) => ({
      order: index + 1,
      lyric: slide.lyric,
      showSlide: true,
      time: formatMsAsTime(slide.timeMs),
      // capa única cobre todos os slides (mesma imagem do .slja);
      // imageUrl por slide seria 1 blob URL por slide — só se um dia
      // o .slja trouxer fundos distintos.
      instrumentalTime: '',
      imageUrl: null,
      imagePosition: null,
      isCover: index === 0,
    })),
  } satisfies MediaTrackRecord
}

function formatMsAsTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
