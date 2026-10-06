import { beforeAll, describe, expect, it, vi } from 'vitest'

// fflate com overrides controláveis p/ callbacks de erro
const fflateControl = vi.hoisted(() => ({
  zipError: null as Error | null,
  unzipError: null as Error | null,
}))

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>()
  return {
    ...actual,
    zip: (files: Record<string, Uint8Array>, cb: (e: Error | null, d?: Uint8Array) => void) => {
      if (fflateControl.zipError) {
        cb(fflateControl.zipError)
        return
      }
      actual.zip(files, cb)
    },
    unzip: (data: Uint8Array, cb: (e: Error | null, d?: Record<string, Uint8Array>) => void) => {
      if (fflateControl.unzipError) {
        cb(fflateControl.unzipError)
        return
      }
      actual.unzip(data, cb)
    },
  }
})

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

describe('slja build — todos os campos do slide no INI', () => {
  it('build escreve cor_letra_aux, cor_fundo (box), imagem_posicao, fundo_letra e tamanhos', async () => {
    const buffer = await buildSlja({
      title: 'Completo',
      slides: [
        {
          lyric: 'a',
          auxiliaryLyric: 'b',
          type: 'LETRA',
          timeMs: 1000,
          textColor: '#111111',
          auxiliaryTextColor: '#222222',
          boxColor: '#333333',
          backgroundColor: '#444444',
          image: { name: 'f.png', bytes: new Uint8Array([9]) },
          imagePosition: 7,
          textBox: false,
          fontSize: 33,
          auxiliaryFontSize: 21,
        },
      ],
    })
    const parsed = await parseSlja(buffer)
    const s = parsed.slides[0]
    expect(s.auxiliaryTextColor).toBe('#222222')
    // boxColor E backgroundColor: build escreve cor_fundo 2x (box vence parse por último: backgroundColor)
    //.textBox=false → fundo_letra=0 → backgroundColor no parse
    expect(s.backgroundColor).toBe('#444444')
    expect(s.image?.name).toBe('f.png')
    expect(s.imagePosition).toBe(7)
    expect(s.textBox).toBe(false)
    expect(s.fontSize).toBe(33)
    expect(s.auxiliaryFontSize).toBe(21)
  })

  it('parse: áudio declarado mas arquivo ausente no ZIP → audio undefined', async () => {
    const ini = [
      '[Geral]',
      'slides=1',
      'audio=1',
      'url_musica=audio\falta.mp3',
      '[Slide:1]',
      'tipo=LETRA',
      'letra=x',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'sem audio', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.audio).toBeUndefined()
  })

  it('parse: slide sem seção (gap) é pulado; cor_letra_aux vira auxiliaryTextColor', async () => {
    const ini = [
      '[Geral]',
      'slides=2',
      '[Slide:1]',
      'tipo=LETRA',
      'letra=a',
      'cor_letra_aux=#ABCDEF',
      '[Slide:2]',
      'tipo=LETRA',
      'letra=b',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'aux', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides[0].auxiliaryTextColor).toBe('#ABCDEF')
    expect(parsed.slides).toHaveLength(2)
  })
})

describe('slja — caminhos de erro do zip (fflate err callback)', () => {
  it('buildSlja rejeita quando o zip falha (err callback)', async () => {
    fflateControl.zipError = new Error('zip explodiu')
    try {
      await expect(
        buildSlja({ title: 'x', slides: [{ lyric: 'a', type: 'LETRA', timeMs: 0 }] }),
      ).rejects.toThrow('zip explodiu')
    } finally {
      fflateControl.zipError = null
    }
  })

  it('parseSlja rejeita quando o unzip falha (err callback)', async () => {
    fflateControl.unzipError = new Error('zip corrompido')
    try {
      await expect(parseSlja(new ArrayBuffer(8))).rejects.toThrow('zip corrompido')
    } finally {
      fflateControl.unzipError = null
    }
  })

  it('parse: INI sem [Geral] e sem [Slide:1] → título Sem título, 0 slides; tempo bytes não-numérico → 0', async () => {
    const ini = ['[Outra]', 'chave=1'].join('\r\n')
    const buffer = await buildSlja({ title: 'vazio', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.title).toBe('Sem título')
    expect(parsed.slides).toHaveLength(0)
  })

  it('build: slide sem lyric não escreve linha letra; textBox=true escreve fundo_letra=1', async () => {
    const buffer = await buildSlja({
      title: 'sem letra',
      slides: [{ lyric: '', type: 'LETRA', timeMs: 0, textBox: true }],
    })
    const parsed = await parseSlja(buffer)
    const s = parsed.slides[0]
    expect(s.lyric).toBe('')
    expect(s.textBox).toBe(true)
    // fundo_letra=1 presente; sem linha 'letra=' de conteúdo (lyric vazia)
    expect(parsed.rawIni).toContain('fundo_letra=1')
    expect(parsed.rawIni).not.toContain('\r\nletra=')
    expect(parsed.rawIni).not.toContain('\nletra=')
  })

  it('parse: slide sem tipo herdado por índice (Slide:2 → LETRA)', async () => {
    const ini = ['[Geral]', 'slides=2', '[Slide:1]', 'letra=a', '[Slide:2]', 'letra=b'].join('\r\n')
    const buffer = await buildSlja({ title: 'tipos', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides[0].type).toBe('CAPA')
    expect(parsed.slides[1].type).toBe('LETRA')
  })

  it('parse: tempo bytes inválido (NaN) → 0; slide vazio → lyric vazia', async () => {
    const ini = [
      '[Geral]',
      'slides=2',
      '[Slide:1]',
      'letra=a',
      'tempo=abc',
      '[Slide:2]',
    ].join('\r\n')
    const buffer = await buildSlja({ title: 'nan', rawIni: ini, slides: [] })
    const parsed = await parseSlja(buffer)
    expect(parsed.slides[0].timeMs).toBe(0)
    expect(parsed.slides[1].lyric).toBe('')
  })
})
})
