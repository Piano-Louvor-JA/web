/**
 * Migração: shape legado da Personalização da Letra (useLyricCustomization —
 * `projection.settings` com fontSizePercent/lyricAlign/fontColor string/…)
 * → shape canônico StageSettings (lyric*, null = herda), paridade com o app.
 *
 * O legado morava em `projection.settings` (user preference). Este conversor
 * é puro: dado o JSON legado, produz um patch lyric* equivalente para o
 * escopo `global` do Palco (o escopo onde a letra de hinos é renderizada).
 */

export type LegacyLyricCustomization = {
  lyricAlign?: unknown // 'top' | 'center' | 'bottom' (legado: Cima/Centro/Baixo)
  showSongTitle?: unknown
  customTextFormat?: unknown
  customBackground?: unknown
  fontSizePercent?: unknown // 50–200 (%)
  fontColor?: unknown // hex
  fontWeight?: unknown // '400' | '600' | '700' | '900' (string)
  backgroundColor?: unknown
  backgroundImage?: unknown
  backgroundOpacity?: unknown // 0–100
}

function asNum(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asHex(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null
}

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** Tabela de conversão campo-a-campo (doc da task P1): */
export function migrateLegacyLyricCustomization(
  legacy: LegacyLyricCustomization | null | undefined,
): {
  lyricFontSize: number | null
  lyricFontWeight: 400 | 600 | 800 | null
  lyricTextColor: string | null
  lyricUpperCase: boolean
  lyricTextShadow: boolean | null
} {
  if (!legacy || typeof legacy !== 'object') {
    return {
      lyricFontSize: null,
      lyricFontWeight: null,
      lyricTextColor: null,
      lyricUpperCase: false,
      lyricTextShadow: null,
    }
  }
  // customTextFormat=false no legado = a personalização de TEXTO não estava
  // ativa → não migra override nenhum (herda o estilo geral, null).
  const textActive = legacy.customTextFormat === true

  // fontSizePercent 100% = tamanho padrão (96) → override = 96 * pct/100,
  // clamped na faixa do canônico (60–160).
  const pct = asNum(legacy.fontSizePercent, 100)
  const fontSize = textActive ? Math.min(160, Math.max(60, Math.round((96 * pct) / 100))) : null

  // Pesos string legado → número canônico. '900' não existe no canônico
  // (passos 400/600/800) → satura em 800.
  let weight: 400 | 600 | 800 | null = null
  if (textActive) {
    const w = String(legacy.fontWeight ?? '')
    weight = w === '400' ? 400 : w === '600' ? 600 : w === '700' || w === '900' ? 800 : null
  }

  const textColor = textActive ? asHex(legacy.fontColor) : null

  // Sombra: o legado não tinha toggle de sombra → null (herda).
  void asBool

  return {
    lyricFontSize: fontSize,
    lyricFontWeight: weight,
    lyricTextColor: textColor,
    lyricUpperCase: false,
    lyricTextShadow: null,
  }
}
