/**
 * Bundle-first sync — SPEC piano-bundle-sync v1.2.0 (ADR-09/10/11; ADR-02/03 v1.0.0 intactos).
 *
 * Contrato real do upstream (api.louvorja.com.br):
 *   GET {VITE_URL_BUNDLES}/db/manifest → 200 JSON **array** de entries
 *     {file, table, path, hash} — hash = MD5 32-hex do conteúdo do arquivo.
 *   GET {VITE_URL_BUNDLES}/db/catalog-bundle | /db/bible-bundle → 200 application/zip,
 *     ZIP com _bundle_manifest.json interno {schema_version:1, kind, files:[{name,bytes,sha256}]}.
 *
 * Fluxo por artifact (`catalog` | `bible`):
 *   1. Estado 24h: checkedAt < 24h e sem `force` => 0 requests.
 *   2. GET /db/manifest — validação estrita do array entry-wise (ADR-09):
 *      entry inválida, hash não-MD5, file duplicado/inseguro → sync aborta,
 *      cache mantido, 0 GET de ZIP. `path` é informativo: NUNCA vira URL.
 *   3. Digest condicional (ADR-09): SHA-256 da serialização canônica
 *      (linhas `file\tmd5\n` ordenadas byte-a-byte por file). Digest igual ao
 *      aplicado => atualiza só checkedAt, 0 GET do ZIP (RF-20).
 *   4. Digest divergiu => 1 GET do ZIP fixo do artifact (ADR-10): Content-Type
 *      zip, estrutura segura, _bundle_manifest presente, completude
 *      subset⊆ZIP, MD5 entry-wise (UM arquivo divergente invalida o ZIP
 *      inteiro), essenciais presentes. Estado novo SÓ depois da aplicação
 *      atômica (RF-21).
 *
 * Qualquer falha preserva snapshot e estado anteriores e inibe retry
 * automático por 24h (ADR-03 intacto). Origem /db/* é EXCLUSIVAMENTE
 * VITE_URL_BUNDLES (default público https://api.louvorja.com.br) — nunca
 * derivada de VITE_URL_DATABASE (ADR-11).
 */

type ManifestEntry = { file: string; hash: string }

export type BundleManifestEntry = ManifestEntry
export type BundleArtifactState = {
  manifestDigest: string
  checkedAtEpochMs: number
  appliedAtEpochMs: number
  schema: 2
}
export type BundleKind = 'catalog' | 'bible'
export type CheckResult =
  | { ok: true; checked: BundleKind[]; applied: BundleKind[] }
  | { ok: false; reason: string }

const STATE_PREFIX = 'piano:bundle-sync:state:'
const CACHE_KEY: Record<BundleKind, string> = {
  catalog: 'piano:bundle:catalog',
  bible: 'piano:bundle:bible',
}
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const MD5_PATTERN = /^[a-f0-9]{32}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/

/** ADR-11: origem /db/* própria, nunca derivada de VITE_URL_DATABASE. */
export const DEFAULT_BUNDLES_ORIGIN = 'https://api.louvorja.com.br'

export function bundlesOrigin(): string {
  const raw = import.meta.env.VITE_URL_BUNDLES
  if (typeof raw === 'string' && raw.trim()) {
    try { return new URL(raw.trim()).origin } catch { /* cai no default */ }
  }
  return DEFAULT_BUNDLES_ORIGIN
}

/** Subsets por artifact sobre a CHAVE = file sem .json (ADR-09). */
const CATALOG_KEY_PATTERN =
  /^(?:pt|es)_(?:categories|musics|hymnal|hymnal_\d+|bible_book|bible_version)$|^music_\d+$|^album_\d+$|^config$/
const BIBLE_KEY_PATTERN = /^bible_[a-z0-9]+_\d+_\d+$/

export function bundleKeyPattern(kind: BundleKind): RegExp {
  return kind === 'catalog' ? CATALOG_KEY_PATTERN : BIBLE_KEY_PATTERN
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeJsonName(file: string): boolean {
  return (
    file.endsWith('.json')
    && !file.includes('/')
    && !file.includes('..')
    && !file.includes('\\')
    && !/[\x00-\x1f]/.test(file)
  )
}

/** ADR-09: valida o array entry-wise inteiro; 1 violação invalida TUDO. */
export function parseManifest(raw: unknown): { catalog: ManifestEntry[]; bible: ManifestEntry[] } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const catalog: ManifestEntry[] = []
  const bible: ManifestEntry[] = []
  const seen = new Set<string>()
  const catPattern = bundleKeyPattern('catalog')
  const bibPattern = bundleKeyPattern('bible')
  for (const entry of raw) {
    if (!isPlainObject(entry)) return null
    const { file, hash } = entry as Record<string, unknown>
    // `table`/`path` são informativos — apenas conferimos tipos para não
    // propagar lixo; NUNCA derivamos URL deles (ADR-09).
    if (typeof entry.table !== 'string' || typeof entry.path !== 'string') return null
    if (typeof file !== 'string' || typeof hash !== 'string') return null
    if (!isSafeJsonName(file) || !MD5_PATTERN.test(hash)) return null
    if (seen.has(file)) return null
    seen.add(file)
    const key = file.slice(0, -'.json'.length)
    if (catPattern.test(key)) catalog.push({ file, hash })
    else if (bibPattern.test(key)) bible.push({ file, hash })
    // fora dos padrões: ignorado sem falha (ADR-09)
  }
  if (!catalog.length || !bible.length) return null
  return { catalog, bible }
}

/** Digest canônico: linhas `file\tmd5\n` ordenadas byte-a-byte por file (UTF-8). */
export async function manifestDigest(entries: ManifestEntry[]): Promise<string> {
  const canonical = [...entries]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((e) => `${e.file}\t${e.hash}\n`)
    .join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readState(kind: BundleKind): BundleArtifactState | null {
  try {
    const state: unknown = JSON.parse(localStorage.getItem(`${STATE_PREFIX}${kind}`) ?? 'null')
    // digest '' = tentativa com falha (sem aplicação ainda) — válido só para inibir retry <24h.
    return isPlainObject(state)
      && typeof state.manifestDigest === 'string'
      && (state.manifestDigest === '' || SHA256_PATTERN.test(state.manifestDigest))
      && typeof state.checkedAtEpochMs === 'number'
      && typeof state.appliedAtEpochMs === 'number'
      && state.schema === 2
      ? state as BundleArtifactState
      : null
  } catch { return null }
}

function putState(kind: BundleKind, digest: string, applied: boolean): void {
  const prior = readState(kind)
  const now = Date.now()
  localStorage.setItem(`${STATE_PREFIX}${kind}`, JSON.stringify({
    manifestDigest: digest,
    checkedAtEpochMs: now,
    appliedAtEpochMs: applied ? now : prior?.appliedAtEpochMs ?? 0,
    schema: 2,
  } satisfies BundleArtifactState))
}

function shouldCheck(kind: BundleKind): boolean {
  const state = readState(kind)
  return !state || Date.now() - state.checkedAtEpochMs >= CHECK_INTERVAL_MS
}

/** Leitura offline do snapshot completo, um commit localStorage por artifact. */
export function readCachedBundleJson<T = unknown>(kind: BundleKind, key: string): T | null {
  try {
    const snapshot: unknown = JSON.parse(localStorage.getItem(CACHE_KEY[kind]) ?? 'null')
    if (!isPlainObject(snapshot) || typeof snapshot[key] !== 'string') return null
    return JSON.parse(snapshot[key]) as T
  } catch { return null }
}

/**
 * ADR-10: valida o ZIP em staging — estrutura segura, _bundle_manifest,
 * completude subset⊆ZIP, MD5 entry-wise (1 divergente invalida TUDO) e
 * essenciais. Um único problema descarta o bundle inteiro.
 */
async function stageBundle(
  kind: BundleKind,
  buffer: ArrayBuffer,
  entries: ManifestEntry[],
): Promise<Record<string, string>> {
  const { unzip, strFromU8 } = await import('fflate')
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(buffer), (error, data) => error ? reject(error) : resolve(data))
  })

  for (const name of Object.keys(files)) {
    if (name.startsWith('/') || name.includes('..') || name.includes('\\')) throw new Error('bundle-path-forbidden')
  }

  const bundleManifestRaw = files['_bundle_manifest.json']
  if (!bundleManifestRaw) throw new Error('bundle-manifest-missing')
  let bundleManifest: { schema_version?: unknown; kind?: unknown }
  try { bundleManifest = JSON.parse(strFromU8(bundleManifestRaw)) as typeof bundleManifest } catch { throw new Error('bundle-manifest-invalid') }
  if (bundleManifest.schema_version !== 1) throw new Error('bundle-manifest-schema')
  if (bundleManifest.kind !== kind) throw new Error('bundle-manifest-kind')

  const byFile = new Map(entries.map((e) => [e.file, e.hash]))
  const staged: Record<string, string> = {}
  for (const [name, content] of Object.entries(files)) {
    if (name === '_bundle_manifest.json') continue
    if (!name.endsWith('.json')) continue // fora do padrão: ignorado (ADR-10 item 6)
    const text = strFromU8(content)
    try { JSON.parse(text) } catch { throw new Error('bundle-json-invalid') }
    const expected = byFile.get(name)
    if (expected !== undefined) {
      const { md5Hex } = await import('./md5')
      if (md5Hex(content) !== expected) throw new Error('bundle-entry-md5-mismatch')
      if (Object.hasOwn(staged, name.slice(0, -'.json'.length))) throw new Error('bundle-key-duplicate')
      staged[name.slice(0, -'.json'.length)] = text
    }
  }

  // Completude: todo entry do subset do manifest precisa estar no ZIP (ADR-10 item 3).
  if (Object.keys(staged).length < entries.length) throw new Error('bundle-incomplete')

  // Essenciais (ADR-10 item 5).
  if (kind === 'catalog') {
    for (const essential of ['pt_categories', 'pt_musics', 'config']) {
      if (!(essential in staged)) throw new Error(`bundle-essential-missing:${essential}`)
    }
  } else if (!Object.keys(staged).some((key) => bundleKeyPattern('bible').test(key))) {
    throw new Error('bundle-essential-missing:chapter')
  }
  return staged
}

function headers(): Record<string, string> | undefined {
  const token = import.meta.env.VITE_API_TOKEN
  return typeof token === 'string' && token ? { 'Api-Token': token } : undefined
}

async function fetchManifest(): Promise<{ catalog: ManifestEntry[]; bible: ManifestEntry[] }> {
  const response = await fetch(`${bundlesOrigin()}/db/manifest`, { headers: headers() })
  if (!response.ok) throw new Error(`manifest-${response.status}`)
  const parsed = parseManifest(await response.json())
  if (!parsed) throw new Error('manifest-invalid')
  return parsed
}

/** Inicialização/ação manual. Falha preserva snapshot e inibe retry automático 24h. */
export async function checkForUpdates(options: { force?: boolean } = {}): Promise<CheckResult> {
  const kinds: BundleKind[] = ['catalog', 'bible']
  const due = kinds.filter((kind) => options.force || shouldCheck(kind))
  if (!due.length) return { ok: true, checked: [], applied: [] }

  let manifest: { catalog: ManifestEntry[]; bible: ManifestEntry[] }
  try { manifest = await fetchManifest() } catch (error) {
    // Registro da tentativa mesmo sem estado anterior (inibe retry <24h, ADR-03).
    for (const kind of due) {
      const prior = readState(kind)
      if (prior) putState(kind, prior.manifestDigest, false)
      else {
        const now = Date.now()
        localStorage.setItem(`${STATE_PREFIX}${kind}`, JSON.stringify({
          manifestDigest: '',
          checkedAtEpochMs: now,
          appliedAtEpochMs: 0,
          schema: 2,
        }))
      }
    }
    return { ok: false, reason: error instanceof Error ? error.message : 'manifest-network-error' }
  }

  const digests = {
    catalog: await manifestDigest(manifest.catalog),
    bible: await manifestDigest(manifest.bible),
  }

  const applied: BundleKind[] = []
  let failed = false
  for (const kind of due) {
    // RF-20: digest igual ao aplicado => atualiza só checkedAt, 0 GET de ZIP.
    if (readState(kind)?.manifestDigest === digests[kind]) {
      putState(kind, digests[kind], false)
      continue
    }
    try {
      const response = await fetch(`${bundlesOrigin()}/db/${kind}-bundle`, { headers: headers() })
      if (!response.ok) throw new Error(`bundle-${response.status}`)
      const type = response.headers.get('Content-Type') ?? ''
      if (!type.toLowerCase().includes('zip')) throw new Error('bundle-content-type')
      const snapshot = await stageBundle(kind, await response.arrayBuffer(), manifest[kind])
      // ADR-10: aplicação atômica — snapshot novo numa única operação; estado novo só depois.
      localStorage.setItem(CACHE_KEY[kind], JSON.stringify(snapshot))
      putState(kind, digests[kind], true)
      applied.push(kind)
    } catch (error) {
      failed = true
      const prior = readState(kind)
      if (prior) putState(kind, prior.manifestDigest, false)
      console.warn(`[bundle-sync] ${kind} indisponível`, error)
    }
  }
  return failed ? { ok: false, reason: 'bundle-apply-failed' } : { ok: true, checked: due, applied }
}
