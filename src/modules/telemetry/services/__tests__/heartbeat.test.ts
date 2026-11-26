import { beforeEach, describe, expect, it, vi } from 'vitest'

const bases = vi.hoisted(() => ({
  value: ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.louvorja.com.br/json_db'],
}))
vi.mock('@shared/services/api-fallback', () => ({
  apiCandidateBases: () => bases.value,
}))

import { saveHomeLocation } from '@modules/home/services/home-preferences'

import {
  buildHeartbeatBody,
  heartbeatUrls,
  isPianoApiHost,
  osFromUserAgent,
  sendHeartbeat,
} from '../heartbeat'

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  opera: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
}

describe('heartbeat do web (telemetria de dispositivos, Fase 5)', () => {
  beforeEach(() => {
    localStorage.clear()
    bases.value = ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.louvorja.com.br/json_db']
  })

  it('hosts da API Piano: STG, prod, domínio raiz e local; nunca a API legada', () => {
    expect(isPianoApiHost('api-stg.pianolouvorja.com.br')).toBe(true)
    expect(isPianoApiHost('API.pianolouvorja.com.br')).toBe(true)
    expect(isPianoApiHost('pianolouvorja.com.br')).toBe(true)
    expect(isPianoApiHost('localhost')).toBe(true)
    expect(isPianoApiHost('127.0.0.1')).toBe(true)
    expect(isPianoApiHost('api.louvorja.com.br')).toBe(false)
    expect(isPianoApiHost('pianolouvorja.com.br.evil.com')).toBe(false)
  })

  it('URLs: só API Piano, na ordem da cascata, sem repetir e ignorando base inválida', () => {
    bases.value = [
      'https://api-stg.pianolouvorja.com.br/json_db',
      'https://api-stg.pianolouvorja.com.br/file',
      'https://api.louvorja.com.br/json_db',
      'https://api.pianolouvorja.com.br/json_db',
      'nao-e-url',
    ]
    expect(heartbeatUrls()).toEqual([
      'https://api-stg.pianolouvorja.com.br/v1/telemetry/heartbeat',
      'https://api.pianolouvorja.com.br/v1/telemetry/heartbeat',
    ])
  })

  it('SO e navegador pelo user agent', () => {
    expect(osFromUserAgent(UA.winChrome)).toEqual({ name: 'Windows', release: 'Chrome 130', arch: '' })
    expect(osFromUserAgent(UA.winEdge)?.release).toBe('Edge 130')
    expect(osFromUserAgent(UA.opera)?.release).toBe('Opera 114')
    expect(osFromUserAgent(UA.android)).toEqual({ name: 'Android', release: 'Chrome 129', arch: '' })
    expect(osFromUserAgent(UA.samsung)?.release).toBe('Samsung Internet 25')
    expect(osFromUserAgent(UA.iphone)).toEqual({ name: 'iOS', release: 'Safari 18', arch: '' })
    expect(osFromUserAgent(UA.mac)).toEqual({ name: 'macOS', release: 'Safari 18', arch: '' })
    expect(osFromUserAgent(UA.linuxFirefox)).toEqual({ name: 'Linux', release: 'Firefox 132', arch: '' })
    expect(osFromUserAgent(UA.chromeos)?.name).toBe('ChromeOS')
    expect(osFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Navegador/1')).toEqual({ name: 'Windows', release: '', arch: '' })
    expect(osFromUserAgent('bot qualquer')).toBeNull()
  })

  it('corpo: id da instalação, plataforma web, versão, distrito/igreja (vazio usa o último valor)', () => {
    saveHomeLocation({ district: 'Bertioga', church: 'Rio da Praia' })
    saveHomeLocation({ district: '', church: 'Rio da Praia' })
    const body = buildHeartbeatBody()
    expect(body.install_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.platform).toBe('web')
    expect(body.app_version).toBeTruthy()
    expect(body.district).toBe('Bertioga')
    expect(body.church).toBe('Rio da Praia')
    expect(typeof body.timezone).toBe('string')
    expect(typeof body.locale).toBe('string')
    expect(buildHeartbeatBody().install_id).toBe(body.install_id)
  })

  it('sem distrito/igreja: null', () => {
    const body = buildHeartbeatBody()
    expect(body.district).toBeNull()
    expect(body.church).toBeNull()
  })

  it('envia POST JSON para a primeira URL e para quando dá certo', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    expect(await sendHeartbeat(fetchMock as never)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api-stg.pianolouvorja.com.br/v1/telemetry/heartbeat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).platform).toBe('web')
  })

  it('erro de rede ou 5xx cai no próximo host; 4xx não insiste', async () => {
    bases.value = ['https://api-stg.pianolouvorja.com.br/json_db', 'https://api.pianolouvorja.com.br/json_db']
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await sendHeartbeat(flaky as never)).toBe(true)
    expect(flaky).toHaveBeenCalledTimes(2)

    const serverDown = vi.fn(async () => new Response(null, { status: 503 }))
    expect(await sendHeartbeat(serverDown as never)).toBe(false)
    expect(serverDown).toHaveBeenCalledTimes(2)

    const notFound = vi.fn(async () => new Response(null, { status: 404 }))
    expect(await sendHeartbeat(notFound as never)).toBe(false)
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})
