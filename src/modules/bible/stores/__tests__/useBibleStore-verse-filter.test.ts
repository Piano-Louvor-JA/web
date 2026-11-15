import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import { useBibleStore } from '../useBibleStore'

vi.mock('../../services/bible-catalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/bible-catalog')>()
  const genesis = Object.fromEntries(
    Array.from({ length: 31 }, (_, i) => [String(i + 1), `verso ${i + 1}`]),
  )
  const books = [
    {
      id: 1,
      name: 'Gênesis',
      abbreviation: 'Gn',
      bookNumber: 1,
      chapters: 50,
      testament: 'ot',
    },
  ]
  return {
    ...actual,
    loadBibleBooks: vi.fn().mockResolvedValue(books),
    loadBibleVersions: vi.fn().mockResolvedValue([
      { id: 1, name: 'Almeida', abbreviation: 'ARC' },
    ]),
    loadChapterVerses: vi.fn().mockResolvedValue(genesis),
    pickDefaultVersionId: actual.pickDefaultVersionId,
    resolveTestament: actual.resolveTestament,
  }
})

describe('useBibleStore — filtro de passagem no campo do leitor (paridade app R4+)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Enter com "1-4, 6" filtra a lista, nada vem selecionado', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)

    store.verseSearchQuery = '1-4, 6'
    store.applyVerseSearch()

    expect(store.visibleVerseEntries.map((e) => e.number)).toEqual([1, 2, 3, 4, 6])
    expect(store.selectedVerses).toEqual([])
    expect(store.verseSearchQuery).toBe('')
  })

  it('navegação (setas) restrita ao filtro: 1→2→3→4→6, pula o 5', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)

    store.verseSearchQuery = '1-4, 6'
    store.applyVerseSearch()
    store.selectVerse(1)

    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([2])
    await store.goToAdjacentVerse(1)
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([4])
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([6])

    // limite: não escapa do filtro
    await store.goToAdjacentVerse(1)
    expect(store.selectedVerses).toEqual([6])
    await store.goToAdjacentVerse(-1)
    expect(store.selectedVerses).toEqual([4])
  })

  it('trocar capítulo limpa o filtro (lista completa volta)', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)

    store.verseSearchQuery = '1-4, 6'
    store.applyVerseSearch()
    expect(store.visibleVerseEntries.length).toBe(5)

    await store.selectChapter(2)
    expect(store.visibleVerseEntries.length).toBe(31)
  })

  it('texto sem padrão de referência mantém busca textual antiga', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)

    store.verseSearchQuery = 'verso'
    // filtro textual em tempo real (pré-existente): todos os 31 contêm "verso"
    expect(store.visibleVerseEntries.length).toBe(31)

    store.applyVerseSearch()
    // texto sem padrão de referência → filtro de passagem NÃO ativa
    expect(store.selectedVerses).toEqual([])
    expect(store.visibleVerseEntries.length).toBe(31)
  })
})
