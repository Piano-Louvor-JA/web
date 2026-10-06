import { beforeAll, describe, expect, it } from 'vitest'

import { buildSlja, parseSlja } from './slja'

/**
 * Testa o ciclo build → parse do formato .slja (compat Delphi):
 * ZIP com slides.lja (INI), audio/ e imagens/. Sem mock — fflate real.
 */
const enc = (s: string) => new TextEncoder().encode(s)

describe('slja (compatibilidade LouvorJA Delphi)', () => {
  it('gera e le ZIP .slja com slides.lja, áudio e imagens', async () => {
    const archive = await buildSlja({
      title: 'Meu Hino',
      audio: { name: 'meu-hino.mp3', bytes: new Uint8Array([1, 2, 3]) },
      slides: [
        { lyric: 'Meu Hino', type: 'CAPA', timeMs: 0, backgroundColor: '#000000' },
        {
          lyric: 'Primeira linha\nSegunda linha',
          auxiliaryLyric: 'Auxiliar',
          type: 'LETRA',
          timeMs: 83000,
          textColor: '#efb400',
          image: { name: 'bg.jpg', bytes: new Uint8Array([4, 5]) },
        },
      ],
    })

    const parsed = await parseSlja(archive)
    expect(parsed.title).toBe('Meu Hino')
    expect(parsed.audio?.name).toBe('meu-hino.mp3')
    expect(parsed.slides).toHaveLength(2)
    expect(parsed.slides[1]).toMatchObject({
      lyric: 'Primeira linha\nSegunda linha',
      auxiliaryLyric: 'Auxiliar',
      type: 'LETRA',
      timeMs: 83000,
      textColor: '#efb400',
    })
    expect(parsed.slides[1]?.image?.name).toBe('bg.jpg')
  })

  it('lê o formato INI legado com pipe, tempo_hms e paths Windows', async () => {
    const ini = `[Geral]\nslides=2\nurl_musica=audio\\hino.mp3\naudio=1\n\n[Slide:1]\ntipo=CAPA\nletra=Título\n\n[Slide:2]\ntipo=LETRA\nletra=Uma|Duas\nletra_aux=One|Two\ntempo=999999\ntempo_hms=00:01:23\nimagem=imagens\\fundo.jpg\ncor_letra=#FFFFFF\n`
    const archive = await buildSlja({
      title: 'placeholder',
      rawIni: ini,
      audio: { name: 'hino.mp3', bytes: new Uint8Array([1]) },
      assets: [{ path: 'imagens/fundo.jpg', bytes: new Uint8Array([2]) }],
      slides: [],
    })
    const parsed = await parseSlja(archive)

    expect(parsed.slides[1]).toMatchObject({
      lyric: 'Uma\nDuas',
      auxiliaryLyric: 'One\nTwo',
      timeMs: 83000,
      textColor: '#FFFFFF',
    })
    expect(parsed.audio?.name).toBe('hino.mp3')
  })
})

describe('slja casos de borda (cobertura extra)', () => {
  beforeAll(async () => {
    // garante módulo carregado (imports estáticos já resolvem)
  })

  it('backgroundColor com fundo_letra=0 no rawIni → backgroundColor (não boxColor)', async () => {
    const ini = [
      '[Geral]',
      'slides=1',
      'versao=1.0',
      '[Slide:1]',
      'tipo=LETRA',
      'letra=texto',
      'cor_fundo=#123456',
      'fundo_letra=0',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'raw', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides[0].backgroundColor).toBe('#123456')
    expect(parsed.slides[0].boxColor).toBeUndefined()
    expect(parsed.version).toBe('1.0')
  })

  it('boxColor com fundo_letra=1; imagem_posicao e tamanhos parseados', async () => {
    const ini = [
      '[Geral]',
      'slides=1',
      '[Slide:1]',
      'tipo=LETRA',
      'letra=a',
      'cor_fundo=#00FF00',
      'fundo_letra=1',
      'imagem=imagens/x.png',
      'imagem_posicao=5',
      'tamanho_letra=42',
      'tamanho_letra_aux=20',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'box', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    const s = parsed.slides[0]
    expect(s.boxColor).toBe('#00FF00')
    expect(s.backgroundColor).toBeUndefined()
    expect(s.image?.name).toBe('x.png')
    expect(s.imagePosition).toBe(5)
    expect(s.fontSize).toBe(42)
    expect(s.auxiliaryFontSize).toBe(20)
  })

  it('parse: sem slides.lja → throw claro', async () => {
    const { zip } = await import('fflate')
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      zip({ 'outro.txt': enc('x') }, (err, data) =>
        err ? reject(err) : resolve(data.buffer),
      )
    })
    await expect(parseSlja(buffer)).rejects.toThrow(/slides\.lja/)
  })

  it('parse: título fallback vN e Sem título', async () => {
    const mk = async (geral: string[]) => {
      const ini = ['[Geral]', ...geral].join('\r\n')
      const buffer = await buildSlja({ title: 'x', rawIni: ini, slides: [] })
      return parseSlja(buffer)
    }
    expect((await mk(['versao=3.4'])).title).toBe('v3.4')
    expect((await mk(['slides=0'])).title).toBe('Sem título')
  })

  it('parse: tempo em bytes (BASS 176400/s) vira ms aproximado', async () => {
    const ini = [
      '[Geral]',
      'slides=1',
      '[Slide:1]',
      'tipo=LETRA',
      'letra=a',
      'tempo=176400', // 1 segundo
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'bytes', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides[0].timeMs).toBe(1000)
  })

  it('parse: hms MM:SS, hms inválido → 0, e slide faltante tolerado', async () => {
    const ini = [
      '[Geral]',
      'slides=3', // Slide:3 não existe
      '[Slide:1]',
      'tipo=LETRA',
      'letra=a',
      'tempo_hms=02:30',
      '[Slide:2]',
      'tipo=LETRA',
      'letra=b',
      'tempo_hms=invalido',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'hms', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides).toHaveLength(2)
    expect(parsed.slides[0].timeMs).toBe(150000)
    expect(parsed.slides[1].timeMs).toBe(0)
  })

  it('parse: comentários ; e # e chave órfã (sem seção) ignorados', async () => {
    const ini = [
      '; comentário',
      '# outro comentário',
      'chave órfã=1',
      '[Geral]',
      'slides=1',
      '[Slide:1]',
      'tipo=CAPA',
      'letra=ok',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'c', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides).toHaveLength(1)
    expect(parsed.slides[0].lyric).toBe('ok')
    // tipo default por índice quando ausente
    expect(parsed.slides[0].type).toBe('CAPA')
  })

  it('build sem rawIni: default versao 2.0 e audio=0; dedup de assets', async () => {
    const img = enc('png-bytes')
    const buffer = await buildSlja({
      title: 'Mínimo',
      assets: [
        { path: 'a.png', bytes: img },
        { path: 'a.png', bytes: enc('segunda-ignorada') },
      ],
      slides: [{ lyric: 'x', type: 'LETRA', timeMs: 3661000 }],
    })
    const parsed = await parseSlja(buffer)
    expect(parsed.version).toBe('2.0')
    expect(parsed.audio).toBeUndefined()
    expect(parsed.assets).toHaveLength(1)
    // tempo_hms derivado no build (01:01:01) e relido
    expect(parsed.slides[0].timeMs).toBe(3661000)
  })
})
