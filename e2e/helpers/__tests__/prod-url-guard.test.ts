import { expect, test, describe } from 'vitest'
import { assertNoProdApiUrl, PROD_HOSTS, splitCsvUrls } from '../prod-url-guard'

// G2 — teste unitário do guard de URL de produção (critério A4 da SPEC).
// Produção → throw com host na mensagem; staging/localhost/upstream → passa;
// CSV de fallbacks → cada entrada verificada individualmente.

describe('PROD_HOSTS', () => {
  test('contém exatamente o host de produção da piano-api', () => {
    expect(PROD_HOSTS).toEqual(['api.pianolouvorja.com.br'])
  })
})

describe('assertNoProdApiUrl', () => {
  test('lança para URL de produção com host e fonte na mensagem', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br/json_db'], 'process.env'),
    ).toThrowError(/api\.pianolouvorja\.com\.br.*process\.env/s)
  })

  test('hostname é comparado case-insensitive', () => {
    expect(() =>
      assertNoProdApiUrl(['https://API.PianoLouvorJA.com.br'], 'process.env'),
    ).toThrowError(/E2E apontando para PRODUÇÃO \(api\.pianolouvorja\.com\.br/)
  })

  test('lança para URL de produção com porta', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br:8443/v1'], '.env'),
    ).toThrowError(/api\.pianolouvorja\.com\.br/)
  })

  test('aceita localhost com porta', () => {
    expect(() => assertNoProdApiUrl(['http://localhost:5174'], 'process.env')).not.toThrow()
  })

  test('aceita 127.0.0.1 com porta', () => {
    expect(() => assertNoProdApiUrl(['http://127.0.0.1:3100'], 'process.env')).not.toThrow()
  })

  test('aceita staging', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api-stg.pianolouvorja.com.br'], 'process.env'),
    ).not.toThrow()
  })

  test('aceita upstream read-only (api.louvorja.com.br)', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.louvorja.com.br/json_db'], 'process.env'),
    ).not.toThrow()
  })

  test('pula entradas vazias, ausentes e URLs inválidas', () => {
    expect(() =>
      assertNoProdApiUrl(['', undefined, '   ', 'not-a-url'], 'process.env'),
    ).not.toThrow()
  })

  test('CSV de fallbacks com UMA entrada de produção lança apontando a entrada', () => {
    expect(() =>
      assertNoProdApiUrl(
        splitCsvUrls('https://api.louvorja.com.br,https://api.pianolouvorja.com.br'),
        'process.env',
      ),
    ).toThrowError(/URL ofensora: https:\/\/api\.pianolouvorja\.com\.br/)
  })

  test('subdomínio diferente NÃO é bloqueado (comparação de hostname exato)', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api-stg.pianolouvorja.com.br', 'https://evil-api.pianolouvorja.com.br.attacker.io'], 'process.env'),
    ).not.toThrow()
  })

  test('URL com userinfo não burla o hostname', () => {
    expect(() =>
      assertNoProdApiUrl(['https://user@api.pianolouvorja.com.br'], '.env.local'),
    ).toThrowError(/api\.pianolouvorja\.com\.br/)
  })
})

describe('splitCsvUrls', () => {
  test('quebra CSV, remove espaços e entradas vazias', () => {
    expect(splitCsvUrls(' https://a.example , ,https://b.example,')).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })

  test('undefined/vazio retorna lista vazia', () => {
    expect(splitCsvUrls(undefined)).toEqual([])
    expect(splitCsvUrls('')).toEqual([])
  })
})
