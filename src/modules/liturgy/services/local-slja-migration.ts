/**
 * web#187 (paridade app 588e7dc): migração pós-login dos .slja gravados
 * local (IndexedDB) quando o usuário ainda não tinha sessão.
 *
 * Regras (mesmas do app):
 * - pergunta UMA vez por sessão (recusou → não pergunta de novo)
 * - falha de rede NÃO marca (tenta no próximo login)
 * - o upload usa client_uuid determinístico do conteúdo → a API dedupeia
 * - nunca bloqueia o fluxo local (fire-and-forget)
 */
import { getAuthSession } from '@modules/auth/services/auth-client'
import {
  createCustomCollection,
  createCustomMusic,
  createCustomLyric,
  listCustomCollections,
  uploadCustomFile,
  updateCustomMusic,
} from '@modules/media/services/custom-catalog'
import { appConfirm } from '@shared/composables/useAppConfirm'
import i18n from '@plugins/i18n'

import { listLocalMusics, getLocalAssetUrl } from './local-slja-store'

const OFFERED_KEY = 'louvorja:sync:slja-migration:offered'
const IMPORT_COLLECTION_NAME = 'Importações .slja'

export interface SljaMigrationResult {
  uploaded: number
  failed: number
}

/** Metadados extras gravados schemaless pelo import local. */
interface LocalSlidesMeta {
  slides?: Array<{ lyric: string; timeMs: number; imageAssetId?: number | null }>
  durationMs?: number
}

async function ensureImportCollectionId(): Promise<number | null> {
  try {
    const collections = await listCustomCollections()
    const existing = collections.find((c) => c.name === IMPORT_COLLECTION_NAME)
    if (existing) return existing.id
  } catch {
    // catálogo indisponível — tenta criar mesmo assim
  }
  const created = await createCustomCollection(IMPORT_COLLECTION_NAME)
  return created?.id ?? null
}

/** Migra os itens locais pra conta. `confirm` = o usuário aprovou subir. */
export async function runSljaMigration(
  locals: Awaited<ReturnType<typeof listLocalMusics>>,
  opts: { confirm: boolean },
): Promise<SljaMigrationResult> {
  const result: SljaMigrationResult = { uploaded: 0, failed: 0 }
  const collectionId = await ensureImportCollectionId()
  if (collectionId == null) {
    return { uploaded: 0, failed: locals.length }
  }

  for (const local of locals) {
    try {
      const meta = local as unknown as LocalSlidesMeta
      const created = await createCustomMusic(collectionId, {
        name: local.name,
        client_uuid: `local-${local.id}-web`,
      })
      if (!created) throw new Error('create failed')
      if (created.existed) {
        result.uploaded += 1
        continue
      }

      // áudio local → upload (via URL do asset no IndexedDB)
      if (local.audioAssetId != null) {
        const url = await getLocalAssetUrl(local.audioAssetId)
        const blob = url ? await (await fetch(url)).blob() : null
        if (blob) {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const up = await uploadCustomFile(bytes, `${local.name}.mp3`, 'audio')
          if (up) await updateCustomMusic(created.id, { id_file_audio: up.idFile })
        }
      }

      // slides → lyrics (batch simples, ordem explícita)
      const slides = meta.slides ?? []
      let order = 0
      for (const slide of slides) {
        if (!slide.lyric.trim()) continue
        const mins = Math.floor(slide.timeMs / 60000)
        const secs = Math.floor((slide.timeMs % 60000) / 1000)
        const hh = Math.floor(mins / 60)
        const time = [
          hh.toString().padStart(2, '0'),
          (mins % 60).toString().padStart(2, '0'),
          secs.toString().padStart(2, '0'),
        ].join(':')
        await createCustomLyric(created.id, { lyric: slide.lyric.trim(), time, order })
        order += 1
      }
      result.uploaded += 1
    } catch {
      result.failed += 1
    }
  }
  return result
}

/**
 * Watcher de login: quando o usuário ganha sessão, oferece UMA vez migrar
 * os .slja locais pra conta. Chamado no boot (App.vue).
 */
let watching = false
let lastSessionToken: string | null = null

export function startSljaMigrationWatch(): void {
  if (watching) return
  watching = true
  const timer = setInterval(() => {
    void checkAndOffer().catch(() => {})
  }, 15_000)
  window.addEventListener('beforeunload', () => clearInterval(timer))
}

async function checkAndOffer(): Promise<void> {
  const session = getAuthSession()
  const token = session?.token ?? null
  if (!token) {
    lastSessionToken = null
    return
  }
  if (token === lastSessionToken) return
  lastSessionToken = token

  if (localStorage.getItem(OFFERED_KEY) === '1') return
  const locals = await listLocalMusics().catch(() => [])
  if (locals.length === 0) return

  localStorage.setItem(OFFERED_KEY, '1')
  const t = i18n.global.t
  const approved = await appConfirm({
    title: t('liturgy.slja.migrationTitle', { count: locals.length }),
    message: t('liturgy.slja.migrationMessage'),
    confirmLabel: t('liturgy.slja.uploadConfirm'),
    cancelLabel: t('liturgy.slja.uploadCancel'),
  }).catch(() => false)

  if (!approved) return // fica local; não pergunta de novo nesta sessão
  await runSljaMigration(locals, { confirm: true }).catch(() => {})
}
