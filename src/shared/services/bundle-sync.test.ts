import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

/**
 * bundle-sync (SPEC piano-bundle-sync v1.2.0 — contrato real upstream):
 * - GET /db/manifest = JSON ARRAY entry-wise {file, table, path, hash} (ADR-09)
 * - estado por artifact {manifestDigest, checkedAtEpochMs, appliedAtEpochMs, schema:2}
 * - 24h: <24h faz 0 requests; >=24h faz 1 GET manifest; force força
 * - digest entry-wise igual ao aplicado → 0 GET de ZIP (RF-20)
 * - digest divergiu → 1 GET do ZIP fixo, validação MD5 entry-wise (RF-21, ADR-10)
 * - manifest não-array/vazio/entry inválida/hash não-MD5/file duplicado/inseguro
 *   → sync aborta, cache mantido, 0 ZIP (RF-19)
 * - um único arquivo divergente invalida o ZIP inteiro; completude subset⊆ZIP;
 *   _bundle_manifest {schema_version:1, kind} obrigatório; essenciais no catalog
 * - origem /db/* é EXCLUSIVAMENTE VITE_URL_BUNDLES (ADR-11), nunca derivada de
 *   VITE_URL_DATABASE; nenhuma URL é tomada do payload (`path` é informativo)
 *
 * Fixtures derivadas de probe HTTP real (api.louvorja.com.br/db/*, 2026-11-06):
 * manifest array {file,table,path,hash}, hash = MD5 dos bytes do JSON no ZIP;
 * ZIP com _bundle_manifest.json {schema_version:1, kind, files[{name,bytes,sha256}]}.
 */

type ManifestEntry = { file: string; table: string; path: string; hash: string }
const md5Hex = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex')

async function makeZip(entries: Record<string, unknown>, kind: 'catalog' | 'bible' = 'catalog'): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  for (const [name, value] of Object.entries(entries)) {
    files[name] = strToU8(typeof value === 'string' ? value : JSON.stringify(value))
  }
  files['_bundle_manifest.json'] = strToU8(JSON.stringify({
    schema_version: 1,
    kind,
    files: Object.keys(entries).map((name) => ({ name, bytes: files[name].length, sha256: createHash('sha256').update(files[name]).digest('hex') })),
  }))
  return new Uint8Array(zipSync(files, { level: 0 }))
}

/** Cenário consistente: manifest array derivado dos bytes reais dos ZIPs. */
async function scenario(
  catalogFiles: Record<string, unknown>,
  bibleFiles: Record<string, unknown>,
  opts: { dropCatalogEntry?: string; corruptCatalog?: string } = {},
): Promise<{ manifest: ManifestEntry[]; catalogZip: Uint8Array; bibleZip: Uint8Array }> {
  const catalogZip = await makeZip(catalogFiles, 'catalog')
  const bibleZip = await makeZip(bibleFiles, 'bible')
  // Serialização idêntica ao makeZip para os hashes baterem:
  const { strToU8 } = await import('fflate')
  const entryFor = (file: string, value: unknown): ManifestEntry => {
    const bytes = strToU8(typeof value === 'string' ? value : JSON.stringify(value))
    return { file, table: file.replace(/\.json$/, ''), path: `/db/${file.replace(/\.json$/, '')}`, hash: md5Hex(bytes) }
  }
  let manifest: ManifestEntry[] = [
    ...Object.entries(catalogFiles).map(([f, v]) => entryFor(f, v)),
    ...Object.entries(bibleFiles).map(([f, v]) => entryFor(f, v)),
  ]
  if (opts.corruptCatalog) {
    manifest = manifest.map((e) => (e.file === opts.corruptCatalog ? { ...e, hash: md5Hex(strToU8('adulterado')) } : e))
  }
  if (opts.dropCatalogEntry) {
    manifest = manifest.filter((e) => e.file !== opts.dropCatalogEntry)
  }
  return { manifest, catalogZip, bibleZip }
}

function zipResponse(bytes: Uint8Array, status = 200, headers: Record<string, string> = {}) {
  return new Response(bytes as unknown as ArrayBuffer, {
    status,
    headers: { 'Content-Type': 'application/zip', ...headers },
  })
}

function jsonStatusResponse(status: number, headers: Record<string, string> = {}) {
  return new Response('{}', { status, headers })
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

async function prime(
  bs: BundleSync,
  opts: {
    state?: Record<string, unknown>
    cache?: Record<string, unknown>
    envBundles?: string
    envDatabase?: string
  } = {},
): Promise<void> {
  void bs
  if (opts.envBundles !== undefined) vi.stubEnv('VITE_URL_BUNDLES', opts.envBundles)
  if (opts.envDatabase !== undefined) vi.stubEnv('VITE_URL_DATABASE', opts.envDatabase)
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

const SCHEMA_2 = (digest: string, checkedAt = Date.now(), appliedAt = checkedAt) => ({
  manifestDigest: digest,
  checkedAtEpochMs: checkedAt,
  appliedAtEpochMs: appliedAt,
  schema: 2,
})

const MIN_CATALOG = {
  'pt_categories.json': [{ id: 1 }],
  'pt_musics.json': [{ id_music: 1 }],
  'config.json': { version: 1 },
}
const MIN_BIBLE = { 'bible_10_100_1.json': { 1: 'No princípio' } }

function wireFetch(manifest: unknown, catalogZip: Uint8Array, bibleZip: Uint8Array): void {
  fetchMock.mockImplementation((input: string | URL): Promise<Response> => {
    const url = String(input)
    if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
    if (url.endsWith('/db/catalog-bundle')) return Promise.resolve(zipResponse(catalogZip))
    if (url.endsWith('/db/bible-bundle')) return Promise.resolve(zipResponse(bibleZip))
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
}

describe('bundle-sync — parseManifest entry-wise (ADR-09 / RF-19)', () => {
  it('manifest array válido → ok, subset catalog e bible particionados', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    wireFetch(manifest, catalogZip, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.applied.sort()).toEqual(['bible', 'catalog'])
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).toEqual([{ id_music: 1 }])
    expect(bs.readCachedBundleJson('catalog', 'config')).toEqual({ version: 1 })
    expect(bs.readCachedBundleJson('bible', 'bible_10_100_1')).toEqual({ 1: 'No princípio' })
  })

  it.each([
    ['não é array', { schema: 1 }],
    ['array vazio', []],
    ['entry não é objeto', [1]],
    ['hash não MD5', [{ file: 'pt_musics.json', table: 'pt_musics', path: '/db/pt_musics', hash: 'XYZ' }]],
    ['file duplicado', [
      { file: 'pt_musics.json', table: 'pt_musics', path: '/db/pt_musics', hash: 'a'.repeat(32) },
      { file: 'pt_musics.json', table: 'pt_musics', path: '/db/pt_musics', hash: 'a'.repeat(32) },
    ]],
    ['file com traversal', [{ file: '../evil.json', table: 'evil', path: '/db/evil', hash: 'a'.repeat(32) }]],
    ['file sem .json', [{ file: 'pt_musics', table: 'pt_musics', path: '/db/pt_musics', hash: 'a'.repeat(32) }]],
    ['hash uppercase', [{ file: 'pt_musics.json', table: 'pt_musics', path: '/db/pt_musics', hash: 'A'.repeat(32) }]],
    ['campos faltando', [{ file: 'pt_musics.json', hash: 'a'.repeat(32) }]],
  ])('manifest inválido (%s) → sync aborta, 1 request só (0 ZIP)', async (_label: string, manifest: unknown) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }))
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('bundle-sync — gate condicional por digest (ADR-09 / RF-20)', () => {
  it('digest calculado = SHA-256 das linhas file\\tmd5\\n ordenadas por file', async () => {
    const { manifest } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const bs = await load()
    const catalogEntries = manifest.filter((e) => !e.file.startsWith('bible_'))
    const digest = await bs.manifestDigest(catalogEntries)
    const canonical = [...catalogEntries]
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
      .map((e) => `${e.file}\t${e.hash}\n`).join('')
    expect(digest).toBe(createHash('sha256').update(canonical).digest('hex'))
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    // ordem de entrada não muda o digest
    const shuffled = await bs.manifestDigest([...catalogEntries].reverse())
    expect(shuffled).toBe(digest)
    // um hash mudando muda o digest
    const altered = await bs.manifestDigest([{ ...catalogEntries[0], hash: 'f'.repeat(32) }, ...catalogEntries.slice(1)])
    expect(altered).not.toBe(digest)
  })

  it('<24h → 0 requests', async () => {
    const { manifest } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const bs = await load()
    const catDigest = await bs.manifestDigest(manifest.filter((e) => !e.file.startsWith('bible_')))
    const bibDigest = await bs.manifestDigest(manifest.filter((e) => e.file.startsWith('bible_')))
    await prime(bs, { state: { catalog: SCHEMA_2(catDigest), bible: SCHEMA_2(bibDigest) } })
    await bs.checkForUpdates()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('≥24h com digest igual → 1 GET manifest, 0 GET de ZIP, só checkedAt muda', async () => {
    const { manifest } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const bs = await load()
    const catDigest = await bs.manifestDigest(manifest.filter((e) => !e.file.startsWith('bible_')))
    const bibDigest = await bs.manifestDigest(manifest.filter((e) => e.file.startsWith('bible_')))
    const appliedAt = 12345
    await prime(bs, {
      state: {
        catalog: SCHEMA_2(catDigest, Date.now() - 25 * 60 * 60 * 1000, appliedAt),
        bible: SCHEMA_2(bibDigest, Date.now() - 25 * 60 * 60 * 1000, appliedAt),
      },
    })
    fetchMock.mockResolvedValue(new Response(JSON.stringify(manifest), { status: 200 }))
    const result = await bs.checkForUpdates()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.applied).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1) // só o manifest
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.manifestDigest).toBe(catDigest)
    expect(state.appliedAtEpochMs).toBe(appliedAt)
    expect(state.schema).toBe(2)
  })
})

describe('bundle-sync — cold/changed e validação entry-wise (ADR-10 / RF-21)', () => {
  it('sem estado → 1 manifest + 1 ZIP por artifact; estado gravado SÓ depois da aplicação', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    fetchMock.mockImplementation((input: string | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      if (url.endsWith('/db/catalog-bundle')) {
        // estado ainda não pode existir ANTES do commit
        expect(localStorageMock.getItem('piano:bundle-sync:state:catalog')).toBeNull()
        return Promise.resolve(zipResponse(catalogZip))
      }
      if (url.endsWith('/db/bible-bundle')) return Promise.resolve(zipResponse(bibleZip))
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.manifestDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(state.appliedAtEpochMs).toBeGreaterThan(0)
    expect(state.schema).toBe(2)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).not.toBeNull()
  })

  it('um arquivo com MD5 divergente do manifest → invalida o ZIP INTEIRO', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE, { corruptCatalog: 'pt_musics.json' })
    wireFetch(manifest, catalogZip, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(localStorageMock.getItem('piano:bundle:catalog')).toBeNull()
    const state = JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '{}')
    expect(state.appliedAtEpochMs ?? 0).toBe(0)
    expect(bs.readCachedBundleJson('bible', 'bible_10_100_1')).toEqual({ 1: 'No princípio' }) // bible ok
  })

  it('entry do subset ausente no ZIP (incompleto) → invalida', async () => {
    // ZIP sem pt_categories.json que o manifest anuncia
    const { manifest, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const partial = await makeZip({
      'pt_musics.json': [{ id_music: 1 }],
      'config.json': { version: 1 },
    }, 'catalog')
    wireFetch(manifest, partial, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(localStorageMock.getItem('piano:bundle:catalog')).toBeNull()
  })

  it('_bundle_manifest com kind errado → invalida', async () => {
    const { manifest, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const badKind = await makeZip(MIN_CATALOG, 'bible') // kind errado para o catalog
    wireFetch(manifest, badKind, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(localStorageMock.getItem('piano:bundle:catalog')).toBeNull()
  })

  it('essenciais ausentes no catalog ZIP (config) → invalida', async () => {
    const { manifest, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const noConfig = await makeZip({ 'pt_musics.json': [], 'pt_categories.json': [] }, 'catalog')
    const reduced = manifest.filter((e) => e.file !== 'config.json')
    wireFetch(reduced, noConfig, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(localStorageMock.getItem('piano:bundle:catalog')).toBeNull()
  })

  it('ZIP truncado → bundle rejeitado, cache anterior intacto (ADR-03)', async () => {
    const bs = await load()
    await prime(bs, { cache: { pt_musics: [{ id_music: 42 }] } })
    const { manifest } = await scenario(MIN_CATALOG, MIN_BIBLE)
    fetchMock.mockImplementation((input: string | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/db/manifest')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))
      return Promise.resolve(zipResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])))
    })
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).toEqual([{ id_music: 42 }])
  })

  it('crash antes do commit → versão anterior e digest antigos sobrevivem', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const old = SCHEMA_2('b'.repeat(64), 5, 5)
    const bs = await load()
    await prime(bs, { state: { catalog: old }, cache: { pt_musics: [{ id_music: 1 }] } })
    wireFetch(manifest, catalogZip, bibleZip)
    const spy = vi.spyOn(localStorageMock, 'setItem').mockImplementation((key: string) => {
      if (key.startsWith('piano:bundle:')) throw new Error('quota/crash')
    })
    const result = await bs.checkForUpdates({ force: true })
    spy.mockRestore()
    expect(result.ok).toBe(false)
    expect(JSON.parse(localStorageMock.getItem('piano:bundle-sync:state:catalog') ?? '')).toEqual(old)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).toEqual([{ id_music: 1 }])
  })
})

describe('bundle-sync — erros e fallback lazy (ADR-03)', () => {
  it('404 no manifest → cache preservado, 0 requests legado', async () => {
    const bs = await load()
    await prime(bs, { cache: { pt_musics: [{ id_music: 3 }] } })
    fetchMock.mockResolvedValue(jsonStatusResponse(404))
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bs.readCachedBundleJson('catalog', 'pt_musics')).not.toBeNull()
  })

  it('tentativa com falha inibe retry automático antes de 24h', async () => {
    vi.useFakeTimers()
    try {
      const bs = await load()
      fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
      const result = await bs.checkForUpdates({ force: true })
      expect(result.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000)
      fetchMock.mockClear()
      await bs.checkForUpdates()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('bundle-sync — origem dos bundles (ADR-11 / RF-22)', () => {
  it('default upstream quando VITE_URL_BUNDLES ausente; /db/* NUNCA usa VITE_URL_DATABASE', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    wireFetch(manifest, catalogZip, bibleZip)
    const bs = await load()
    await prime(bs, { envDatabase: 'https://api.pianolouvorja.com.br/json_db' })
    await bs.checkForUpdates({ force: true })
    const calls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((u: string) => u.startsWith('https://api.louvorja.com.br/db/'))).toBe(true)
    expect(calls.some((u: string) => u.includes('pianolouvorja'))).toBe(false)
  })

  it('override de VITE_URL_BUNDLES muda a origem de /db/*', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    wireFetch(manifest, catalogZip, bibleZip)
    const bs = await load()
    await prime(bs, { envBundles: 'https://bundles.example.com' })
    await bs.checkForUpdates({ force: true })
    const calls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calls[0]).toBe('https://bundles.example.com/db/manifest')
    expect(calls.every((u: string) => u.startsWith('https://bundles.example.com/db/'))).toBe(true)
  })

  it('nenhuma URL é tomada do payload (path/table hostis ignorados)', async () => {
    const { manifest, catalogZip, bibleZip } = await scenario(MIN_CATALOG, MIN_BIBLE)
    const hostile = manifest.map((e, i) => (i === 0 ? { ...e, path: 'https://evil.example/db/pt_musics', table: 'https://evil.example' } : e))
    wireFetch(hostile, catalogZip, bibleZip)
    const bs = await load()
    await bs.checkForUpdates({ force: true })
    const calls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calls.every((u: string) => !u.includes('evil.example'))).toBe(true)
  })
})

describe('bundle-sync — chaves bible 3 segmentos e paridade de leitura (RF-03/RF-04)', () => {
  it('bible_10_100_1 alimenta o cache bible; pt_bible_book vai ao catalog', async () => {
    const catalogFiles = {
      'pt_bible_book.json': [{ id_bible_book: 1, name: 'Gênesis' }],
      'pt_musics.json': [],
      'pt_categories.json': [],
      'config.json': {},
    }
    const bibleFiles = { 'bible_10_100_1.json': { 1: 'No princípio' }, 'bible_10_100_2.json': { 1: 'v2' } }
    const { manifest, catalogZip, bibleZip } = await scenario(catalogFiles, bibleFiles)
    wireFetch(manifest, catalogZip, bibleZip)
    const bs = await load()
    const result = await bs.checkForUpdates({ force: true })
    expect(result.ok).toBe(true)
    expect(bs.readCachedBundleJson('bible', 'bible_10_100_1')).toEqual({ 1: 'No princípio' })
    expect(bs.readCachedBundleJson('catalog', 'pt_bible_book')).toEqual([{ id_bible_book: 1, name: 'Gênesis' }])
  })

  it('cache de bundle persistente alimenta a leitura sem request', async () => {
    const bs = await load()
    await prime(bs, { cache: { music_7: [{ id_music: 7 }], bible_10_100_1: { 1: 'vers' } } })
    expect(bs.readCachedBundleJson('catalog', 'music_7')).toEqual([{ id_music: 7 }])
    expect(bs.readCachedBundleJson('bible', 'bible_10_100_1')).toEqual({ 1: 'vers' })
    expect(bs.readCachedBundleJson('catalog', 'missing')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
