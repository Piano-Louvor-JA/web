import { describe, expect, it } from 'vitest'
import { toReceiverMessage } from '../palco-cloud-bridge'

// WT-5 paridade visual: toda projection carrega os stage fields do módulo
// (fontSize/shadow/caixinha/cores/background) — os asserts usam
// expect.objectContaining nos campos de conteúdo.
describe('toReceiverMessage', () => {
  it('serializa bíblia no envelope de projeção v2 com stage fields', async () => {
    const msg = await toReceiverMessage('bible', { reference: 'João 3:16', text: 'Porque Deus amou...' })
    expect(msg).toMatchObject({
      v: 2,
      type: 'projection',
      footerRef: 'João 3:16',
      text: 'Porque Deus amou...',
    })
    // stage fields presentes (paridade visual com o popup)
    expect(msg).toHaveProperty('fontSize')
    expect(msg).toHaveProperty('textShadow')
    expect(msg).toHaveProperty('textBox')
    expect(msg).not.toHaveProperty('footerRefColor')
  })

  it('serializa hino ativo: letra no text, título no footer (paridade receiver TV)', async () => {
    const msg = await toReceiverMessage('media', { active: true, title: 'Santo, Santo, Santo', lyric: 'Senhor Deus dos exércitos', subtitle: '', isCover: false })
    expect(msg).toMatchObject({
      v: 2,
      type: 'projection',
      text: 'Senhor Deus dos exércitos',
      footer: 'Santo, Santo, Santo',
    })
    expect(msg).toHaveProperty('fontSize')
    // isCover: título vira o CONTEÚDO (grande), sem letra — paridade popup
    const cover = await toReceiverMessage('media', { active: true, title: 'Santo, Santo, Santo', lyric: 'x', isCover: true })
    expect(cover).toMatchObject({ v: 2, type: 'projection', text: 'Santo, Santo, Santo' })
    expect(cover).not.toHaveProperty('footer')
  })

  it('mídia inativa/sem letra → idle no receiver', async () => {
    expect((await toReceiverMessage('media', { active: false, title: 'X', lyric: 'Y' }))?.type).toBe('idle')
    expect((await toReceiverMessage('media', { active: true, title: 'X', lyric: '  ' }))?.type).toBe('idle')
  })

  it('serializa relógio como timer', async () => {
    expect(await toReceiverMessage('clock', { time: '10:30' })).toMatchObject({ v: 2, type: 'timer', text: '10:30' })
  })

  it.each(['timer', 'countdown'])('serializa %s como timer', async (moduleId) => {
    expect(await toReceiverMessage(moduleId, { display: '05:00' })).toMatchObject({ v: 2, type: 'timer', text: '05:00' })
  })

  it('retorna null para módulo desconhecido', async () => {
    expect(await toReceiverMessage('desconhecido', { display: '7' })).toBeNull()
  })
})

// ===== WT-6: áudio da liturgia via relay =====
describe('toReceiverMessage — liturgia-web audio', () => {
  it('áudio local com URL acessível → type video (receiver <video> toca MP3) com action play', async () => {
    const msg = await toReceiverMessage('liturgy-web', { active: true, kind: 'audio', url: 'https://cdn.exemplo.com/hino.mp3', title: 'Especial' })
    expect(msg).toMatchObject({ v: 2, type: 'video', url: 'https://cdn.exemplo.com/hino.mp3', action: 'play', title: 'Especial' })
  })

  it('áudio blob: → idle com aviso honesto (arquivo só no computador do operador)', async () => {
    const msg = await toReceiverMessage('liturgy-web', { active: true, kind: 'audio', url: 'blob:xyz', title: 'Especial' })
    expect(msg).toMatchObject({ type: 'idle' })
    expect((msg as { msg?: string }).msg).toContain('Áudio local')
  })

  it('áudio inativo → idle limpo', async () => {
    expect(await toReceiverMessage('liturgy-web', { active: false, kind: 'audio', url: 'https://x/y.mp3' })).toMatchObject({ type: 'idle' })
  })
})

// ===== Aceite WT-5f: personalização do palco na BÍBLIA via relay =====
// Condições: (1) bg idêntico ao configurado, (2) font-size idêntico,
// (3) toda personalização aplicada quando houver, (4) sem personalização
// nada extra é aplicado (defaults = o que o popup mostra).
describe('toReceiverMessage — bíblia: aceite de personalização do palco', () => {
  it('C2: bibleFontSize/bibleFontWeight/bibleTextColor do escopo bible chegam na TV (não os do hino)', async () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { bg: '#112233', size: 96, bSize: 110, bWeight: 700, bFg: '#FFE9A8' },
    }))
    const msg = await toReceiverMessage('bible', { reference: 'Sl 23:1', text: 'O Senhor é o meu pastor' })
    expect(msg).toMatchObject({ fontSize: 110, fontWeight: 700, textColor: '#FFE9A8' })
  })

  it('C1: bg oficial configurado no escopo bible chega na TV como URL ABSOLUTA carregável', async () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { bg: '#0A0E1A', bgImg: 'official:bg-01' },
    }))
    // hostname LAN (TV não resolve localhost)
    Object.defineProperty(window, 'location', { value: { ...window.location, hostname: '192.168.1.10', host: '192.168.1.10:5173', protocol: 'http:' }, writable: true })
    const msg = await toReceiverMessage('bible', { reference: 'Sl 23:1', text: 'O Senhor é o meu pastor' })
    expect((msg as Record<string, unknown>)?.background).toMatch(/^https?:\/\/192\.168\.1\.10/)
  })

  it('C1: operador em localhost → bg é omitido (TV não alcança localhost)', async () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { bg: '#0A0E1A', bgImg: 'official:bg-01' },
    }))
    Object.defineProperty(window, 'location', { value: { ...window.location, hostname: 'localhost', host: 'localhost:5173', protocol: 'http:' }, writable: true })
    const msg = await toReceiverMessage('bible', { reference: 'Sl 23:1', text: 'x' })
    expect(msg).not.toHaveProperty('background')
  })

  it('C1: data URL (upload do usuário) do escopo bible passa direto', async () => {
    Object.defineProperty(window, 'location', { value: { ...window.location, hostname: '192.168.1.10', host: '192.168.1.10:5173', protocol: 'http:' }, writable: true })
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { bgImg: dataUrl },
    }))
    const msg = await toReceiverMessage('bible', { reference: 'Sl 23:1', text: 'x' })
    expect((msg as Record<string, unknown>)?.background).toBe(dataUrl)
  })

  it('C1: sem bg configurado no escopo bible, NÃO vai background (cor pinta a TV)', async () => {
    localStorage.removeItem('user_data')
    const msg = await toReceiverMessage('bible', { reference: 'Sl 23:1', text: 'x' })
    expect(msg).not.toHaveProperty('background')
    expect(msg).not.toHaveProperty('backgroundColor') // fundo não definido deixa a imagem/receiver controlar
  })

  it('C3: alinhamentos + footerRef (cor/peso) do escopo bible chegam na TV', async () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { tAlign: 'right', tVAlign: 'bottom', refColor: '#00C1E6', refWeight: 400 },
    }))
    const msg = await toReceiverMessage('bible', { reference: 'Jo 3:16', text: 'x' })
    expect(msg).toMatchObject({ textAlign: 'right', textVerticalAlign: 'bottom', footerRefColor: '#00C1E6', footerWeight: 400 })
  })

  it('C3: showBibleVersion=false → footerRef sai da TV (popup também esconde)', async () => {
    localStorage.setItem('user_data', JSON.stringify({
      'stage.settings.bible': { showVer: false },
    }))
    const msg = await toReceiverMessage('bible', { reference: 'Jo 3:16', text: 'x' })
    expect(msg).not.toHaveProperty('footerRef')
  })

  it('C4: sem personalização nenhuma, mensagem carrega exatamente os DEFAULTS do palco', async () => {
    localStorage.removeItem('user_data')
    const msg = await toReceiverMessage('bible', { reference: 'Gn 1:1', text: 'No princípio' })
    expect(msg).toMatchObject({
      fontSize: 84, // DEFAULT_STAGE_SETTINGS.bibleFontSize
      fontWeight: 500,
      textShadow: true,
      textBox: true,
      textAlign: 'center',
      textVerticalAlign: 'middle',
    })
    expect(msg).not.toHaveProperty('textColor')
    expect(msg).not.toHaveProperty('backgroundColor')
  })
})
