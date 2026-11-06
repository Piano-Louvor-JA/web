import { describe, expect, it } from 'vitest'

import { youtubeEmbedPlayerVars, youtubeVeilAfter } from '../youtube-embed'

describe('player embutido do YouTube na projeção', () => {
  it('sem controles, sugestões, anotações, tela cheia nem teclado; origem real da página', () => {
    expect(youtubeEmbedPlayerVars({ origin: 'https://piano.example', muted: true })).toEqual({
      autoplay: 1,
      controls: 0,
      rel: 0,
      fs: 0,
      iv_load_policy: 3,
      disablekb: 1,
      playsinline: 1,
      modestbranding: 1,
      enablejsapi: 1,
      origin: 'https://piano.example',
      mute: 1,
    })
    expect(youtubeEmbedPlayerVars({ origin: 'https://piano.example', muted: false }).mute).toBe(0)
  })

  it('véu preto até o vídeo tocar e de novo no fim; pausa e carregamento mantêm o que estava', () => {
    expect(youtubeVeilAfter(true, -1)).toBe(true)
    expect(youtubeVeilAfter(true, 3)).toBe(true)
    expect(youtubeVeilAfter(true, 1)).toBe(false)
    expect(youtubeVeilAfter(false, 2)).toBe(false)
    expect(youtubeVeilAfter(false, 3)).toBe(false)
    expect(youtubeVeilAfter(false, 0)).toBe(true)
  })
})
