import {
  EXECUTABLE_ITEM_TYPES,
  getTypeDotColor,
  INTERNAL_FILE_TYPES,
  LITURGY_ITEM_TYPE_META,
  LITURGY_ITEM_TYPES,
  MOMENT_DURATION_MAX_MS,
  MOMENT_DURATION_MIN_MS,
  type LiturgyItem,
  type LiturgyItemDraft,
  type LiturgyItemType,
  type LiturgyMusicOption,
  type LiturgyBibleBookOption,
} from '../types/liturgy'
import { normalizeLiturgyTimeHHmm, pad2 } from './liturgy-format'

export function createLiturgyItemId(): string {
  const randomBytes = new Uint8Array(7)
  crypto.getRandomValues(randomBytes)
  const randomHex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${Date.now()}-${randomHex}`
}

/** Categoria preferida ao adicionar item (seleção atual ou última sessão). */
export function resolvePreferredCategoryId(
  items: LiturgyItem[],
  selected: LiturgyItem | null | undefined,
): string | null {
  if (selected?.type === 'category') return selected.id
  if (selected?.categoryId) return selected.categoryId

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.type === 'category') return item.id
  }
  return null
}

/**
 * Índice de inserção: imediatamente após o último filho da categoria
 * (necessário para a timeline aninhar por sequência contígua).
 */
export function findCategoryInsertIndex(
  items: LiturgyItem[],
  categoryId: string,
): number {
  const categoryIndex = items.findIndex(
    (item) => item.type === 'category' && item.id === categoryId,
  )
  if (categoryIndex < 0) return items.length

  let insertAt = categoryIndex + 1
  while (insertAt < items.length) {
    const child = items[insertAt]
    if (!child || child.type === 'category') break
    if (child.categoryId !== categoryId) break
    insertAt += 1
  }
  return insertAt
}

/** Fim exclusivo do bloco categoria + filhos contíguos. */
export function getCategoryBlockEnd(
  items: LiturgyItem[],
  categoryIndex: number,
): number {
  const category = items[categoryIndex]
  if (category?.type !== 'category') return categoryIndex + 1
  return findCategoryInsertIndex(items, category.id)
}

/**
 * Resolve o índice da categoria-alvo ao soltar sobre um filho
 * (ou o próprio índice se já for categoria / item solto).
 */
function resolveDropCategoryIndex(
  items: LiturgyItem[],
  toIndex: number,
): number {
  const target = items[toIndex]
  if (!target) return toIndex
  if (target.type === 'category') return toIndex
  if (!target.categoryId) return toIndex
  const parentIndex = items.findIndex(
    (item) => item.type === 'category' && item.id === target.categoryId,
  )
  return parentIndex >= 0 ? parentIndex : toIndex
}

/** Move um item simples (não-categoria) dentro da lista. */
function moveSimpleItem(
  items: LiturgyItem[],
  fromIndex: number,
  toIndex: number,
): LiturgyItem[] {
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  if (!item) return items
  next.splice(toIndex, 0, item)
  return next
}

/** Calcula o ponto de inserção para uma categoria sendo movida. */
function resolveCategoryInsertAt(
  items: LiturgyItem[],
  fromIndex: number,
  toIndex: number,
  blockEnd: number,
): number | null {
  if (toIndex >= fromIndex && toIndex < blockEnd) return null

  const targetCategoryIndex = resolveDropCategoryIndex(items, toIndex)
  const target = items[targetCategoryIndex]

  let insertAt: number
  if (target?.type === 'category') {
    const targetEnd = getCategoryBlockEnd(items, targetCategoryIndex)
    insertAt = fromIndex < targetCategoryIndex ? targetEnd : targetCategoryIndex
  } else {
    insertAt = fromIndex < toIndex ? toIndex + 1 : toIndex
  }

  if (insertAt >= fromIndex && insertAt <= blockEnd) return null
  return insertAt
}

/** Move um bloco de categoria para uma nova posição. */
function moveCategoryBlock(
  items: LiturgyItem[],
  fromIndex: number,
  blockEnd: number,
  insertAt: number,
): LiturgyItem[] {
  const block = items.slice(fromIndex, blockEnd)
  const next = [...items.slice(0, fromIndex), ...items.slice(blockEnd)]
  let dest = insertAt
  if (insertAt > fromIndex) {
    dest = insertAt - (blockEnd - fromIndex)
  }
  dest = Math.max(0, Math.min(dest, next.length))
  next.splice(dest, 0, ...block)
  return next
}

/** Reordena itens. Categorias movem com todos os subitens contíguos. */
export function reorderLiturgyItems(
  items: LiturgyItem[],
  fromIndex: number,
  toIndex: number,
): LiturgyItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items
  }

  const moved = items[fromIndex]
  if (!moved) return items

  if (moved.type !== 'category') {
    return moveSimpleItem(items, fromIndex, toIndex)
  }

  const blockEnd = getCategoryBlockEnd(items, fromIndex)
  const insertAt = resolveCategoryInsertAt(items, fromIndex, toIndex, blockEnd)
  if (insertAt === null) return items

  return moveCategoryBlock(items, fromIndex, blockEnd, insertAt)
}

/** Copia itens com novos IDs, remapeando categoryId e limpando done. */
export function cloneLiturgyItems(items: LiturgyItem[]): LiturgyItem[] {
  const idMap = new Map<string, string>()
  for (const item of items) {
    idMap.set(item.id, createLiturgyItemId())
  }

  return items.map((item) => {
    const nextCategoryId =
      item.categoryId != null ? (idMap.get(item.categoryId) ?? null) : null
    return {
      ...item,
      id: idMap.get(item.id) ?? createLiturgyItemId(),
      categoryId: nextCategoryId,
      done: false,
    }
  })
}

export function isExecutableItem(item: Pick<LiturgyItem, 'type'>): boolean {
  return EXECUTABLE_ITEM_TYPES.includes(item.type)
}

export function getItemTypeIcon(type: LiturgyItemType): string {
  return LITURGY_ITEM_TYPE_META.find((entry) => entry.value === type)?.icon ?? 'ti-help'
}

export function getItemTypeTone(type: LiturgyItemType): string {
  return LITURGY_ITEM_TYPE_META.find((entry) => entry.value === type)?.tone ?? 'grey'
}

/** Normaliza aliases antigos para o vocabulário Stitch atual. */
export function normalizeItemType(raw: unknown): LiturgyItemType | null {
  if (raw === 'media' || raw === 'files') return 'other_files'
  if (raw === 'link') return 'site'
  if (typeof raw === 'string' && (LITURGY_ITEM_TYPES as readonly string[]).includes(raw)) {
    return raw as LiturgyItemType
  }
  return null
}

export function getSectionItemNumber(
  items: LiturgyItem[],
  index: number,
): number | null {
  if (!items[index] || items[index].type === 'category') return null

  let count = 0
  for (let i = 0; i <= index; i += 1) {
    const item = items[i]
    if (item.type === 'category') {
      count = 0
    } else {
      count += 1
    }
  }
  return count
}

export function clampMomentDurationMs(value: number): number {
  if (value <= 0) return 0
  const stepped = Math.round(value / 1000) * 1000
  return Math.min(
    MOMENT_DURATION_MAX_MS,
    Math.max(MOMENT_DURATION_MIN_MS, stepped),
  )
}

export function formatMomentDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${pad2(minutes)}:${pad2(seconds)}`
}

/** Aceita http(s) com host válido (ex.: youtube.com, vimeo.com). */
export function isValidLiturgyUrl(raw: string): boolean {
  const value = raw.trim()
  if (!value) return false

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const host = parsed.hostname.toLowerCase()
    if (!host || host.startsWith('.') || host.endsWith('.')) return false
    if (host === 'localhost') return true
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
    return host.includes('.') && /[a-z0-9-]/i.test(host)
  } catch {
    return false
  } // NOSONAR
}

function hasValidCategoryTimes(draft: LiturgyItemDraft): boolean {
  if (draft.type !== 'category') return true
  return (
    normalizeLiturgyTimeHHmm(draft.startTime) !== null &&
    normalizeLiturgyTimeHHmm(draft.endTime) !== null
  )
}

function hasValidTypeSpecificFields(draft: LiturgyItemDraft): boolean {
  if (draft.type === 'music' && draft.musicId == null) return false
  if (draft.type !== 'category' && !draft.categoryId) return false
  if (draft.type === 'images') {
    return resolveImagePaths(draft).length > 0
  }
  if (
    draft.type === 'video' ||
    draft.type === 'pdf' ||
    draft.type === 'presentation'
  ) {
    return draft.filePath.trim().length > 0
  }
  if (draft.type === 'site' || draft.type === 'online_video') {
    return isValidLiturgyUrl(draft.url)
  }
  return true
}

export function isLiturgyItemDraftValid(draft: LiturgyItemDraft): boolean {
  if (draft.type == null) return false
  if (draft.name.trim().length === 0) return false
  if (!hasValidCategoryTimes(draft)) return false
  return hasValidTypeSpecificFields(draft)
}

function applyMusicFields(
  item: LiturgyItem,
  draft: LiturgyItemDraft,
  details: string,
  musicList: LiturgyMusicOption[],
): void {
  item.musicId = draft.musicId
  item.musicMode = draft.musicMode
  const complementary = draft.name.trim()
  const music = musicList.find((entry) => entry.id === draft.musicId)
  if (music) {
    item.name = music.displayLabel
    item.complementaryTitle = complementary || undefined
    item.subtitle = music.albumNames
    item.notes = details || undefined
  } else {
    item.name = complementary || 'Música'
    item.complementaryTitle = undefined
    item.subtitle = ''
    item.notes = details || undefined
  }
}

function applyVerseFields(
  item: LiturgyItem,
  draft: LiturgyItemDraft,
  details: string,
  bibleBooks: LiturgyBibleBookOption[],
): void {
  item.verseBookId = draft.verseBookId
  item.verseChapter = draft.verseChapter
  item.verseNumbers = draft.verseNumbers.trim()
  const book = bibleBooks.find((entry) => entry.id === draft.verseBookId)
  if (book && !details) {
    const verses = item.verseNumbers ? `:${item.verseNumbers}` : ''
    item.subtitle = `${book.name} ${draft.verseChapter}${verses}`
  }
}

function applyInternalFileFields(
  item: LiturgyItem,
  draft: LiturgyItemDraft,
  details: string,
): void {
  const type = draft.type
  const paths =
    type === 'images' ? resolveImagePaths(draft) : resolveSingleFilePath(draft.filePath)

  item.filePath = paths[0] ?? ''
  if (type === 'images' && paths.length > 0) {
    item.filePaths = paths
    if (!details) {
      item.subtitle = `${paths.length} imagem(ns)`
    }
  } else if (item.filePath && !details) {
    const parts = item.filePath.split(/[\\/]/)
    item.subtitle = parts.at(-1) ?? item.filePath
  }
}

function applyUrlFields(item: LiturgyItem, draft: LiturgyItemDraft, details: string): void {
  item.url = draft.url.trim()
  if (item.url && !details) {
    item.subtitle = item.url
  }
}

export function buildLiturgyItemFromDraft(
  draft: LiturgyItemDraft,
  context: {
    musicList: LiturgyMusicOption[]
    bibleBooks: LiturgyBibleBookOption[]
    existingId?: string
    done?: boolean
  },
): LiturgyItem {
  if (draft.type == null) {
    throw new Error('Liturgy item draft requires a type')
  }

  const type = draft.type
  const details = draft.subtitle.trim()
  const item: LiturgyItem = {
    id: context.existingId ?? createLiturgyItemId(),
    type,
    name: draft.name.trim(),
    subtitle: details,
    done: context.done ?? false,
    durationMs: resolveDurationMs(type, draft.durationMs),
    accentColor: getTypeDotColor(type),
    categoryId: type === 'category' ? null : draft.categoryId,
    startTime:
      type === 'category' ? normalizeLiturgyTimeHHmm(draft.startTime) : null,
    endTime:
      type === 'category' ? normalizeLiturgyTimeHHmm(draft.endTime) : null,
  }

  if (type === 'music') {
    applyMusicFields(item, draft, details, context.musicList)
  }

  if (type === 'verse') {
    applyVerseFields(item, draft, details, context.bibleBooks)
  }

  if (INTERNAL_FILE_TYPES.includes(type)) {
    applyInternalFileFields(item, draft, details)
  }

  if (type === 'site' || type === 'online_video') {
    applyUrlFields(item, draft, details)
  }

  return item
}

/** Resolve lista de caminhos de arquivos a partir de um item existente. */
function resolveFilePathsFromItem(item: LiturgyItem): string[] {
  if (item.filePaths && item.filePaths.length > 0) {
    return [...item.filePaths]
  }
  if (item.filePath) {
    return [item.filePath]
  }
  return []
}

/** Resolve nome de exibição a partir do tipo do item. */
function resolveDraftName(item: LiturgyItem): string {
  return item.type === 'music'
    ? // Cascata: título complementar → nome do item (import .slja grava o
      // título em item.name). Sem isso itens importados abriam o editor com
      // o campo obrigatório vazio (feedback Ezequias/Rafael 02/10).
      (item.complementaryTitle ?? '').trim() || item.name.trim()
    : item.name
}

/** Resolve subtítulo do draft a partir do tipo do item. */
function resolveDraftSubtitle(item: LiturgyItem): string {
  return item.type === 'music' ? (item.notes ?? '').trim() : item.subtitle
}

export function draftFromLiturgyItem(item: LiturgyItem): LiturgyItemDraft {
  const isCategory = item.type === 'category'
  return {
    type: item.type,
    name: resolveDraftName(item),
    subtitle: resolveDraftSubtitle(item),
    durationMs: resolveDurationMs(item.type, item.durationMs),
    accentColor: getTypeDotColor(item.type),
    categoryId: isCategory ? null : (item.categoryId ?? null),
    startTime: isCategory ? (normalizeLiturgyTimeHHmm(item.startTime) ?? '') : '',
    endTime: isCategory ? (normalizeLiturgyTimeHHmm(item.endTime) ?? '') : '',
    musicId: item.musicId ?? null,
    musicMode: item.musicMode ?? 'audio',
    verseBookId: item.verseBookId ?? null,
    verseChapter: item.verseChapter ?? null,
    verseNumbers: item.verseNumbers ?? '',
    filePath: item.filePath ?? '',
    filePaths: resolveFilePathsFromItem(item),
    url: item.url ?? '',
  }
}

/** Resolve a duração (ms) com base no tipo do item. */
function resolveDurationMs(
  type: LiturgyItemType,
  rawDurationMs: number,
): number {
  if (type === 'category') return 0
  if (type === 'music') {
    return rawDurationMs > 0 ? clampMomentDurationMs(rawDurationMs) : 0
  }
  return clampMomentDurationMs(rawDurationMs)
}

/** Resolve lista de caminhos de arquivos para images. */
function resolveImagePaths(draft: LiturgyItemDraft): string[] {
  let paths: string[]
  if (draft.filePaths.length > 0) {
    paths = draft.filePaths
  } else if (draft.filePath.trim()) {
    paths = [draft.filePath]
  } else {
    paths = []
  }
  return paths.map((entry) => entry.trim()).filter(Boolean)
}

/** Resolve lista de caminhos para tipos de arquivo interno (não-images). */
function resolveSingleFilePath(filePath: string): string[] {
  const trimmed = filePath.trim()
  return trimmed ? [trimmed] : []
}

/** Alinha nome/álbum da música ao catálogo e separa anotações do subtítulo. */
export function reconcileMusicItemTitles(
  items: LiturgyItem[],
  musicList: LiturgyMusicOption[],
): LiturgyItem[] {
  if (musicList.length === 0) return items

  let changed = false
  const next = items.map((item) => {
    if (item.type !== 'music' || item.musicId == null) return item
    const music = musicList.find((entry) => entry.id === item.musicId)
    if (!music) return item

    let nextItem = item
    const complementary = item.complementaryTitle?.trim()

    if (!complementary && item.name !== music.displayLabel) {
      changed = true
      nextItem = {
        ...nextItem,
        complementaryTitle: item.name,
        name: music.displayLabel,
      }
    } else if (item.name !== music.displayLabel) {
      changed = true
      nextItem = { ...nextItem, name: music.displayLabel }
    }

    const existingNotes = nextItem.notes?.trim()
    const subtitle = nextItem.subtitle.trim()
    if (subtitle !== music.albumNames) {
      changed = true
      nextItem = {
        ...nextItem,
        subtitle: music.albumNames,
        notes: existingNotes || subtitle || undefined,
      }
    } else if (nextItem.notes && !existingNotes) {
      changed = true
      nextItem = { ...nextItem, notes: undefined }
    }

    // web#174: itens musicais sem duração herdam a duração do catálogo
    // (importações .slja locais passam a ter durationMs estimada).
    if (nextItem.durationMs <= 0 && (music.durationMs ?? 0) > 0) {
      changed = true
      nextItem = { ...nextItem, durationMs: clampMomentDurationMs(music.durationMs!) }
    }

    return nextItem
  })

  return changed ? next : items
}

export function clearDoneFlags(items: LiturgyItem[]): LiturgyItem[] {
  return items.map((item) => ({ ...item, done: false }))
}
