import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  exitPopupModule,
  isPopupModuleOpen,
  openPopupModule,
} from '@shared/services/popup-windows'
import {
  getPopupRoute,
  isCloudDestinationRoute,
  type PopupRoutableModule,
} from '@shared/services/popup-routing'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

import {
  loadBibleBooks,
  loadBibleVersions,
  loadChapterVerses,
  pickDefaultVersionId,
  resolveTestament,
} from '../services/bible-catalog'
import { publishBibleSelection } from '../services/bible-runtime'
import {
  buildProjectionText,
  emptySelection,
  formatScripturalReference,
  parseVerseFilter,
  parseVerseQuery,
} from '../services/scripture-format'
import type {
  BibleBook,
  BibleChapterVerses,
  BibleSelection,
  BibleTestament,
  BibleVersion,
} from '../types/bible'

export const useBibleStore = defineStore('bible', () => {
  const books = ref<BibleBook[]>([])
  const versions = ref<BibleVersion[]>([])
  const verses = ref<BibleChapterVerses>({})

  const selectedVersionId = ref<number | null>(null)
  const selectedBookId = ref<number | null>(null)
  const selectedChapter = ref<number | null>(null)
  const selectedVerses = ref<number[]>([])
  const lastVerseAnchor = ref(1)

  const testamentFilter = ref<BibleTestament>('ot')
  const showNavPanel = ref(true)
  const bookSearchQuery = ref('')
  const chapterSearchQuery = ref('')
  const verseSearchQuery = ref('')
  const globalSearchQuery = ref('')

  const isLoadingMeta = ref(false)
  const isLoadingVerses = ref(false)
  const lastErrorKey = ref<string | null>(null)
  const isProjecting = ref(false)

  const projection = ref<BibleSelection>(emptySelection())

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (!isPopupModuleOpen('bible')) {
        // WT-5/WT-6A: 'Só TV (nuvem)' e `palco:N` (receiver PWA) não têm popup — não é 'parado'
        try {
          if (isCloudDestinationRoute('bible')) return
        } catch { /* routing indisponível */ }
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function publishProjectionState(selection: BibleSelection = projection.value) {
    publishBibleSelection(selection)
  }

  const selectedBook = computed(() =>
    books.value.find((book) => book.id === selectedBookId.value) ?? null,
  )

  const selectedVersion = computed(() =>
    versions.value.find((version) => version.id === selectedVersionId.value) ??
    null,
  )

  const filteredBooks = computed(() => {
    const query = bookSearchQuery.value.trim().toLowerCase()
    return books.value.filter((book) => {
      if (resolveTestament(book.bookNumber) !== testamentFilter.value) return false
      if (!query) return true
      return (
        book.name.toLowerCase().includes(query) ||
        book.abbreviation.toLowerCase().includes(query)
      )
    })
  })

  const chapterNumbers = computed(() => {
    const total = selectedBook.value?.chapters ?? 0
    const query = chapterSearchQuery.value.trim()
    const list = Array.from({ length: total }, (_, index) => index + 1)
    if (!query) return list
    return list.filter((chapter) => String(chapter).startsWith(query))
  })

  const locationLabel = computed(() => {
    if (!selectedBook.value) return ''
    if (selectedChapter.value == null) return selectedBook.value.name
    return formatScripturalReference({
      bookName: selectedBook.value.name,
      chapter: selectedChapter.value,
      verses: selectedVerses.value,
    })
  })

  const chapterTitle = computed(() => {
    if (!selectedBook.value) return ''
    if (selectedChapter.value == null) return selectedBook.value.name
    return `${selectedBook.value.name} ${selectedChapter.value}`
  })

  const verseEntries = computed(() => {
    const globalQuery = globalSearchQuery.value.trim().toLowerCase()
    const verseQuery = verseSearchQuery.value.trim().toLowerCase()

    function matchesQuery( // NOSONAR
      entry: { number: number; text: string },
      query: string,
    ): boolean {
      if (!query) return true
      return (
        String(entry.number).includes(query) ||
        entry.text.toLowerCase().includes(query)
      )
    }

    return Object.keys(verses.value)
      .map(Number)
      .filter((num) => !Number.isNaN(num))
      .sort((a, b) => a - b)
      .map((number) => ({
        number,
        text: verses.value[String(number)] ?? '',
      }))
      .filter(
        (entry) => matchesQuery(entry, globalQuery) && matchesQuery(entry, verseQuery),
      )
  })

  function clearError() {
    lastErrorKey.value = null
  }

  /** Paridade app (R4+): filtro ativo de passagem — a lista mostra SÓ estes
   *  versículos e a navegação fica restrita a eles. Limpa ao trocar
   *  livro/capítulo (navegação manual). */
  const filteredVerseSet = ref<Set<number> | null>(null)

  const visibleVerseEntries = computed(() => {
    if (!filteredVerseSet.value) return verseEntries.value
    return verseEntries.value.filter((entry) =>
      filteredVerseSet.value!.has(entry.number),
    )
  })

  function clearFilteredVerses() {
    filteredVerseSet.value = null
  }

  function setError(key: string) {
    lastErrorKey.value = key
  }

  function syncProjection() {
    const book = selectedBook.value
    const version = selectedVersion.value
    if (!book || !version || selectedVerses.value.length === 0) {
      projection.value = emptySelection()
      if (isProjecting.value) publishProjectionState(projection.value)
      return
    }

    const selection: BibleSelection = {
      versionId: version.id,
      bookId: book.id,
      versionAbbreviation: version.abbreviation,
      bookName: book.name,
      chapter: selectedChapter.value,
      verses: [...selectedVerses.value],
      scripturalReference: formatScripturalReference({
        bookName: book.name,
        chapter: selectedChapter.value,
        verses: selectedVerses.value,
        versionAbbreviation: version.abbreviation,
      }),
      text: buildProjectionText(verses.value, selectedVerses.value),
    }

    projection.value = selection
    if (isProjecting.value) publishProjectionState(selection)
  }

  async function openProjection() {
    syncProjection()
    if (projection.value.verses.length === 0 || !projection.value.text) {
      return false
    }

    publishProjectionState(projection.value)
    // Destino receiver/monitor cloud não tem popup. Projetar já publicou no
    // relay; abrir popup aqui reintroduzia a janela indevida.
    if (getPopupRoute('bible') === 'tv') {
      isProjecting.value = true
      startProjectionWatch()
      return true
    }
    const opened = await openPopupModule('bible')
    isProjecting.value = opened
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
    return opened
  }

  async function clearProjectionWindow() {
    await exitPopupModule()
    isProjecting.value = false
    stopProjectionWatch()
    publishProjectionState(emptySelection())
  }

  async function toggleProjection() {
    if (isProjecting.value) {
      await clearProjectionWindow()
      return false
    }
    return openProjection()
  }

  function refreshProjectionState() {
    const open = isPopupModuleOpen('bible')
    isProjecting.value = open
    if (open) startProjectionWatch()
    else {
      stopProjectionWatch()
      publishProjectionState(emptySelection())
    }
  }

  async function refreshChapter() {
    const chapter = selectedChapter.value
    if (
      selectedVersionId.value == null ||
      selectedBookId.value == null ||
      chapter == null
    ) {
      verses.value = {}
      return
    }

    isLoadingVerses.value = true
    try {
      verses.value = await loadChapterVerses(
        selectedVersionId.value,
        selectedBookId.value,
        chapter,
      )
    } catch (error) {
      console.error('[bible] falha ao carregar capítulo', error)
      setError('bible.errors.loadChapterFailed')
      verses.value = {}
    } finally {
      isLoadingVerses.value = false
    }
  }

  async function bootstrap() {
    isLoadingMeta.value = true
    clearError()

    try {
      const [loadedBooks, loadedVersions] = await Promise.all([
        loadBibleBooks(),
        loadBibleVersions(),
      ])

      books.value = loadedBooks
      versions.value = loadedVersions

      if (loadedBooks.length === 0 || loadedVersions.length === 0) {
        setError('bible.errors.loadCatalogFailed')
        return
      }

      const saved = getUserPreference<number>(
        USER_PREFERENCE_KEYS.bibleSelectedVersion,
        null,
      )
      const versionId = pickDefaultVersionId(loadedVersions, saved)
      selectedVersionId.value = versionId

      // Carrega livro e capitulo das preferencias ou usa padrao (Genesis 1)
      const savedBook = getUserPreference<number | null>(
        USER_PREFERENCE_KEYS.bibleSelectedBook,
        null,
      )
      const savedChapter = getUserPreference<number | null>(
        USER_PREFERENCE_KEYS.bibleSelectedChapter,
        null,
      )

      selectedBookId.value = savedBook ?? null
      selectedChapter.value = savedChapter ?? null

      // Forçar showNavPanel como true caso não haja livro ou capítulo selecionado
      if (selectedBookId.value === null || selectedChapter.value === null) {
        showNavPanel.value = true
      }

      if (selectedBookId.value !== null) {
        const book = loadedBooks.find((item) => item.id === selectedBookId.value)
        if (book) {
          testamentFilter.value = resolveTestament(book.bookNumber)
        }
      }
      selectedVerses.value = []
      lastVerseAnchor.value = 1
      verses.value = {}

      isProjecting.value = isPopupModuleOpen('bible')
      if (isProjecting.value) startProjectionWatch()

      if (selectedBookId.value !== null && selectedChapter.value !== null) {
        await refreshChapter()
      }
    } catch (error) {
      console.error('[bible] falha ao iniciar módulo', error)
      setError('bible.errors.loadCatalogFailed')
      books.value = []
      versions.value = []
    } finally {
      isLoadingMeta.value = false
    }
  }

  async function selectVersion(versionId: number) {
    if (selectedVersionId.value === versionId) return
    selectedVersionId.value = versionId
    setUserPreference(USER_PREFERENCE_KEYS.bibleSelectedVersion, versionId)
    selectedVerses.value = []
    lastVerseAnchor.value = 1
    syncProjection()
    await refreshChapter()
  }

  async function selectBook(bookId: number) {
    const book = books.value.find((item) => item.id === bookId)
    if (!book) return

    filteredVerseSet.value = null
    selectedBookId.value = bookId
    setUserPreference(USER_PREFERENCE_KEYS.bibleSelectedBook, bookId)
    testamentFilter.value = resolveTestament(book.bookNumber)
    selectedChapter.value = null
    setUserPreference(USER_PREFERENCE_KEYS.bibleSelectedChapter, null)
    selectedVerses.value = []
    lastVerseAnchor.value = 1

    syncProjection()
    // Versiculos so carregam apos selecionar capitulo
    verses.value = {}
  }

  async function selectChapter(chapter: number) {
    if (chapter < 1) return
    const max = selectedBook.value?.chapters ?? chapter
    const next = Math.min(chapter, max)
    if (selectedChapter.value === next) return

    filteredVerseSet.value = null
    selectedChapter.value = next
    setUserPreference(USER_PREFERENCE_KEYS.bibleSelectedChapter, next)
    selectedVerses.value = []
    lastVerseAnchor.value = 1
    syncProjection()
    await refreshChapter()
  }

  function selectVerse(verseNumber: number, event?: MouseEvent) {
    if (!verses.value[String(verseNumber)]) return

    if (event?.ctrlKey || event?.metaKey) {
      const index = selectedVerses.value.indexOf(verseNumber)
      if (index === -1) {
        selectedVerses.value = [...selectedVerses.value, verseNumber].sort(
          (a, b) => a - b,
        )
      } else {
        selectedVerses.value = selectedVerses.value.filter(
          (verse) => verse !== verseNumber,
        )
      }
    } else if (event?.shiftKey) {
      const start = Math.min(verseNumber, lastVerseAnchor.value)
      const end = Math.max(verseNumber, lastVerseAnchor.value)
      const range: number[] = []
      for (let i = start; i <= end; i += 1) {
        if (verses.value[String(i)]) range.push(i)
      }
      selectedVerses.value = range
    } else {
      selectedVerses.value = [verseNumber]
    }

    lastVerseAnchor.value = verseNumber
    syncProjection()
  }

  function applyVerseSearch() {
    // Paridade app (R4+): Enter valida lista/intervalos ("1-4, 6"), ativa o
    // filtro de lista (só os versículos da passagem) e NADA vem selecionado —
    // o operador escolhe o primeiro e navega (setas) restrito ao filtro.
    const filter = parseVerseFilter(verseSearchQuery.value)
    if (filter.length === 0) {
      // sem padrão de referência → cai na busca textual existente
      const parsed = parseVerseQuery(verseSearchQuery.value, verses.value)
      if (parsed.length === 0) return
      filteredVerseSet.value = null
      selectedVerses.value = parsed
      lastVerseAnchor.value = parsed[parsed.length - 1] // NOSONAR
      verseSearchQuery.value = ''
      syncProjection()
      return
    }

    filteredVerseSet.value = new Set(filter)
    selectedVerses.value = []
    verseSearchQuery.value = ''
    syncProjection()
  }

  function clearSelection() {
    selectedVerses.value = []
    syncProjection()
  }

  function setTestamentFilter(testament: BibleTestament) {
    testamentFilter.value = testament
  }

  function toggleNavPanel() {
    showNavPanel.value = !showNavPanel.value
  }

  function selectFirstValidVerse() {
    const nums = Object.keys(verses.value)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
    const first = Math.min(...nums)
    if (Number.isFinite(first)) selectVerse(first)
  }

  function selectLastValidVerse() {
    const nums = Object.keys(verses.value)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
    const last = Math.max(...nums)
    if (Number.isFinite(last)) selectVerse(last)
  }
  async function goToAdjacentVerse(direction: -1 | 1) {
    // Paridade app (R4+): com filtro de passagem ativo, navegação fica
    // RESTITA aos versículos renderizados — nada fora do filtro projeta e
    // nunca cruza capítulo/livro enquanto o filtro existir.
    if (filteredVerseSet.value) {
      const ordered = visibleVerseEntries.value.map((entry) => entry.number)
      if (ordered.length === 0) return
      if (selectedVerses.value.length === 0) {
        selectVerse(direction > 0 ? ordered[0] : ordered[ordered.length - 1])
        return
      }
      const current =
        direction < 0
          ? Math.min(...selectedVerses.value)
          : Math.max(...selectedVerses.value)
      const position = ordered.indexOf(current)
      const fallback = direction < 0 ? ordered.length - 1 : 0
      const next = position === -1 ? ordered[fallback] : ordered[position + direction]
      if (next != null) selectVerse(next)
      return
    }

    const isForward = direction > 0
    if (selectedVerses.value.length === 0) {
      isForward ? selectFirstValidVerse() : selectLastValidVerse()
      return
    }

    const current =
      direction < 0
        ? Math.min(...selectedVerses.value)
        : Math.max(...selectedVerses.value)
    const next = current + direction

    if (verses.value[String(next)]) {
      selectVerse(next)
      return
    }

    const book = selectedBook.value
    if (!book) return

    const currentChapter = selectedChapter.value
    if (currentChapter == null) return

    const sameBookNextChapter = isForward
      ? currentChapter < book.chapters
      : currentChapter > 1

    if (sameBookNextChapter) {
      await selectChapter(currentChapter + direction)
      isForward ? selectFirstValidVerse() : selectLastValidVerse()
      return
    }

    const index = books.value.findIndex((item) => item.id === book.id)
    const nextBook = isForward
      ? (books.value[index + 1] ?? books.value[0])
      : (index > 0 ? books.value[index - 1] : books.value[books.value.length - 1]) // NOSONAR
    if (!nextBook) return

    await selectBook(nextBook.id)
    await selectChapter(isForward ? 1 : nextBook.chapters)
    isForward ? selectFirstValidVerse() : selectLastValidVerse()
  }

  return {
    books,
    versions,
    verses,
    selectedVersionId,
    selectedBookId,
    selectedChapter,
    selectedVerses,
    testamentFilter,
    showNavPanel,
    bookSearchQuery,
    chapterSearchQuery,
    verseSearchQuery,
    globalSearchQuery,
    isLoadingMeta,
    isLoadingVerses,
    lastErrorKey,
    isProjecting,
    projection,
    selectedBook,
    selectedVersion,
    filteredBooks,
    chapterNumbers,
    locationLabel,
    chapterTitle,
    verseEntries,
    visibleVerseEntries,
    clearFilteredVerses,
    clearError,
    bootstrap,
    selectVersion,
    selectBook,
    selectChapter,
    selectVerse,
    applyVerseSearch,
    clearSelection,
    setTestamentFilter,
    toggleNavPanel,
    goToAdjacentVerse,
    syncProjection,
    toggleProjection,
    clearProjectionWindow,
    refreshProjectionState,
  }
})