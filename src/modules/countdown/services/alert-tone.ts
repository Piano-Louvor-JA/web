/**
 * Alertas sonoros para countdown/cronômetro.
 * Presets sintéticos (WebAudio): beep, chime, gong — sem asset externo.
 * Presets oficiais do LouvorJA Desktop (assets MP3 embutidos): abertura_es, 5min_es, 1min_es.
 * 'custom' = HTMLAudioElement fornecido pelo caller (upload do usuário via API).
 */
export const ALERT_PRESETS = {
  // Sintéticos (WebAudio)
  beep: { freq: 880, duration: 0.15, type: 'sine' as OscillatorType },
  chime: { freq: [1318.51, 1046.5], duration: 0.12, type: 'sine' as OscillatorType },
  gong: { freq: 220, duration: 1.0, type: 'sine' as OscillatorType },
  // Oficiais LouvorJA (arquivos MP3) — caminhos relativos ao build Vite
  abertura_es: { url: '/assets/alerts/abertura_escsb.mp3' },
  '5min_es': { url: '/assets/alerts/5minutos_escsb.mp3' },
  '1min_es': { url: '/assets/alerts/1minuto_escsb.mp3' },
} as const

export type AlertPresetKey = keyof typeof ALERT_PRESETS

/** Duração aproximada de cada preset de áudio, em ms.
 *  Sintéticos: duration (s). MP3 oficiais: metadados pré-medidos.
 *  Custom: estimativa conservadora (usuário pode carregar áudio longo). */
export function getPresetDurationMs(preset: AlertPresetKey | 'none' | 'custom', customAudio?: HTMLAudioElement | null): number {
  if (preset === 'none') return 0
  if (preset === 'custom') return customAudio?.duration ? customAudio.duration * 1000 : 60_000
  const def = ALERT_PRESETS[preset]
  if ('duration' in def) return def.duration * 1000
  // MP3s oficiais medidos com ffprobe
  return preset === 'abertura_es' ? 30_400 : preset === '5min_es' ? 18_000 : 65_500
}

// Cache de AudioContext e elementos de áudio pré-carregados
let audioCtx: AudioContext | null = null
const audioCache = new Map<string, HTMLAudioElement>()

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return audioCtx
}

async function preloadAudio(url: string): Promise<HTMLAudioElement> {
  if (audioCache.has(url)) return audioCache.get(url)!
  const audio = new Audio(url)
  audio.preload = 'auto'
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener('canplaythrough', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
  })
  audioCache.set(url, audio)
  return audio
}

export async function playAlertTone(
  preset: AlertPresetKey | 'custom',
  ctx?: AudioContext,
  customAudio?: HTMLAudioElement,
): Promise<void> {
  // Presets sintéticos usam WebAudio. 'custom' e os MP3 seguem no ramo de arquivo.
  if (preset === 'beep' || preset === 'chime' || preset === 'gong') {
    if (!ctx) return
    const p = ALERT_PRESETS[preset]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = p.type
    if (preset === 'chime') {
      const [first, second] = ALERT_PRESETS.chime.freq
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = p.type
      osc2.frequency.setValueAtTime(first, ctx.currentTime)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      gain2.gain.setValueAtTime(0.3, ctx.currentTime)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.duration)
      osc2.start(ctx.currentTime)
      osc2.stop(ctx.currentTime + p.duration)
      osc.frequency.setValueAtTime(second, ctx.currentTime + p.duration)
    } else {
      osc.frequency.setValueAtTime(ALERT_PRESETS[preset].freq, ctx.currentTime)
    }
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + p.duration)
    return
  }

  // Presets MP3 (oficiais LouvorJA) + custom
  let audio: HTMLAudioElement | undefined
  if (preset === 'custom') {
    audio = customAudio
  } else {
    const presetDef = (ALERT_PRESETS as unknown as Record<string, { url?: string }>)[preset]
    if (!presetDef || !('url' in presetDef) || !presetDef.url) return
    audio = await preloadAudio(presetDef.url)
  }
  if (!audio) return
  try {
    audio.currentTime = 0
    await audio.play()
  } catch {
    // autoplay bloqueado — silencioso
  }
}

// Exporta lista de presets para UI (sintéticos + oficiais + desabilitado)
export function getAvailablePresets(): Array<{ key: string; label: string }> {
  return [
    { key: 'none', label: '— Desabilitado —' },
    { key: 'abertura_es', label: 'Abertura ES (oficial LouvorJA)' },
    { key: '5min_es', label: '5 min ES (oficial LouvorJA)' },
    { key: '1min_es', label: '1 min ES (oficial LouvorJA)' },
    { key: 'beep', label: 'Beep (sintético)' },
    { key: 'chime', label: 'Chime (sintético)' },
    { key: 'gong', label: 'Gong (sintético)' },
    { key: 'custom', label: 'Áudio personalizado do dispositivo' },
  ]
}

// ── Áudio personalizado do usuário (por marco) ─────────────────────────
// Persistido em localStorage como data-URL (arquivos de alerta são pequenos, <2MB razoável).
const CUSTOM_TONES_KEY = 'pianolouvorja:countdown:customTones'

export type CustomToneMap = Partial<Record<'start' | '5min' | '1min', string>> // data-URLs

export function loadCustomTones(): CustomToneMap {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TONES_KEY) ?? '{}') as CustomToneMap
  } catch {
    return {}
  }
}

export function saveCustomTone(marker: 'start' | '5min' | '1min', dataUrl: string): void {
  const tones = loadCustomTones()
  tones[marker] = dataUrl
  try {
    localStorage.setItem(CUSTOM_TONES_KEY, JSON.stringify(tones))
  } catch {
    // quota excedida — arquivo grande demais
    throw new Error('TOO_LARGE')
  }
}

export function clearCustomTone(marker: 'start' | '5min' | '1min'): void {
  const tones = loadCustomTones()
  delete tones[marker]
  localStorage.setItem(CUSTOM_TONES_KEY, JSON.stringify(tones))
}

// Cache de HTMLAudioElement por data-URL custom
const customAudioCache = new Map<string, HTMLAudioElement>()

/** Retorna o HTMLAudioElement custom do marco, ou undefined se não há. */
export function getCustomAudio(marker: 'start' | '5min' | '1min'): HTMLAudioElement | undefined {
  const dataUrl = loadCustomTones()[marker]
  if (!dataUrl) return undefined
  let audio = customAudioCache.get(dataUrl)
  if (!audio) {
    audio = new Audio(dataUrl)
    audio.preload = 'auto'
    customAudioCache.set(dataUrl, audio)
  }
  return audio
}