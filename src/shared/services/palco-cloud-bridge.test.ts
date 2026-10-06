import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * palco-cloud-bridge: serialização de estados de projeção web → protocolo
 * v2 do receiver cloud (TV). Dependências (routing, stage-settings) mockadas;
 * window.__palcoRelaySend fake para observar o send.
 */

const sendMock = vi.fn()
const routeMap: Record<string, string> = {}

vi.mock('@shared/services/popup-routing', () => ({
  getPopupRoute: vi.fn((m: string) => routeMap[m] ?? 'mirror'),
}))

const stageByScope: Record<string, Record<string, unknown>> = {}
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn((scope: string) => ({
    fontSize: 40,
    fontWeight: 'bold',
    textShadow: true,
    shadowIntensity: 0.5,
    shadowBlur: 4,
    textBox: true,
    boxOpacity: 0.6,
    boxBorder: false,
    textColor: '#ffffff',
    backgroundColor: '',
    backgroundImage: '',
    showBibleVersion: true,
    bibleFontSize: 48,
    bibleFontWeight: 'normal',
    bibleTextColor: '#ffff00',
    footerRefColor: '#00ff00',
    footerRefWeight: '600',
    textAlign: 'center',
    textVerticalAlign: 'middle',
    margin: 24,
    bibleTextTransform: 'none',
    random: { fontSizePc: 12 },
    ...stageByScope[scope],
  })),
}))

vi.mock('@modules/settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn((raw: string) =>
    raw.startsWith('official:') ? `/src/assets/bg/${raw.slice(9)}.png` : raw,
  ),
}))

let mod: typeof import('./palco-cloud-bridge')

beforeAll(async () => {
  ;(window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend = sendMock
  mod = await import('./palco-cloud-bridge')
})

beforeEach(() => {
  sendMock.mockReset()
  for (const k of Object.keys(routeMap)) delete routeMap[k]
  for (const k of Object.keys(stageByScope)) delete stageByScope[k]
  mod.resetStageRelayModule()
})

describe('publishToStageRelay', () => {
  it('sem relay registrado → no-op (modo local/desktop)', () => {
    ;(window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend = undefined
    expect(() => mod.publishToStageRelay('bible', {})).not.toThrow()
    ;(window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend = sendMock
  })

  it('publica bible e manda idle ANTES ao trocar de módulo', async () => {
    mod.publishToStageRelay('bible', { reference: 'Jo 3:16', text: 'Porque...' })
    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1)
    })
    // troca pra media → idle do bible antes
    mod.publishToStageRelay('media', { active: true, lyric: 'letra', title: 'Hino' })
    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(3)
    })
    expect(sendMock.mock.calls[1][0].type).toBe('idle')
    expect(sendMock.mock.calls[2][0].type).toBe('projection')
  })

  it("rota palco:N direciona pro receiver do slot (to: slot-N)", async () => {
    routeMap['bible'] = 'palco:2'
    mod.publishToStageRelay('bible', { reference: 'Sl 23', text: 'O Senhor...' })
    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'projection' }), 'slot-2')
    })
  })

  it("clock só publica se for o módulo ativo OU rota tv/palco:N", async () => {
    // módulo ativo é outro e rota mirror → ignora
    mod.publishToStageRelay('bible', { reference: 'a', text: 'b' })
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    mod.publishToStageRelay('clock', { time: '12:00' })
    await new Promise((r) => setTimeout(r, 20))
    expect(sendMock).toHaveBeenCalledTimes(1) // clock descartado

    // rota tv → publica
    routeMap['clock'] = 'tv'
    mod.publishToStageRelay('clock', { time: '12:01' })
    await vi.waitFor(() => {
      const timerCall = sendMock.mock.calls.find((c) => c[0]?.type === 'timer')
      expect(timerCall).toBeDefined()
      expect(timerCall![0].text).toBe('12:01')
    })
  })

  it('payload que vira null (sem reference/text) não publica e reseta lastRelayModule', async () => {
    mod.publishToStageRelay('bible', { reference: 'x' }) // sem text → null
    await new Promise((r) => setTimeout(r, 20))
    expect(sendMock).not.toHaveBeenCalled()
    // próximo publish de bible NÃO deve mandar idle (lastRelay resetado)
    mod.publishToStageRelay('bible', { reference: 'a', text: 'b' })
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    expect(sendMock.mock.calls[0][0].type).toBe('projection')
  })
})

describe('toReceiverMessage — bible', () => {
  it('payload inválido → null; texto vazio → idle', async () => {
    expect(await mod.toReceiverMessage('bible', {})).toBeNull()
    expect(await mod.toReceiverMessage('bible', null)).toBeNull()
    const idle = await mod.toReceiverMessage('bible', { reference: 'x', text: '  ' })
    expect(idle?.type).toBe('idle')
  })

  it('projeção completa com campos do palco e footerRef', async () => {
    const msg = await mod.toReceiverMessage('bible', {
      reference: 'Jo 3:16',
      text: 'Porque Deus amou o mundo',
    })
    expect(msg).toMatchObject({
      v: 2,
      type: 'projection',
      footerRef: 'Jo 3:16',
      text: 'Porque Deus amou o mundo',
      fontSize: 48,
      fontWeight: 'normal',
      textColor: '#ffff00',
      footerRefColor: '#00ff00',
      footerColor: '#00ff00',
      footerWeight: '600',
      textAlign: 'center',
      textVerticalAlign: 'middle',
      padding: 24,
      textBox: true,
    })
    expect(msg?.textTransform).toBeUndefined()
  })

  it('showBibleVersion=false omite footerRef; bibleTextTransform aplica', async () => {
    stageByScope['bible'] = { showBibleVersion: false, bibleTextTransform: 'uppercase' }
    const msg = await mod.toReceiverMessage('bible', { reference: 'Rm 8', text: 'Nada' })
    expect(msg?.footerRef).toBeUndefined()
    expect(msg?.textTransform).toBe('uppercase')
  })
})

describe('toReceiverMessage — media', () => {
  it('inativo/sem letra → idle "Aguardando conteúdo…"', async () => {
    expect((await mod.toReceiverMessage('media', { active: false }))?.type).toBe('idle')
    expect(
      (await mod.toReceiverMessage('media', { active: true, lyric: '' }))?.msg,
    ).toContain('Aguardando')
  })

  it('hino normal: letra no text, título no footer, capa como background', async () => {
    const msg = await mod.toReceiverMessage('media', {
      active: true,
      lyric: 'Santa, santa, santa',
      title: 'Trino Deus',
      imageUrl: 'https://cdn/capa.jpg',
      subtitle: 'Hinos 12',
    })
    expect(msg).toMatchObject({
      type: 'projection',
      text: 'Santa, santa, santa',
      footer: 'Trino Deus',
      footerRef: 'Hinos 12',
      background: 'https://cdn/capa.jpg',
    })
  })

  it('isCover: título como conteúdo grande, sem footer', async () => {
    const msg = await mod.toReceiverMessage('media', {
      active: true,
      lyric: 'letra presente',
      title: 'Trino Deus',
      isCover: true,
      imageUrl: 'https://cdn/capa.jpg',
    })
    expect(msg?.text).toBe('Trino Deus')
    expect(msg?.footer).toBeUndefined()
  })

  it('backgroundImage do usuário vence a capa do hino', async () => {
    stageByScope['hymns'] = { backgroundImage: 'data:image/png;base64,AAA' }
    const msg = await mod.toReceiverMessage('media', {
      active: true,
      lyric: 'x',
      title: 'y',
      imageUrl: 'https://cdn/capa.jpg',
    })
    expect(msg?.background).toBe('data:image/png;base64,AAA')
  })
})

describe('toReceiverMessage — clock/random/timer', () => {
  it('clock: time vazio → idle; com hora → type timer', async () => {
    expect((await mod.toReceiverMessage('clock', { time: '' }))?.type).toBe('idle')
    expect(await mod.toReceiverMessage('clock', {})).toBeNull()
    const msg = await mod.toReceiverMessage('clock', { time: '10:30' })
    expect(msg).toMatchObject({ type: 'timer', text: '10:30', fontSize: 40 })
  })

  it('random: usa fontSizePc do scope; vazio → idle', async () => {
    expect((await mod.toReceiverMessage('random', { currentDisplay: ' ' }))?.type).toBe('idle')
    expect(await mod.toReceiverMessage('random', {})).toBeNull()
    const msg = await mod.toReceiverMessage('random', { currentDisplay: 'Hino 45' })
    expect(msg?.type).toBe('projection')
    expect(msg?.text).toBe('Hino 45')
  })

  it('timer/countdown: display obrigatório', async () => {
    expect(await mod.toReceiverMessage('timer', {})).toBeNull()
    expect(await mod.toReceiverMessage('countdown', { display: '05:00' })).toMatchObject({
      type: 'timer',
      text: '05:00',
    })
  })
})

describe('toReceiverMessage — liturgy-web', () => {
  it('inativo → idle vazio', async () => {
    expect(await mod.toReceiverMessage('liturgy-web', { active: false })).toMatchObject({
      type: 'idle',
      msg: '',
    })
  })

  it('vídeo local (url http) → type video + play', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'video',
      url: 'https://cdn/video.mp4',
      title: 'Clipe',
    })
    expect(msg).toMatchObject({ type: 'video', url: 'https://cdn/video.mp4', action: 'play', title: 'Clipe' })
  })

  it('áudio local (blob:) → idle explicando limitação', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'audio',
      url: 'blob:https://x/abc',
    })
    expect(msg?.type).toBe('idle')
    expect(msg?.msg).toContain('Áudio local')
  })

  it('youtube/vimeo → idle "TV não reproduz links de página"', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'youtube',
      url: 'https://youtube.com/watch?v=x',
    })
    expect(msg?.msg).toContain('TV não reproduz')
  })

  it('site/pdf → idle com título do conteúdo', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'site',
      title: 'Devocional',
    })
    expect(msg?.msg).toContain('Devocional')
  })
})

describe('resolveTvBackground (via toReceiverMessage)', () => {
  it('bg oficial (path relativo) → absoluto com hostname do operador', async () => {
    stageByScope['bible'] = { backgroundImage: 'official:bg-10' }
    // simula acesso LAN (Rafael abre o web de outra máquina)
    const loc = window.location as unknown as { hostname: string; protocol: string; host: string }
    const desc = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...loc, hostname: '192.168.0.10', protocol: 'https:', host: '192.168.0.10:5173' },
    })
    try {
      const msg = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
      expect(msg?.background).toBe('https://192.168.0.10:5173/src/assets/bg/bg-10.png')
    } finally {
      if (desc) Object.defineProperty(window, 'location', desc)
    }
  })

  it('data URL grande (>60KB) descarta background (msg_too_large)', async () => {
    stageByScope['bible'] = { backgroundImage: `data:image/png;base64,${'A'.repeat(80_000)}` }
    const msg = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(msg?.background).toBeUndefined()
  })

  it('hostname localhost → sem background (TV não resolve)', async () => {
    // jsdom hostname é localhost → path relativo vira undefined
    stageByScope['bible'] = { backgroundImage: 'official:bg-1' }
    const prev = (window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend
    const msg = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(msg?.background).toBeUndefined()
    void prev
  })

  it('módulo desconhecido → null', async () => {
    expect(await mod.toReceiverMessage('desconhecido', {})).toBeNull()
  })
})
