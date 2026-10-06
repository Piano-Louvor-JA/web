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

describe('palco-cloud-bridge — caudas', () => {
  beforeEach(() => {
    sendMock.mockReset()
    for (const k of Object.keys(routeMap)) delete routeMap[k]
    for (const k of Object.keys(stageByScope)) delete stageByScope[k]
    mod.resetStageRelayModule()
  })

  it('liturgy-web video/audio SEM url → idle vazio (não crasha)', async () => {
    expect(
      await mod.toReceiverMessage('liturgy-web', { active: true, kind: 'video', url: '   ' }),
    ).toMatchObject({ type: 'idle', msg: '' })
    expect(
      await mod.toReceiverMessage('liturgy-web', { active: true, kind: 'audio' }),
    ).toMatchObject({ type: 'idle', msg: '' })
  })

  it('liturgy-web vídeo local blob → aviso "Vídeo local"', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'video',
      url: 'blob:https://x/1',
    })
    expect(msg?.msg).toContain('Vídeo local')
  })

  it('liturgy-web site SEM título → aviso genérico', async () => {
    const msg = await mod.toReceiverMessage('liturgy-web', { active: true, kind: 'site' })
    expect(msg?.msg).toContain('não projetável')
  })

  it('media sem título nem subtitle → footer vazio, sem crash', async () => {
    const msg = await mod.toReceiverMessage('media', { active: true, lyric: 'x' })
    expect(msg?.footer).toBe('')
    expect(msg?.footerRef).toBeUndefined()
  })

  it('resolveTvBackground: raw vazio → undefined; URL pública passa direto', async () => {
    // vazio
    stageByScope['bible'] = { backgroundImage: '' }
    const m1 = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m1?.background).toBeUndefined()
    // http
    stageByScope['bible'] = { backgroundImage: 'https://cdn/bg.png' }
    const m2 = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m2?.background).toBe('https://cdn/bg.png')
    // path relativo com hostname localhost → undefined
    stageByScope['bible'] = { backgroundImage: '/assets/bg.png' }
    const m3 = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m3?.background).toBeUndefined()
  })

  it('resolveTvBackground: oficial sem match em hostname LAN → absoluto; protocolo relativo //', async () => {
    stageByScope['bible'] = { backgroundImage: '//cdn.com/bg.png' }
    const m = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m?.background).toBe('//cdn.com/bg.png')
  })

  it('publish: erro interno do send não derruba o chamador', async () => {
    sendMock.mockImplementation(() => { throw new Error('ws morto') })
    expect(() => mod.publishToStageRelay('bible', { reference: 'a', text: 'b' })).not.toThrow()
  })

  it('publish: routing lançando → broadcast (sem to)', async () => {
    // routeMap sem bible = mirror, mas getPopupRoute mock pode lançar:
    const { getPopupRoute } = await import('@shared/services/popup-routing')
    const routeMocked = vi.mocked(getPopupRoute)
    routeMocked.mockImplementationOnce(() => { throw new Error('routing down') })
    mod.publishToStageRelay('bible', { reference: 'a', text: 'b' })
    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1)
      expect(sendMock.mock.calls[0][1]).toBeUndefined()
    })
    routeMocked.mockReset()
  })
})

describe('palco-cloud-bridge — caudas finais', () => {
  beforeEach(() => {
    sendMock.mockReset()
    for (const k of Object.keys(routeMap)) delete routeMap[k]
    for (const k of Object.keys(stageByScope)) delete stageByScope[k]
    mod.resetStageRelayModule()
  })

  it('resolveBackgroundImage → null (bg desconhecido) → background undefined', async () => {
    const settings = await import('@modules/settings/types/stage-settings')
    vi.mocked(settings.resolveBackgroundImage).mockReturnValueOnce(null as never)
    stageByScope['bible'] = { backgroundImage: 'official:inexistente' }
    const m = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m?.background).toBeUndefined()
  })

  it('resolveBackgroundImage lançando → catch → undefined (não crasha publish)', async () => {
    const settings = await import('@modules/settings/types/stage-settings')
    vi.mocked(settings.resolveBackgroundImage).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    stageByScope['bible'] = { backgroundImage: 'official:x' }
    const m = await mod.toReceiverMessage('bible', { reference: 'a', text: 'b' })
    expect(m?.type).toBe('projection')
    expect(m?.background).toBeUndefined()
  })

  it('publish sem janela (SSR): window sem __palcoRelaySend → no-op', async () => {
    const prev = (window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend
    ;(window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend = undefined
    expect(() => mod.publishToStageRelay('clock', { time: '1' })).not.toThrow()
    ;(window as unknown as { __palcoRelaySend?: unknown }).__palcoRelaySend = prev
  })

  it('liturgy-web payload null → idle com msg vazia', async () => {
    const m = await mod.toReceiverMessage('liturgy-web', null)
    expect(m).toMatchObject({ type: 'idle', msg: '' })
  })

  it('liturgy-web site com título vazio string → msg com título concatenado', async () => {
    const m = await mod.toReceiverMessage('liturgy-web', { active: true, kind: 'site', title: '' })
    expect(m?.msg).not.toContain('—')
  })
})

describe('palco-cloud-bridge — última milha', () => {
  beforeEach(() => {
    sendMock.mockReset()
    for (const k of Object.keys(routeMap)) delete routeMap[k]
    for (const k of Object.keys(stageByScope)) delete stageByScope[k]
    mod.resetStageRelayModule()
  })

  it('clock com rota palco:N publica direto (sem guard de exclusividade)', async () => {
    mod.publishToStageRelay('bible', { reference: 'a', text: 'b' })
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    routeMap['clock'] = 'palco:5'
    mod.publishToStageRelay('clock', { time: '09:00' })
    await vi.waitFor(() => {
      const timer = sendMock.mock.calls.find((c) => c[0]?.type === 'timer')
      expect(timer).toBeDefined()
      expect(timer![1]).toBe('slot-5')
    })
  })

  it('toReceiverMessage null (payload inválido) reseta lastRelayModule (73)', async () => {
    routeMap['clock'] = 'tv' // clock só publica quando é destino explícito
    mod.publishToStageRelay('clock', { time: 12345 }) // time não é string → null
    await new Promise((r) => setTimeout(r, 20))
    expect(sendMock).not.toHaveBeenCalled()
    // próximo clock NÃO manda idle (lastRelay era null)
    mod.publishToStageRelay('clock', { time: '09:00' })
    await vi.waitFor(() => {
      expect(sendMock.mock.calls).toHaveLength(1)
      expect(sendMock.mock.calls[0][0].type).toBe('timer')
    })
  })

  it('liturgy-web title não-string (number) → tratado como vazio (275)', async () => {
    const m = await mod.toReceiverMessage('liturgy-web', {
      active: true,
      kind: 'video',
      url: 'https://x/v.mp4',
      title: 12345,
    })
    expect(m?.title).toBe('')
  })

  it('bg path relativo com hostname LAN vira absoluto (118-123)', async () => {
    stageByScope['hymns'] = { backgroundImage: 'official:capa-1' }
    const loc = window.location as unknown as { hostname: string; protocol: string; host: string }
    const desc = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...loc, hostname: '10.0.0.5', protocol: 'http:', host: '10.0.0.5:8080' },
    })
    try {
      const m = await mod.toReceiverMessage('media', { active: true, lyric: 'x', title: 'y' })
      expect(m?.background).toBe('http://10.0.0.5:8080/src/assets/bg/capa-1.png')
    } finally {
      if (desc) Object.defineProperty(window, 'location', desc)
    }
  })
})

  it('bg oficial com hostname localhost (jsdom default) → background undefined (S124)', async () => {
    stageByScope['hymns'] = { backgroundImage: 'official:bg-10' }
    const m = await mod.toReceiverMessage('media', { active: true, lyric: 'x', title: 'y' })
    expect(m?.background).toBeUndefined()
  })

  it('publish clock com payload null 2x seguidas → else-if reseta lastRelayModule (73)', async () => {
    routeMap['clock'] = 'tv'
    mod.publishToStageRelay('clock', { time: 12345 })
    await new Promise((r) => setTimeout(r, 20))
    mod.publishToStageRelay('clock', { time: 6789 }) // msg null de novo, mas agora lastRelay==='clock' → else-if TRUE
    await new Promise((r) => setTimeout(r, 20))
    expect(sendMock).not.toHaveBeenCalled()
    // lastRelay resetado de novo → próximo timer NÃO manda idle antes
    mod.publishToStageRelay('clock', { time: '00:00' })
    await vi.waitFor(() => {
      expect(sendMock.mock.calls).toHaveLength(1)
      expect(sendMock.mock.calls[0][0].type).toBe('timer')
    })
  })

  it('publish clock rota palco:N com payload inválido → early return sem toReceiverMessage', async () => {
    routeMap['clock'] = 'palco:2'
    mod.publishToStageRelay('clock', { time: null })
    await new Promise((r) => setTimeout(r, 20))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('media isCover=true COM background → spread inclui background (207)', async () => {
    stageByScope['hymns'] = { backgroundImage: '' }
    const m = await mod.toReceiverMessage('media', {
      active: true,
      lyric: 'letra',
      isCover: true,
      title: 'Hino 1',
      imageUrl: 'https://x/capa.png',
    })
    expect(m).toMatchObject({ type: 'projection', background: 'https://x/capa.png' })
  })

  it('stageFields com backgroundColor → inclui backgroundColor (149)', async () => {
    stageByScope['bible'] = { backgroundColor: '#112233' }
    const m = await mod.toReceiverMessage('bible', { reference: 'Sl 23', text: 'O Senhor' })
    expect(m).toMatchObject({ type: 'projection', backgroundColor: '#112233' })
  })

  it('media isCover SEM background nenhum → spread vazio (207 else)', async () => {
    stageByScope['hymns'] = { backgroundImage: '' }
    const m = await mod.toReceiverMessage('media', {
      active: true,
      lyric: 'letra',
      isCover: true,
      title: 'Hino 2',
    })
    expect(m).toMatchObject({ type: 'projection', text: 'Hino 2' })
    expect(m).not.toHaveProperty('background')
  })


  it('publish concorrente: A null depois que B (tv) mudou lastRelay → else-if false (78 else)', async () => {
    routeMap['clock'] = 'tv'
    mod.publishToStageRelay('bible', null) // A: msg null na microtask
    mod.publishToStageRelay('clock', { time: '12:00' }) // B: gate tv ok → idle + lastRelay='clock' → timer
    await new Promise((r) => setTimeout(r, 40))
    const types = sendMock.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(expect.arrayContaining(['timer']))
    // A (bible) null NÃO resetou o lastRelay do clock (else-if falso)
    mod.publishToStageRelay('clock', { time: '12:01' })
    await vi.waitFor(() => {
      const timers = sendMock.mock.calls.filter((c) => c[0].type === 'timer')
      expect(timers).toHaveLength(2)
      // entre os 2 timers NÃO houve idle extra (só o 1º idle do A→B switch)
      const idles = sendMock.mock.calls.filter((c) => c[0].type === 'idle')
      expect(idles).toHaveLength(1)
    })
  })
})
