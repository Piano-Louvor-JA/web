import { describe, expect, it } from 'vitest'
import { partnerKeyForUrl } from '../partner-key'

const env = {
  VITE_PARTNER_KEY_STG: 'plj_web_stg_teste',
  VITE_PARTNER_KEY_PROD: 'plj_web_prod_teste',
}

describe('chave de parceiro do web', () => {
  it.each([
    ['https://api-stg.pianolouvorja.com.br/v1/liturgy', 'plj_web_stg_teste'],
    ['https://api.pianolouvorja.com.br/file/teste', 'plj_web_prod_teste'],
    ['http://localhost:3100/v1/custom', 'plj_web_stg_teste'],
    ['http://127.0.0.1:3100/v1/custom', 'plj_web_stg_teste'],
  ])('seleciona a chave pela URL %s', (url, key) => {
    expect(partnerKeyForUrl(url, env)).toBe(key)
  })

  it('aceita override do build e remove espaços', () => {
    expect(partnerKeyForUrl('https://api.pianolouvorja.com.br/v1', {
      ...env, VITE_PARTNER_KEY: ' plj_web_override ',
    })).toBe('plj_web_override')
  })

  it.each([
    'https://api.louvorja.com.br/db/manifest.json',
    'https://api.louvorja.workers.dev/json_db',
    'https://googleapis.com/auth',
    'https://api.pianolouvorja.com.br.example.com/v1',
    'https://example.com/?api=api.pianolouvorja.com.br',
    'http://api.pianolouvorja.com.br/v1',
    'ftp://localhost/v1',
    'https://usuario@api.pianolouvorja.com.br/v1',
    '/v1/custom',
    'url inválida',
  ])('não fornece chave para destino não permitido: %s', url => {
    expect(partnerKeyForUrl(url, { ...env, VITE_PARTNER_KEY: 'plj_web_override' })).toBe('')
  })

  it.each(['', '  ', 'invalida'])('omite chave inválida ou ausente: %s', key => {
    expect(partnerKeyForUrl('https://api-stg.pianolouvorja.com.br/v1', {
      VITE_PARTNER_KEY_STG: key,
    })).toBe('')
  })

  it('não usa a chave de outro ambiente quando a chave do destino está ausente', () => {
    expect(partnerKeyForUrl('https://api.pianolouvorja.com.br/v1', {
      VITE_PARTNER_KEY_STG: env.VITE_PARTNER_KEY_STG,
    })).toBe('')
  })
})
