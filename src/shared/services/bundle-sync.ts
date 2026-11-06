/** Bundle-first catálogo/Bíblia. SPEC v1.0.0 ADR-01..04. */

type ManifestArtifact = { url: string; md5: string; bytes: number }
export type BundleManifest = {
  schema: number
  generatedAt: string
  artifacts: { catalog: ManifestArtifact; bible: ManifestArtifact }
}
export type BundleArtifactState = {
  md5: string
  checkedAtEpochMs: number
  appliedAtEpochMs: number
  schema: 1
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

/** Deriva /db da mesma origem de VITE_URL_DATABASE, inclusive /json_db legado. */
export function databaseOrigin(): string {
  const base = import.meta.env.VITE_URL_DATABASE
  if (typeof base !== 'string' || !base.trim()) return ''
  try { return new URL(base.trim()).origin } catch { return '' }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rejeita manifest fora do contrato; URL nunca pode mudar a origem. */
export function parseManifest(raw: unknown): BundleManifest | null {
  if (!isPlainObject(raw) || raw.schema !== 1 || typeof raw.generatedAt !== 'string' || !raw.generatedAt || !isPlainObject(raw.artifacts)) return null
  const parse = (value: unknown): ManifestArtifact | null => {
    if (!isPlainObject(value) || typeof value.url !== 'string' || typeof value.md5 !== 'string' || typeof value.bytes !== 'number') return null
    if (!value.url.startsWith('/db/') || value.url.includes('//') || !MD5_PATTERN.test(value.md5) || !(value.bytes > 0)) return null
    return { url: value.url, md5: value.md5, bytes: value.bytes }
  }
  const catalog = parse(raw.artifacts.catalog)
  const bible = parse(raw.artifacts.bible)
  return catalog && bible ? { schema: 1, generatedAt: raw.generatedAt, artifacts: { catalog, bible } } : null
}

function readState(kind: BundleKind): BundleArtifactState | null {
  try {
    const state: unknown = JSON.parse(localStorage.getItem(`${STATE_PREFIX}${kind}`) ?? 'null')
    return isPlainObject(state)
      && typeof state.md5 === 'string'
      && typeof state.checkedAtEpochMs === 'number'
      && typeof state.appliedAtEpochMs === 'number'
      && state.schema === 1
      ? state as BundleArtifactState
      : null
  } catch { return null }
}

function putState(kind: BundleKind, md5: string, applied: boolean): void {
  const prior = readState(kind)
  const now = Date.now()
  localStorage.setItem(`${STATE_PREFIX}${kind}`, JSON.stringify({
    md5,
    checkedAtEpochMs: now,
    appliedAtEpochMs: applied ? now : prior?.appliedAtEpochMs ?? 0,
    schema: 1,
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

async function stageBundle(kind: BundleKind, buffer: ArrayBuffer, artifact: ManifestArtifact): Promise<Record<string, string>> {
  if (buffer.byteLength !== artifact.bytes) throw new Error('bundle-size-mismatch')
  const { md5Hex } = await import('./md5')
  if (md5Hex(new Uint8Array(buffer)) !== artifact.md5) throw new Error('bundle-md5-mismatch')

  const { unzip, strFromU8 } = await import('fflate')
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(buffer), (error, files) => error ? reject(error) : resolve(files))
  })
  const staged: Record<string, string> = {}
  for (const [name, content] of Object.entries(entries)) {
    if (!name.endsWith('.json') || name.startsWith('/') || name.includes('..') || name.includes('\\') || name.includes('//')) throw new Error('bundle-path-forbidden')
    const key = name.slice(0, -'.json'.length)
    const text = strFromU8(content)
    try { JSON.parse(text) } catch { throw new Error('bundle-json-invalid') }
    if (Object.hasOwn(staged, key)) throw new Error('bundle-key-duplicate')
    staged[key] = text
  }
  if (Object.keys(staged).length === 0) throw new Error('bundle-empty')
  return staged
}

function headers(): Record<string, string> | undefined {
  const token = import.meta.env.VITE_API_TOKEN
  return typeof token === 'string' && token ? { 'Api-Token': token } : undefined
}

async function fetchManifest(): Promise<BundleManifest> {
  const response = await fetch(`${databaseOrigin()}/db/manifest`, { headers: headers() })
  if (!response.ok) throw new Error(`manifest-${response.status}`)
  const manifest = parseManifest(await response.json())
  if (!manifest) throw new Error('manifest-invalid')
  return manifest
}

/** Inicialização/ação manual. Falha preserva snapshot e inibe retry automático 24h. */
export async function checkForUpdates(options: { force?: boolean } = {}): Promise<CheckResult> {
  const kinds: BundleKind[] = ['catalog', 'bible']
  const due = kinds.filter((kind) => options.force || shouldCheck(kind))
  if (!due.length) return { ok: true, checked: [], applied: [] }

  let manifest: BundleManifest
  try { manifest = await fetchManifest() } catch (error) {
    for (const kind of due) putState(kind, readState(kind)?.md5 ?? '', false)
    return { ok: false, reason: error instanceof Error ? error.message : 'manifest-network-error' }
  }

  const applied: BundleKind[] = []
  let failed = false
  for (const kind of due) {
    const artifact = manifest.artifacts[kind]
    if (readState(kind)?.md5 === artifact.md5) {
      putState(kind, artifact.md5, false)
      continue
    }
    try {
      const response = await fetch(`${databaseOrigin()}${artifact.url}`, { headers: headers() })
      if (!response.ok) throw new Error(`bundle-${response.status}`)
      const type = response.headers.get('Content-Type') ?? ''
      if (!type.toLowerCase().startsWith('application/zip')) throw new Error('bundle-content-type')
      const snapshot = await stageBundle(kind, await response.arrayBuffer(), artifact)
      // Atomicidade: snapshot novo entra numa única operação; state só depois.
      localStorage.setItem(CACHE_KEY[kind], JSON.stringify(snapshot))
      putState(kind, artifact.md5, true)
      applied.push(kind)
    } catch (error) {
      failed = true
      putState(kind, readState(kind)?.md5 ?? '', false)
      console.warn(`[bundle-sync] ${kind} indisponível`, error)
    }
  }
  return failed ? { ok: false, reason: 'bundle-apply-failed' } : { ok: true, checked: due, applied }
}
