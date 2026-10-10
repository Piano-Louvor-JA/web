/** Upload consentido; originais locais nunca são removidos. */
import { getAuthSession } from '@modules/auth/services/auth-client'
import { createCustomCollection, createCustomMusic, createCustomLyric, listCustomCollections, uploadCustomFile, updateCustomMusic } from '@modules/media/services/custom-catalog'
import { appConfirm } from '@shared/composables/useAppConfirm'
import { sha256Hex, sha256ToUuid } from '@shared/services/content-hash'
import i18n from '@plugins/i18n'
import { listLocalMusics, getLocalAsset } from './local-slja-store'

export interface SljaMigrationResult { uploaded: number; failed: number }
interface LocalMeta { clientUuid?: string; slides?: Array<{ lyric: string; timeMs: number; imageAssetId?: number | null }> }
let running = false

export async function runSljaMigration(locals: Awaited<ReturnType<typeof listLocalMusics>>, opts: { confirm: boolean }): Promise<SljaMigrationResult> {
  const result = { uploaded: 0, failed: 0 }
  const session = getAuthSession()
  if (!opts.confirm || !session || running) return result
  running = true
  const assertSession = () => { if (getAuthSession()?.token !== session.token) throw new Error('SLJA_SESSION_CHANGED') }
  try {
    assertSession()
    const collections = await listCustomCollections()
    assertSession()
    const collectionId = collections.find(c => c.name === 'Importações .slja')?.id ?? (await createCustomCollection('Importações .slja'))?.id
    if (collectionId == null) return { uploaded: 0, failed: locals.length }
    for (const local of locals) {
      try {
        const slides = (local as unknown as LocalMeta).slides
        if (!slides || slides.length !== local.slideCount) throw new Error('SLJA_LOCAL_SLIDES_MISSING')
        const ids = new Set(slides.map(s => s.imageAssetId).filter((id): id is number => id != null))
        if (local.audioAssetId != null) ids.add(local.audioAssetId)
        const assets = new Map<number, Awaited<ReturnType<typeof getLocalAsset>>>()
        for (const id of ids) {
          const asset = await getLocalAsset(id)
          if (!asset) throw new Error('SLJA_LOCAL_ASSET_MISSING')
          assets.set(id, asset)
        }
        const content = JSON.stringify({ name: local.name, slides, assets: [...assets].map(([id,a]) => [id, Array.from(new Uint8Array(a!.bytes))]) })
        const uuid = (local as unknown as LocalMeta).clientUuid ?? sha256ToUuid(await sha256Hex(new TextEncoder().encode(content)))
        const key = `louvorja:slja-migrated:${session.user.id_user}:${uuid}`
        if (localStorage.getItem(key) === '1') continue
        assertSession()
        const created = await createCustomMusic(collectionId, { name: local.name, client_uuid: uuid })
        if (!created) throw new Error('SLJA_CREATE_FAILED')
        // Um registro existente sem comprovante local pode ser upload interrompido.
        // Nunca o declarar completo nem sobrescrevê-lo automaticamente.
        if (created.existed) throw new Error('SLJA_EXISTING_UPLOAD_REQUIRES_VERIFICATION')
        const images = new Map<number, number>()
        for (const id of ids) {
          assertSession()
          const asset = assets.get(id)!
          const audio = id === local.audioAssetId
          const uploaded = await uploadCustomFile(new Uint8Array(asset.bytes), `${local.name}-${id}.${audio ? "mp3" : "png"}`, audio ? 'audio' : 'imagens')
          if (!uploaded) throw new Error('SLJA_UPLOAD_FAILED')
          assertSession()
          if (audio) {
            if (!await updateCustomMusic(created.id, { id_file_audio: uploaded.idFile })) throw new Error('SLJA_AUDIO_LINK_FAILED')
          } else images.set(id, uploaded.idFile)
        }
        let order = 0
        for (const slide of slides) {
          assertSession()
          const seconds = Math.floor(slide.timeMs / 1000)
          const time = [Math.floor(seconds/3600), Math.floor(seconds/60)%60, seconds%60].map(n => String(n).padStart(2,'0')).join(':')
          if (!await createCustomLyric(created.id, { lyric: slide.lyric, time, order: order++, id_file_image: slide.imageAssetId == null ? undefined : images.get(slide.imageAssetId) })) throw new Error('SLJA_LYRIC_FAILED')
        }
        assertSession()
        localStorage.setItem(key, '1')
        result.uploaded++
      } catch { result.failed++ }
    }
    return result
  } catch { return { uploaded: 0, failed: locals.length } }
  finally { running = false }
}

let watching = false
let lastSessionToken: string | null = null
let checking = false
export function startSljaMigrationWatch(): void {
  if (watching) return
  watching = true
  const timer = setInterval(() => { void checkAndOffer() }, 15_000)
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true })
}
async function checkAndOffer(): Promise<void> {
  if (checking) return
  checking = true
  try {
    const token = getAuthSession()?.token ?? null
    if (!token) { lastSessionToken = null; return }
    if (token === lastSessionToken) return
    const locals = await listLocalMusics()
    if (!locals.length || getAuthSession()?.token !== token) return
    lastSessionToken = token
    const t = i18n.global.t
    const approved = await appConfirm({ title: t('liturgy.slja.migrationTitle', { count: locals.length }), message: t('liturgy.slja.migrationMessage'), confirmLabel: t('liturgy.slja.uploadConfirm'), cancelLabel: t('liturgy.slja.uploadCancel') })
    if (approved && getAuthSession()?.token === token) {
      const result = await runSljaMigration(locals, { confirm: true })
      if (result.failed) await appConfirm({ title: t('liturgy.slja.importFailed'), message: t('liturgy.slja.migrationFailed'), confirmLabel: 'OK' })
    }
  } catch { /* Originais locais preservados; próxima sessão pode tentar novamente. */ }
  finally { checking = false }
}
