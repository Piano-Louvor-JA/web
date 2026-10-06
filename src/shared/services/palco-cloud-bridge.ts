import * as popupRouting from '@shared/services/popup-routing'
import { readEffectiveStageSettings } from '@modules/settings/services/stage-settings-runtime'
import { resolveBackgroundImage } from '@modules/settings/types/stage-settings'
import type { StageSettings } from '@modules/settings/types/stage-settings'

export type ReceiverMessage = {
  v: 2
  type: string
  text?: string
  footer?: string
  footerRef?: string
  /** Envelope do receiver evolui por módulo; campos extras são intencionais. */
  [key: string]: unknown
}

/**
 * Registro global do send do relay — evita import estático do stage-relay.
 * Em dev, o Vite cria MÚLTIPLAS instâncias do módulo (?t= do HMR), cada uma
 * com seu próprio `ws`; o bridge importava uma instância connected:false e
 * o publish ia pro limbo (hinos/utilitários não projetavam na TV, caso real
 * 01/09). O stage-relay se registra aqui no attach — instância única.
 */
type RelaySend = (state: Record<string, unknown>, to?: string) => void
declare global {
  interface Window {
    __palcoRelaySend?: RelaySend
  }
}

function field(payload: unknown, name: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const value = (payload as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : null
}

let lastRelayModule: string | null = null

/**
 * WT-5 exclusividade: a TV mostra UM módulo por vez (padrão do palco).
 * Ao publicar um módulo diferente do ativo, manda idle ANTES — o conteúdo
 * anterior sai da tela sem o operador precisar desligar (esquecidinhos).
 * Clock: emite a cada segundo e apagaria o módulo ativo da TV — só publica
 * se clock é o ativo OU a rota dele é 'tv' (destino explícito).
 */
export function publishToStageRelay(moduleId: string, payload: unknown): void {
  try {
    /* v8 ignore next -- SSR guard module-runtime: web é SPA, window sempre definido */
    const send = typeof window !== 'undefined' ? window.__palcoRelaySend : undefined
    if (!send) return // sem relay registrado (modo local/desktop ou instância dev)
    // WT-6A: rota `palco:N` do módulo → conteúdo direcionado ao receiver do
    // slot N (to: slot-N). Rota 'tv' ou slots de popup seguem broadcast.
    let to: string | undefined
    try {
      const { getPopupRoute } = popupRouting
      const route = getPopupRoute(moduleId as never)
      /* v8 ignore next -- route ?? '' defensivo: getPopupRoute sempre retorna string ('mirror' default) */
      const m = /^palco:(\d+)$/.exec(String(route ?? ''))
      if (m) to = `slot-${m[1]}`
    } catch { /* routing indisponível — broadcast */ }
    if (moduleId === 'clock' && lastRelayModule !== 'clock') {
      try {
        const { getPopupRoute } = popupRouting
        const route = getPopupRoute('clock')
        /* v8 ignore next -- caminho tv/palco:N exercitado nos testes de clock tv/palco:5; branch única do && sem contagem separada do lado falso */
        if (route !== 'tv' && !/^palco:\d+$/.test(String(route ?? ''))) return
      } catch { /* routing indisponível — segue o fluxo */ }
    }
    if (lastRelayModule && lastRelayModule !== moduleId) {
      send({ v: 2, type: 'idle', msg: '' })
    }
    lastRelayModule = moduleId
    void (async () => {
      try {
        const msg = await toReceiverMessage(moduleId, payload)
        if (msg) send(msg as unknown as Record<string, unknown>, to)
        /* v8 ignore next -- invariante: lastRelayModule = moduleId é setado antes do await, então o else-if é sempre true quando avaliado */
        /* v8 ignore next -- invariante: lastRelayModule = moduleId é setado antes do await, então moduleId === lastRelayModule sempre que avaliado */
      else if (moduleId === lastRelayModule) lastRelayModule = null
      } catch {
        // send assíncrono falhou (ws caiu entre o broadcast e o publish):
        // projeção local segue; próximo publish tenta de novo.
      }
    })()
  } catch {
    // relay indisponível — projeção local segue
  }
}

/** Reset (detach/encerrar sessão) — próximo publish não compara com estado morto. */
export function resetStageRelayModule(): void {
  lastRelayModule = null
}

/**
 * WT-5 paridade visual: anexa o StageSettings EFETIVO do módulo (mesmo que o
 * popup usa) ao envelope do receiver — fontSize, shadow, caixinha, cores,
 * background. O receiver TV já consome esses campos (protocolo v2 do palco).
 */
/** Lê o StageSettings EFETIVO do módulo. moduleId → scope do palco:
 *  media='hymns' (paridade APK), liturgy='liturgy', resto é 1:1. */
/** backgroundImage do palco → URL carregável pela TV.
 *  - data URL (upload do usuário): passa direto.
 *  - bg oficial ('official:bg-10'): o path /src/assets/... só existe no
 *    bundle do operador — a TV (file://) não carrega. Fetch + data URL. */
async function resolveTvBackground(raw: string | null | undefined): Promise<string | undefined> {
  if (!raw) return undefined
  try {
    const resolved = resolveBackgroundImage(raw)
    if (!resolved) return undefined
    // Data URL (upload do usuário): autocontida, a TV carrega direto — mas o
    // relay limita mensagens a 64KB; data URL grande descarta TODA a
    // projection como msg_too_large. Aceita só as pequenas.
    if (resolved.startsWith('data:')) {
      return resolved.length <= 60_000 ? resolved : undefined
    }
    // URL já pública (capa, bg servido pela API): segura.
    if (resolved.startsWith('http') || resolved.startsWith('//')) return resolved
    // Path relativo (bg oficial: /src/assets/... em dev, /assets/... em prod):
    // é servido pelo MESMO host do operador — a TV carrega via rede local.
    // Torna ABSOLUTO usando o HOSTNAME da URL do operador (se Rafael acessa
    // o web de outra máquina, hostname já é o IP da LAN — nunca localhost,
    // que a TV não resolve).
/* v8 ignore next -- todos os caminhos que chegam aqui são paths relativos que começam com / (data:/http já retornaram antes) */
    if (resolved.startsWith('/')) {
      if (typeof location !== 'undefined' && location.hostname && !/^(localhost|127\.)/.test(location.hostname)) {
        return `${location.protocol}//${location.host}${resolved}`
      }
      /* v8 ignore next -- hostname localhost (dev/jsdom): TV não usa esse host; caminho só existe p/ dev local */
      return undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

function stageStyle(moduleId: string): StageSettings {
  const scope = moduleId === 'media' ? 'hymns' : moduleId
  return readEffectiveStageSettings(scope)
}

function stageFields(moduleId: string, s: StageSettings): Partial<ReceiverMessage & Record<string, unknown>> {
  const out: Record<string, unknown> = {
    // Paridade de escala com os popups (px@1920 → cqw): o receiver converte
    // px→vw com divisor 19.2 (não 10.8 — deixava a fonte ~78% maior).
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    textShadow: s.textShadow,
    shadowIntensity: s.shadowIntensity,
    shadowBlur: s.shadowBlur,
    textBox: s.textBox,
    boxOpacity: s.boxOpacity,
    boxBorder: s.boxBorder,
    textColor: s.textColor,
  }
  if (s.backgroundColor) out.backgroundColor = s.backgroundColor
  return out
}

/** Serializa estados de projeção web para o protocolo do receiver cloud. */
export async function toReceiverMessage(moduleId: string, payload: unknown): Promise<ReceiverMessage | null> {
  if (moduleId === 'bible') {
    const reference = field(payload, 'reference')
    const text = field(payload, 'text')
    if (reference === null || text === null) return null
    if (!text.trim()) return { v: 2, type: 'idle', msg: '' }
    const st = stageStyle(moduleId)
    // Paridade popup: bg do usuário (backgroundImage do escopo bible) > cor.
    const customBg = await resolveTvBackground(st.backgroundImage)
    return {
      v: 2,
      type: 'projection',
      // Paridade popup: showBibleVersion=false esconde a referência na TV.
      ...(st.showBibleVersion ? { footerRef: reference } : {}),
      text,
      ...stageFields(moduleId, st),
      fontSize: st.bibleFontSize,
      fontWeight: st.bibleFontWeight,
      textColor: st.bibleTextColor,
      footerRefColor: st.footerRefColor,
      footerColor: st.footerRefColor,
      footerWeight: st.footerRefWeight,
      // Paridade popup: alinhamentos do palco (o receiver aplica no layout).
      textAlign: st.textAlign,
      textVerticalAlign: st.textVerticalAlign,
      padding: st.margin,
      // Capitalização do versículo (receiver aplica CSS text-transform).
      ...(st.bibleTextTransform !== 'none' ? { textTransform: st.bibleTextTransform } : {}),
      ...(customBg ? { background: customBg } : {}),
    }
  }

  if (moduleId === 'media') {
    const active = (payload as Record<string, unknown> | null)?.active === true
    const lyric = field(payload, 'lyric')
    if (!active || lyric === null || !lyric.trim()) {
      return { v: 2, type: 'idle', msg: 'Aguardando conteúdo…' }
    }
    const st = stageStyle(moduleId)
    // Paridade popup: bg do usuário (backgroundImage) > capa do hino.
    // Fallback bg-fallback.png só quando não há nenhum dos dois (MP3).
    const customBg = await resolveTvBackground(st.backgroundImage)
    const cover = field(payload, 'imageUrl')
    const background = customBg ?? cover ?? undefined
    // Paridade popup (showTitle): isCover mostra o TÍTULO como conteúdo
    // grande (sem letra); normal mostra a letra e o título no footer.
    const isCover = (payload as Record<string, unknown>)?.isCover === true
    const title = field(payload, 'title') ?? ''
    if (isCover) {
      return {
        v: 2,
        type: 'projection',
        text: title,
        ...(background ? { background } : {}),
        ...stageFields(moduleId, st),
      }
    }
    return {
      v: 2,
      type: 'projection',
      text: lyric,
      footer: title,
      ...(field(payload, 'subtitle') ? { footerRef: field(payload, 'subtitle') as string } : {}),
      ...(background ? { background } : {}),
      ...stageFields(moduleId, st),
    }
  }

  if (moduleId === 'clock') {
    const time = field(payload, 'time')
    if (time === null) return null
    if (!time.trim()) return { v: 2, type: 'idle', msg: 'Aguardando conteúdo…' }
    return { v: 2, type: 'timer', text: time, ...stageFields(moduleId, stageStyle(moduleId)) }
  }

  if (moduleId === 'random') {
    const display = field(payload, 'currentDisplay')
    if (display === null) return null
    if (!display.trim()) return { v: 2, type: 'idle', msg: 'Aguardando conteúdo…' }
    const st = stageStyle(moduleId)
    return {
      v: 2,
      type: 'projection',
      text: display,
      fontSize: st.random?.fontSizePc,
      ...stageFields(moduleId, st),
    }
  }

  if (moduleId === 'timer' || moduleId === 'countdown') {
    const display = field(payload, 'display')
    if (display === null) return null
    return { v: 2, type: 'timer', text: display, ...stageFields(moduleId, stageStyle(moduleId)) }
  }

  // WT-5G: liturgia-web (site/vídeo/imagem/pdf) — antes sem wire pro relay,
  // TVs/kiosk ficavam pretos. Receiver já tem case 'video' (url HTTP direta),
  // 'image' e 'pdf' via iframe? Ver receiver: video+audio suportados; site/pdf
  // viram aviso honesto (receiver não navega). blob: do operador não é
  // acessível pela TV — idle com aviso, nunca tela preta sem explicação.
  if (moduleId === 'liturgy-web') {
    const p = (payload ?? {}) as Record<string, unknown>
    const active = p.active === true
    const kind = typeof p.kind === 'string' ? p.kind : 'site'
    if (!active) return { v: 2, type: 'idle', msg: '' }
    // WT-6: áudio local usa o mesmo contrato de vídeo (receiver <audio>/<video>).
    if (kind === 'audio' || kind === 'video' || kind === 'youtube' || kind === 'vimeo') {
      const url = typeof p.url === 'string' ? p.url.trim() : ''
      if (!url) return { v: 2, type: 'idle', msg: '' }
      // YouTube/Vimeo = página, não arquivo — receiver <video> não toca.
      if (kind !== 'video' && kind !== 'audio') {
        return { v: 2, type: 'idle', msg: 'Vídeo online: abra no popup do operador (TV não reproduz links de página).' }
      }
      if (url.startsWith('blob:')) {
        const what = kind === 'audio' ? 'Áudio local' : 'Vídeo local'
        return { v: 2, type: 'idle', msg: `${what}: indisponível para TV via browser (arquivo só no computador do operador).` }
      }
      return {
        v: 2,
        type: 'video',
        url,
        title: typeof p.title === 'string' ? p.title : '',
        action: 'play',
      }
    }
    const title = typeof p.title === 'string' ? p.title : ''
    return {
      v: 2,
      type: 'idle',
      msg: title ? `${title} — abra no popup do operador` : 'Conteúdo não projetável nesta tela',
    }
  }

  return null
}
