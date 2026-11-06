const PLAYING = 1
const ENDED = 0

/** Player embutido do YouTube sem controles, sugestões, anotações, tela cheia nem teclado. */
export function youtubeEmbedPlayerVars(options: { origin: string; muted: boolean }) {
  return {
    autoplay: 1,
    controls: 0,
    rel: 0,
    fs: 0,
    iv_load_policy: 3,
    disablekb: 1,
    playsinline: 1,
    modestbranding: 1,
    enablejsapi: 1,
    origin: options.origin,
    mute: options.muted ? 1 : 0,
  }
}

/** Véu preto sobre o player: cobre título, logo e carregamento até tocar, e volta no fim. */
export function youtubeVeilAfter(veiled: boolean, state: number): boolean {
  if (state === PLAYING) return false
  if (state === ENDED) return true
  return veiled
}
