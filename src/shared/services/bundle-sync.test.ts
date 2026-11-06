import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * bundle-sync (SPEC piano-bundle-sync v1.0.0):
 * - manifest canônico {schema,generatedAt,artifacts{catalog,bible{url,md5,bytes}}}
 * - estado por artifact {md5,checkedAtEpochMs,appliedAtEpochMs,schema:1} persistente
 * - 24h: <24h faz 0 GET manifest; >=24h faz 1; sync manual força
 * - MD5 igual → 0 GET do ZIP; MD5 novo → 1 GET, valida, aplica atômico, persiste
 * - manifest inválido (schema!=1, md5 fora de /^[a-f0-9]{32}$/, bytes<=0,
 *   url fora de /db/, artifact faltando, URL cross-origin) → rejeita sem tocar cache
 * - ZIP truncado/inválido/traversal/JSON inválido → estado e cache anterior intactos
 * - 429 respeita Retry-After; falha de bundle NÃO dispara varredura legado
 */

type ManifestArtifact = { url: string; md5: string; bytes: number }

export function makeManifest(
  catalog: ManifestArtifact,
  bible: ManifestArtifact,
  schema = 1,
): unknown {
  return {
    schema,
    generatedAt: '2026-11-05T00:00:00Z',
    artifacts: { catalog, bible },
  }
}

const OK_MD5_A = 'a'.repeat(32)
const OK_MD5_B = 'b'.repeat(32)

function zipResponse(bytes: Uint8Array, status = 200, headers: Record<string, string> = {}) {
  return new Response(bytes as unknown as ArrayBuffer, {
    status,
    headers: { 'Content-Type': 'application/zip', ...headers },
  })
}

function jsonStatusResponse(status: number, headers: Record<string, string> = {}) {
  return new Response('{}', { status, headers })
}

/** ZIP mínimo válido com entradas JSON UTF-8. */
async function makeZip(entries: Record<string, unknown>): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) {
    files[name] = strToU8(JSON.stringify(value))
  }
  const zipped = zipSync(files, { level: 0 })
  return new Uint8Array(zipped)
}

async function md5Of(bytes: Uint8Array): Promise<string> {
  const { default: crypto2 } = (await import('node:crypto')) as never as {
    default: typeof import('node:crypto')
  }
  return crypto2.createHash('md5').update(bytes).digest('hex')
}

// Stub do storage persistente
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
}

let localStorageMock: MemoryStorage
let fetchMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>

type BundleSync = typeof import('./bundle-sync')

async function load(): Promise<BundleSync> {
  vi.resetModules()
  return import('./bundle-sync')
}

const ORIGIN = 'https://api.pianolouvorja.com.br'

async function prime(
  bs: BundleSync,
  opts: {
    state?: Record<string, unknown>
    cache?: Record<string, unknown>
    envDatabase?: string
  } = {},
): Promise<void> {
  if (opts.envDatabase !== undefined) {
    vi.stubEnv('VITE_URL_DATABASE', opts.envDatabase)
  }
  if (opts.state) {
    for (const [k, v] of Object.entries(opts.state)) {
      localStorageMock.setItem(`piano:bundle-sync:state:${k}`, JSON.stringify(v))
    }
  }
  if (opts.cache) {
    const snapshots: Record<'catalog' | 'bible', Record<string, string>> = { catalog: {}, bible: {} }
    for (const [k, v] of Object.entries(opts.cache)) {
      const kind: 'catalog' | 'bible' = k.startsWith('bible_') ? 'bible' : 'catalog'
      snapshots[kind][k] = JSON.stringify(v)
    }
    for (const kind of ['catalog', 'bible'] as const) {
      if (Object.keys(snapshots[kind]).length) {
        localStorageMock.setItem(`piano:bundle:${kind}`, JSON.stringify(snapshots[kind]))
      }
    }
  }
  void bs
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorageMock = new MemoryStorage()
  vi.stubGlobal('localStorage', localStorageMock)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  warnSpy.mockRestore()
})

describe('bundle-sync — parseManifest (ADR-01)', () => {
  it.each([
    ['schema != 1', makeManifest(
      { url: '/db/catalog-bundle', md5: OK_MD5_A, bytes: 5 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
      2,
    )],
    ['md5 não é 32 hex lowercase', makeManifest(
      { url: '/db/catalog-bundle', md5: 'XYZ', bytes: 5 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
    )],
    ['md5 uppercase rejeitado', makeManifest(
      { url: '/db/catalog-bundle', md5: OK_MD5_A.toUpperCase(), bytes: 5 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
    )],
    ['bytes <= 0', makeManifest(
      { url: '/db/catalog-bundle', md5: OK_MD5_A, bytes: 0 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
    )],
    ['URL não é caminho /db/', makeManifest(
      { url: 'https://evil.example/db/catalog-bundle', md5: OK_MD5_A, bytes: 5 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
    )],
    ['URL cross-origin no campo url', makeManifest(
      { url: '//evil.example/catalog-bundle', md5: OK_MD5_A, bytes: 5 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 5 },
    )],
    ['artifact faltando', { schema: 1, generatedAt: 'x', artifacts: { catalog: { url: '/db/catalog-bundle', md5: OK_MD5_A, bytes: 5 } } }],
  ])('rejeita manifest: %s', async (_label, manifest) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }))
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1) // só o manifest; ZIP nunca baixado
  })

  it('manifest válido → ok=true e nenhuma entrada cross-origin segue', async () => {
    const zipBytes = await makeZip({ 'pt_musics.json': [1] })
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: await md5Of(zipBytes), bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: await md5Of(zipBytes), bytes: zipBytes.byteLength },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) {
        return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      }
      return Promise.resolve(zipResponse(zipBytes))
    })
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.filter((u) => u.endsWith('/db/manifest')).length).toBe(1)
    expect(calls.every((u) => u.startsWith('/db/') || new URL(u).pathname.startsWith('/db/'))).toBe(true)
  })
})

describe('bundle-sync — gate 24h (RF-01)', () => {
  it('boot <24h sem ação manual → 0 GET', async () => {
    const bs = await load()
    await prime(bs, {
      state: {
        catalog: { md5: OK_MD5_A, checkedAtEpochMs: Date.now(), appliedAtEpochMs: Date.now(), schema: 1 },
        bible: { md5: OK_MD5_B, checkedAtEpochMs: Date.now(), appliedAtEpochMs: Date.now(), schema: 1 },
      },
    })
    await bs.checkForUpdates()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('boot >=24h → 1 GET manifest por tipo', async () => {
    const bs = await load()
    const old = Date.now() - 25 * 60 * 60 * 1000
    await prime(bs, {
      state: {
        catalog: { md5: OK_MD5_A, checkedAtEpochMs: old, appliedAtEpochMs: old, schema: 1 },
        bible: { md5: OK_MD5_B, checkedAtEpochMs: old, appliedAtEpochMs: old, schema: 1 },
      },
    })
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: OK_MD5_A, bytes: 1 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }))
    await bs.checkForUpdates()
    expect(fetchMock).toHaveBeenCalledTimes(1) // 1 manifest; MD5 iguais → 0 ZIP
  })

  it('sem estado no catalog → primeiro sync faz manifest e baixa só o ZIP pendente', async () => {
    const bs = await load()
    const now = Date.now()
    await prime(bs, {
      state: {
        bible: { md5: OK_MD5_B, checkedAtEpochMs: now, appliedAtEpochMs: now, schema: 1 },
      },
    })
    const zipBytes = await makeZip({
      '_bundle_manifest.json': { schema_version: 1, kind: 'catalog', files: [{ name: 'pt_musics.json', bytes: 2, sha256: 'x'.repeat(64) }] },
      'pt_musics.json': [{ id_music: 1 }],
    })
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 999 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) {
        return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      }
      if (url.endsWith('/db/catalog-bundle')) {
        return Promise.resolve(zipResponse(zipBytes))
      }
      throw new Error(`URL inesperada: ${url}`)
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.filter((u) => u.endsWith('/db/manifest')).length).toBe(1)
    expect(calls.filter((u) => u.endsWith('/db/catalog-bundle')).length).toBe(1)
    // estado persistido só depois da aplicação
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.md5).toBe(zipMd5)
    expect(state.appliedAtEpochMs).toBeGreaterThan(0)
    // snapshot persistente alimentado com chave canônica
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).not.toBeNull()
  })
})

describe('bundle-sync — atomicidade (RF-05 / PLAN RED-4)', () => {
  it('ZIP truncado/corrompido → estado e cache anteriores intactos', async () => {
    const bs = await load()
    const old = { md5: 'c'.repeat(32), checkedAtEpochMs: 1, appliedAtEpochMs: 1, schema: 1 }
    await prime(bs, {
      state: { catalog: old },
      cache: { pt_musics: [{ id_music: 42 }] },
    })
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: 'd'.repeat(32), bytes: 1000 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) {
        return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      }
      return Promise.resolve(zipResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))) // lixo truncado
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    // MD5 anterior e appliedAt preservados; cache intacto (checagem atualiza checkedAt — tentativa registrada)
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.md5).toBe('c'.repeat(32))
    expect(state.appliedAtEpochMs).toBe(1)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).toEqual([{ id_music: 42 }])
  })

  it('MD5 dos bytes não bate com o manifest → descarta, não aplica', async () => {
    const bs = await load()
    const zipBytes = await makeZip({ 'pt_musics.json': [{ id_music: 7 }] })
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: 'e'.repeat(32), bytes: zipBytes.byteLength }, // md5 mentiroso
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(zipBytes))
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    // nada aplicado: appliedAt=0 e nenhum cache criado (só registro de tentativa)
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.appliedAtEpochMs).toBe(0)
    expect(state.md5).toBe('')
    expect(localStorageMock.getItem('piano:bundle:catalog:pt_musics')).toBeNull()
  })

  it('ZIP com caminho traversal/absoluto → todo bundle inválido', async () => {
    const bs = await load()
    const zipBytes = await makeZip({ '../evil.json': { a: 1 }, 'pt_musics.json': [1] })
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(zipBytes))
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    const stateTraversal = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(stateTraversal.appliedAtEpochMs).toBe(0)
    expect(localStorageMock.getItem('piano:bundle:catalog:pt_musics')).toBeNull()
  })

  it('JSON inválido dentro do ZIP → bundle rejeitado integralmente', async () => {
    const bs = await load()
    const { strToU8, zipSync } = await import('fflate')
    const zipped = zipSync({
      'pt_musics.json': strToU8('{quebrado'),
    }, { level: 0 })
    const zipBytes = new Uint8Array(zipped)
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(zipBytes))
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    const stateJson = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(stateJson.appliedAtEpochMs).toBe(0)
    expect(localStorageMock.getItem('piano:bundle:catalog:pt_musics')).toBeNull()
  })

  it('crash simulado antes do commit → versão anterior sobrevive (reload)', async () => {
    const bs = await load()
    const old = { md5: 'f'.repeat(32), checkedAtEpochMs: 5, appliedAtEpochMs: 5, schema: 1 }
    await prime(bs, { state: { catalog: old }, cache: { pt_categories: [{ id: 1 }] } })
    const zipBytes = await makeZip({ 'pt_musics.json': [{ id_music: 9 }] })
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(new Response(zipBytes as unknown as ArrayBuffer, { status: 200 })) // corpo válido mas commit vai falhar
    })
    // simula crash: storage falha no setItem durante aplicação do CACHE (estado via writeState vem depois)
    const spy = vi.spyOn(localStorageMock, 'setItem').mockImplementation((key: string) => {
      if (key.startsWith('piano:bundle:')) throw new Error('quota/crash')
    })
    const result = await bs.checkForUpdates({ force: true })
    spy.mockRestore()
    expect(result.ok).toBe(false)
    // reload: estado antigo e cache antigo intactos
    expect(JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '')).toEqual(old)
    expect(bs.readCachedBundleJson('catalog', 'pt_categories')).toEqual([{ id: 1 }])
  })
})

describe('bundle-sync — erros e fallback lazy (ADR-03 / RF-06)', () => {
  it('404 no manifest → bundle indisponível, cache preservado, 0 requests legado', async () => {
    const bs = await load()
    await prime(bs, { cache: { pt_musics: [{ id_music: 3 }] } })
    fetchMock.mockResolvedValue(jsonStatusResponse(404))
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).not.toBeNull()
  })

  it('429 respeita Retry-After e NÃO repete antes de 24h', async () => {
    vi.useFakeTimers()
    try {
      const bs = await load()
      fetchMock.mockResolvedValue(new Response('{}', {
        status: 429,
        headers: { 'Retry-After': '120' },
      }))
      const result = await bs.checkForUpdates({ force: true })
      expect(result.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // tentativa registrada: nova checagem automática antes de 24h → 0 requests
      await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000)
      fetchMock.mockClear()
      await bs.checkForUpdates()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('5xx → 1 tentativa controlada, cache mantido', async () => {
    const bs = await load()
    await prime(bs, { cache: { pt_musics: [{ id_music: 3 }] } })
    fetchMock.mockResolvedValue(jsonStatusResponse(503))
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).not.toBeNull()
  })
})

describe('bundle-sync — origem (ADR-04 / RF-08)', () => {
  it('bundle URL deriva da origem VITE_URL_DATABASE, não de /json_db concatenado', async () => {
    const bs = await load()
    const zipBytes = await makeZip({ 'pt_musics.json': [{ id_music: 1 }] })
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(zipBytes))
    })
    await prime(bs, { envDatabase: 'https://db.pianolouvorja.com/json_db' })
    await bs.checkForUpdates({ force: true })
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls[0]).toBe('https://db.pianolouvorja.com/db/manifest')
    expect(calls.some((u) => u.startsWith('https://db.pianolouvorja.com/db/catalog-bundle'))).toBe(true)
    expect(calls.some((u) => u.includes('/json_db/db/'))).toBe(false)
  })

  it('bible bundle alimenta chaves bible_<v>_<b>_<c> (RF-04)', async () => {
    const bs = await load()
    const zipBytes = await makeZip({
      'bible_10_1_1.json': { 1: 'No princípio' },
      'pt_bible_book.json': [{ id_bible_book: 1, name: 'Gênesis' }],
    })
    const zipMd5 = await md5Of(zipBytes)
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
      { url: '/db/bible-bundle', md5: zipMd5, bytes: zipBytes.byteLength },
    )
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(zipBytes))
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    expect(bs.readCachedBundleJson('bible', 'bible_10_1_1')).not.toBeNull()
    expect(bs.readCachedBundleJson('bible', 'pt_bible_book')).not.toBeNull()
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:bible') ?? '{}')
    expect(state.md5).toBe(zipMd5)
  })

  it('MD5 do bible igual ao estado → 0 GET do ZIP (RF-02)', async () => {
    const bs = await load()
    const now = Date.now() - 25 * 60 * 60 * 1000
    await prime(bs, {
      state: {
        catalog: { md5: OK_MD5_A, checkedAtEpochMs: now, appliedAtEpochMs: now, schema: 1 },
        bible: { md5: OK_MD5_B, checkedAtEpochMs: now, appliedAtEpochMs: now, schema: 1 },
      },
    })
    const manifest = makeManifest(
      { url: '/db/catalog-bundle', md5: OK_MD5_A, bytes: 1 },
      { url: '/db/bible-bundle', md5: OK_MD5_B, bytes: 1 },
    )
    fetchMock.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }))
    await bs.checkForUpdates()
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.endsWith('/db/bible-bundle'))).toBe(false)
    expect(calls.some((u) => u.endsWith('/db/catalog-bundle'))).toBe(false)
  })
})

describe('bundle-sync — integração com readOrFetchCatalogJson (RF-03/RF-06)', () => {
  it('cache de bundle persistente alimenta a leitura sem request item-a-item', async () => {
    const bs = await load()
    await prime(bs, { cache: { music_7: [{ id_music: 7 }], bible_10_1_1: { 1: 'vers' } } })
    expect(bs.readCachedBundleJson('catalog', 'music_7')).toEqual([{ id_music: 7 }])
    expect(bs.readCachedBundleJson('bible', 'bible_10_1_1')).toEqual({ 1: 'vers' })
    expect(bs.readCachedBundleJson('catalog', 'missing')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
