import { expect, test, describe } from 'vitest'
import {
  assertNoProdApiUrl,
  parseDotenv,
  PROD_HOSTS,
  repoRootEnvLayers,
  resolveEffectiveApiUrls,
  splitCsvUrls,
} from '../prod-url-guard'

// G2 — teste unitário do guard de URL de produção (critério A4 da SPEC).
// Produção → throw com host na mensagem; staging/localhost/upstream → passa;
// CSV de fallbacks → cada entrada verificada individualmente.
// Rework P2-1: strings URL-inválidas contendo host de prod → fail-closed.

describe('PROD_HOSTS', () => {
  test('contém exatamente o host de produção da piano-api', () => {
    expect(PROD_HOSTS).toEqual(['api.pianolouvorja.com.br'])
  })
})

describe('assertNoProdApiUrl', () => {
  test('lança para URL de produção com host e fonte na mensagem', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br/json_db'], 'process.env'),
    ).toThrowError(/^E2E apontando para PRODUÇÃO \(api\.pianolouvorja\.com\.br em process\.env\)/)
  })

  test('hostname é comparado case-insensitive', () => {
    expect(() =>
      assertNoProdApiUrl(['https://API.PianoLouvorJA.com.br'], 'process.env'),
    ).toThrowError(/^E2E apontando para PRODUÇÃO \(api\.pianolouvorja\.com\.br em process\.env\) — /)
  })

  test('lança para URL de produção com porta', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br:8443/v1'], '.env'),
    ).toThrowError(/com\.br:8443/)
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

  test('pula entradas vazias, ausentes e strings inválidas SEM host de prod', () => {
    expect(() =>
      assertNoProdApiUrl(['', undefined, '   ', 'not-a-url'], 'process.env'),
    ).not.toThrow()
  })

  test('P2-1 fail-closed: host de prod SEM protocolo bloqueia', () => {
    expect(() =>
      assertNoProdApiUrl(['api.pianolouvorja.com.br'], 'VITE_API_FALLBACK_URLS'),
    ).toThrowError(/api\.pianolouvorja\.com\.br/)
  })

  test('P2-1 fail-closed: URL de prod com aspas envolventes (CSV malformado) bloqueia', () => {
    expect(() =>
      assertNoProdApiUrl(['"https://api.pianolouvorja.com.br"'], 'process.env'),
    ).toThrowError(/api\.pianolouvorja\.com\.br/)
  })

  test('P2-1: host sem protocolo de NÃO-prod (staging/localhost) NÃO bloqueia', () => {
    expect(() =>
      assertNoProdApiUrl(
        ['api-stg.pianolouvorja.com.br', 'localhost', 'my-api.internal'],
        'process.env',
      ),
    ).not.toThrow()
  })

  test('CSV de fallbacks com UMA entrada de produção lança apontando a entrada', () => {
    expect(() =>
      assertNoProdApiUrl(
        splitCsvUrls('https://api.louvorja.com.br,https://api.pianolouvorja.com.br'),
        'process.env',
      ),
    ).toThrowError(/URL ofensora: https:\/\/api\.pianolouvorja\.com\.br$/)
  })

  test('subdomínio diferente NÃO é bloqueado (comparação de hostname exato)', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api-stg.pianolouvorja.com.br', 'https://evil-api.pianolouvorja.com.br.attacker.io'], 'process.env'),
    ).not.toThrow()
  })

  test('URL com userinfo não burla o hostname', () => {
    expect(() =>
      assertNoProdApiUrl(['https://user@api.pianolouvorja.com.br'], '.env.local'),
    ).toThrowError(/em \.env\.local/)
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

describe('parseDotenv', () => {
  test('parseia KEY=VALUE, pula comentários e remove aspas', () => {
    expect(
      parseDotenv('# comentário\nVITE_URL_DATABASE="https://a.example"\nBAD LINE\nX=1\n'),
    ).toEqual({ VITE_URL_DATABASE: 'https://a.example', X: '1' })
  })
})

describe('resolveEffectiveApiUrls (env layers)', () => {
  const envLayer = (source: string, vars: Record<string, string>) => ({ source, vars })

  test('process.env vence sobre .env.local e .env (precedência Vite)', () => {
    const resolved = resolveEffectiveApiUrls(
      { VITE_URL_DATABASE: 'http://localhost:3100' },
      [
        envLayer('.env', { VITE_URL_DATABASE: 'https://api.pianolouvorja.com.br/json_db' }),
        envLayer('.env.local', { VITE_URL_DATABASE: 'https://api-stg.pianolouvorja.com.br' }),
      ],
    )
    const hit = resolved.find((r) => r.key === 'VITE_URL_DATABASE')
    expect(hit).toMatchObject({ url: 'http://localhost:3100', source: 'process.env' })
  })

  test('.env.local vence sobre .env quando process.env ausente', () => {
    const resolved = resolveEffectiveApiUrls(
      {},
      [
        envLayer('.env', { VITE_URL_DATABASE: 'https://prod.example' }),
        envLayer('.env.local', { VITE_URL_DATABASE: 'https://stg.example' }),
      ],
    )
    const hit = resolved.find((r) => r.key === 'VITE_URL_DATABASE')
    expect(hit).toMatchObject({ url: 'https://stg.example', source: '.env.local' })
  })

  test('URL de PRODUÇÃO vinda do .env é exposta com origem — guard bloqueia', () => {
    const resolved = resolveEffectiveApiUrls(
      {},
      [envLayer('.env', { VITE_URL_DATABASE: 'https://api.pianolouvorja.com.br/json_db' })],
    )
    const hit = resolved.find((r) => r.key === 'VITE_URL_DATABASE')
    expect(hit).toBeDefined()
    expect(() => assertNoProdApiUrl([hit!.url], `${hit!.source} (${hit!.key})`)).toThrowError(
      /\.env \(VITE_URL_DATABASE\)/,
    )
  })

  test('CSV de fallback de produção em .env.local é expandido por entrada', () => {
    const resolved = resolveEffectiveApiUrls(
      {},
      [
        envLayer('.env.local', {
          VITE_API_FALLBACK_URLS: 'https://api.louvorja.com.br,https://api.pianolouvorja.com.br',
        }),
      ],
    )
    expect(resolved.filter((r) => r.key === 'VITE_API_FALLBACK_URLS')).toHaveLength(2)
  })

  test('nenhuma env definida retorna lista vazia', () => {
    expect(resolveEffectiveApiUrls({}, [envLayer('.env', {})])).toEqual([])
  })
})

describe('repoRootEnvLayers', () => {
  test('retorna camadas .env e .env.local (vazias se arquivos ausentes)', () => {
    const layers = repoRootEnvLayers()
    expect(layers.map((l) => l.source)).toEqual(['.env', '.env.local'])
  })
})
