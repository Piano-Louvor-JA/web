import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import { publishBibleSelection } from '../../services/bible-runtime'
import { useBibleStore } from '../useBibleStore'

vi.mock('../../services/bible-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/bible-runtime')>()),
  publishBibleSelection: vi.fn(),
}))

vi.mock('../../services/bible-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bible-catalog')>()
  const chapter = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), `verso ${i + 1}`]))
  return {
    ...actual,
    loadBibleBooks: vi.fn().mockResolvedValue([
      { id: 1, name: 'Gênesis', abbreviation: 'Gn', bookNumber: 1, chapters: 50, testament: 'ot' },
      { id: 2, name: 'Êxodo', abbreviation: 'Ex', bookNumber: 2, chapters: 40, testament: 'ot' },
    ]),
    loadBibleVersions: vi.fn().mockResolvedValue([{ id: 1, name: 'Almeida', abbreviation: 'ARC' }]),
    loadChapterVerses: vi.fn().mockResolvedValue(chapter),
    pickDefaultVersionId: actual.pickDefaultVersionId,
    resolveTestament: actual.resolveTestament,
  }
})

describe('useBibleStore — navegar não apaga o versículo projetado (paridade app)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(publishBibleSelection).mockClear()
  })

  it('trocar capítulo ou livro mantém a projeção até clicar no versículo novo', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)
    store.isProjecting = true
    store.selectVerse(5)
    const projected = { ...store.projection }
    expect(projected.verses).toEqual([5])
    vi.mocked(publishBibleSelection).mockClear()

    await store.selectChapter(2)
    await store.selectBook(2)
    await store.selectChapter(3)
    expect(store.selectedVerses).toEqual([])
    expect(store.projection).toEqual(projected)
    expect(publishBibleSelection).not.toHaveBeenCalled()

    store.selectVerse(1)
    expect(store.projection).toMatchObject({ bookName: 'Êxodo', chapter: 3, verses: [1] })
    expect(publishBibleSelection).toHaveBeenCalledWith(store.projection)
  })

  it('limpar a seleção continua tirando o versículo da projeção', async () => {
    const store = useBibleStore()
    await store.bootstrap()
    await store.selectBook(1)
    await store.selectChapter(1)
    store.isProjecting = true
    store.selectVerse(2)
    store.clearSelection()
    expect(store.projection.verses).toEqual([])
  })
})
