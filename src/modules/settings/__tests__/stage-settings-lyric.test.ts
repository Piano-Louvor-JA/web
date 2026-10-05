import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STAGE_SETTINGS,
  parseStageSettings,
  serializeStageSettings,
} from '../types/stage-settings'
import { migrateLegacyLyricCustomization } from '../services/legacy-lyric-migration'

/**
 * Teste-gêmeo (paridade web ↔ app, task P1): a MESMA tabela de configs JSON
 * (chaves do APK) deve produzir o MESMO estilo final calculado na projeção.
 * O app tem a tabela espelhada em src/modules/settings/types/__tests__/.
 * Estilo final = px/vw efetivo: lyricFontSize ?? fontSize etc.
 */
const CONFIG_TABLE: Record<string, Record<string, unknown>> = {
  herdaTudo: {},
  overrideCompleto: {
    size: 120,
    weight: 800,
    fg: '#FFE9A8',
    tsOn: true,
    tsBlur: 2.2,
    tsInt: 0.8,
    lSize: 150,
    lWeight: 400,
    lFg: '#00C1E6',
    lUpper: true,
    tsOnL: false,
  },
  overridesParciais: {
    size: 96,
    weight: 600,
    lSize: 60,
  },
  forasDeFaixa: {
    size: 999,
    lSize: 999,
    lWeight: 9999,
    lFg: 'vermelho',
  },
}

/** Estilo final da estrofe, calculado como a MediaProjectionView faz. */
function effectiveLyricStyle(raw: Record<string, unknown>) {
  const st = parseStageSettings(raw)
  return {
    fontSizePx: st.lyricFontSize ?? st.fontSize,
    fontWeight: st.lyricFontWeight ?? st.fontWeight,
    color: st.lyricTextColor ?? st.textColor,
    textShadow: st.lyricTextShadow ?? st.textShadow,
    textTransform: st.lyricUpperCase ? 'uppercase' : 'none',
  }
}

describe('teste-gêmeo web↔app: mesma tabela de configs → mesmo estilo', () => {
  it('herdaTudo: estilo = geral (defaults)', () => {
    expect(effectiveLyricStyle(CONFIG_TABLE.herdaTudo)).toEqual({
      fontSizePx: 96,
      fontWeight: 600,
      color: '#FFFFFF',
      textShadow: true,
      textTransform: 'none',
    })
  })

  it('overrideCompleto: todos os lyric* aplicam', () => {
    const style = effectiveLyricStyle(CONFIG_TABLE.overrideCompleto)
    expect(style.fontSizePx).toBe(150)
    expect(style.fontWeight).toBe(400)
    expect(style.color).toBe('#00C1E6')
    expect(style.textShadow).toBe(false)
    expect(style.textTransform).toBe('uppercase')
  })

  it('overridesParciais: lyric sobrepõe só o que existe', () => {
    const style = effectiveLyricStyle(CONFIG_TABLE.overridesParciais)
    expect(style.fontSizePx).toBe(60) // lSize vence
    expect(style.fontWeight).toBe(600) // herda weight
  })

  it('forasDeFaixa: clampa como o app (60–160, pesos válidos, cor hex)', () => {
    const s = parseStageSettings(CONFIG_TABLE.forasDeFaixa)
    expect(s.lyricFontSize).toBe(160)
    expect(s.lyricFontWeight).toBeNull() // peso inválido → herda
    expect(s.lyricTextColor).toBe('#FFFFFF') // cor inválida → fallback do estilo geral
  })

  it('serialize↔parse roundtrip preserva os lyric*', () => {
    const parsed = parseStageSettings(CONFIG_TABLE.overrideCompleto)
    const roundtrip = parseStageSettings(serializeStageSettings(parsed))
    expect(roundtrip.lyricFontSize).toBe(parsed.lyricFontSize)
    expect(roundtrip.lyricFontWeight).toBe(parsed.lyricFontWeight)
    expect(roundtrip.lyricTextColor).toBe(parsed.lyricTextColor)
    expect(roundtrip.lyricUpperCase).toBe(parsed.lyricUpperCase)
    expect(roundtrip.lyricTextShadow).toBe(parsed.lyricTextShadow)
    // Chaves JSON idênticas às do app (lSize/lWeight/lFg/lUpper/tsOnL)
    const ser = serializeStageSettings(parsed)
    expect(ser.lSize).toBe(150)
    expect(ser.lWeight).toBe(400)
    expect(ser.lFg).toBe('#00C1E6')
    expect(ser.lUpper).toBe(true)
    expect(ser.tsOnL).toBe(false)
  })

  it('defaults: lyric* nulos = herda (compat com salvos antigos)', () => {
    expect(DEFAULT_STAGE_SETTINGS.lyricFontSize).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricFontWeight).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricTextColor).toBeNull()
    expect(DEFAULT_STAGE_SETTINGS.lyricUpperCase).toBe(false)
    expect(DEFAULT_STAGE_SETTINGS.lyricTextShadow).toBeNull()
  })
})

describe('migração do shape legado (useLyricCustomization → canônico)', () => {
  it('sem config legada → patch vazio (tudo herda)', () => {
    expect(migrateLegacyLyricCustomization(null)).toEqual({
      lyricFontSize: null,
      lyricFontWeight: null,
      lyricTextColor: null,
      lyricUpperCase: false,
      lyricTextShadow: null,
    })
  })

  it('customTextFormat=false (legado) → nenhum override migrado', () => {
    const m = migrateLegacyLyricCustomization({
      customTextFormat: false,
      fontSizePercent: 150,
      fontColor: '#FF0000',
      fontWeight: '900',
    })
    expect(m.lyricFontSize).toBeNull()
    expect(m.lyricFontWeight).toBeNull()
    expect(m.lyricTextColor).toBeNull()
  })

  it('customTextFormat=true → converte px/peso/cor', () => {
    const m = migrateLegacyLyricCustomization({
      customTextFormat: true,
      fontSizePercent: 150, // 96 * 1.5 = 144
      fontColor: '#ff0000',
      fontWeight: '700',
    })
    expect(m.lyricFontSize).toBe(144)
    expect(m.lyricTextColor).toBe('#FF0000')
    expect(m.lyricFontWeight).toBe(800) // '700' satura no passo 800 do canônico
  })

  it('fontSizePercent fora de faixa → clampa 60–160', () => {
    const m = migrateLegacyLyricCustomization({
      customTextFormat: true,
      fontSizePercent: 200, // 192 → 160
    })
    expect(m.lyricFontSize).toBe(160)
  })

  it('valores inválidos → herda (null), nunca quebra', () => {
    const m = migrateLegacyLyricCustomization({
      customTextFormat: true,
      fontSizePercent: 'grande',
      fontColor: 'azul',
      fontWeight: 500,
    })
    expect(m.lyricFontSize).toBe(96) // pct default 100 → 96
    expect(m.lyricTextColor).toBeNull()
    expect(m.lyricFontWeight).toBeNull()
  })
})
