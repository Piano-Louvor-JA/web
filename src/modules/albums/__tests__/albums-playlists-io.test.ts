// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

import AlbumsView from '../views/AlbumsView.vue'
import {
  listPlaylists,
  savePlaylists,
} from '../services/playlist-storage'

const { serializePlaylistsMock, parsePlaylistsImportMock } = vi.hoisted(() => ({
  serializePlaylistsMock: vi.fn(),
  parsePlaylistsImportMock: vi.fn(),
}))

vi.mock('../services/playlist-io', () => ({
  serializePlaylists: serializePlaylistsMock,
  parsePlaylistsImport: parsePlaylistsImportMock,
}))

// useAlbums: service pesado (catálogo/API) — mockar fronteira inteira.
// REGRA: refs REAIS (não objetos planos) — Vue template só desembrulha ref().
vi.mock('../composables/useAlbums', () => {
  const { ref } = require('vue') as typeof import('vue')
  return {
    useAlbums: () => ({
      categories: ref([]),
      hubSearchQuery: ref(''),
      hubSearchResults: ref([]),
      isHubSearching: ref(false),
      isLoadingCatalog: ref(false),
      isLoadingMusicIndex: ref(false),
      lastErrorKey: ref(null),
      lastActionMessageKey: ref(null),
      lyricOpen: ref(false),
      lyricDoc: ref(null),
      isLoadingLyric: ref(false),
      retry: vi.fn(),
      clearError: vi.fn(),
      clearActionMessage: vi.fn(),
      clearSearch: vi.fn(),
    }),
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      albums: {
        playlists: {
          title: 'Playlists',
          newPlaceholder: 'Nome da nova playlist...',
          create: 'Criar',
          empty: 'Nenhuma playlist criada ainda.',
          export: 'Exportar',
          import: 'Importar',
          imported: 'Importado: {summary}',
          newLists: '{count} playlist(s) nova(s)',
          addedTracks: '{count} faixa(s) adicionada(s)',
          nothingToImport: 'Nada novo para importar.',
          invalidFile: 'Arquivo de playlists inválido.',
        },
        trackCount: '{count} faixa(s)',
        dismiss: 'Descartar',
        title: 'Central',
        subtitle: 'Sub',
        messages: { catalogEmpty: 'vazio' },
        retry: 'Retry',
      },
    },
  },
})

function makeFile(text: string): File {
  return new File([text], 'playlists.json', { type: 'application/json' })
}

async function mountView() {
  // attachTo: os modais (Playlists/Coletâneas) renderizam via Teleport no body —
  // sem attach ao documento o wrapper não os enxerga.
  const wrapper = mount(AlbumsView, {
    attachTo: document.body,
    global: { plugins: [i18n, createPinia()] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  savePlaylists([])
  serializePlaylistsMock.mockReset()
  parsePlaylistsImportMock.mockReset()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('AlbumsView — export/import de playlists', () => {
  it('exporta playlist como download JSON', async () => {
    savePlaylists([
      {
        id: 'pl-1',
        name: 'Culto',
        items: [{ musicId: 1, albumId: null, title: 'A' }],
        createdAt: 'x',
        updatedAt: 'x',
      },
    ])
    serializePlaylistsMock.mockReturnValue({ version: 1, kind: 'playlists', playlists: [] })
    await mountView()

    // Abre o modal de Playlists (conteúdo vive em Teleport no body)
    document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
    await flushPromises()

    const exportBtn = document.querySelector<HTMLButtonElement>('[data-testid="playlists-export"]')
    expect(exportBtn).toBeTruthy()
    exportBtn?.click()

    expect(serializePlaylistsMock).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('export desabilitado sem playlists', async () => {
    await mountView()
    document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
    await flushPromises()
    const exportBtn = document.querySelector<HTMLButtonElement>('[data-testid="playlists-export"]')
    expect(exportBtn).toBeTruthy()
    expect(exportBtn?.hasAttribute('disabled')).toBe(true)
  })

  it('import válido faz merge e mostra toast com resumo', async () => {
    savePlaylists([
      {
        id: 'pl-1',
        name: 'Culto',
        items: [{ musicId: 1, albumId: null, title: 'A' }],
        createdAt: 'x',
        updatedAt: 'x',
      },
    ])
    parsePlaylistsImportMock.mockReturnValue({
      ok: true,
      playlists: [
        {
          id: 'pl-2',
          name: 'Culto',
          items: [{ musicId: 1, albumId: null, title: 'A' }, { musicId: 2, albumId: null, title: 'B' }],
          createdAt: 'x',
          updatedAt: 'x',
        },
      ],
      discardedItems: 0,
    })

    await mountView()
    document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()

    Object.defineProperty(input, 'files', { value: [makeFile('{}')] })
    input?.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(parsePlaylistsImportMock).toHaveBeenCalledOnce()
    const current = listPlaylists()
    expect(current).toHaveLength(1)
    expect(current[0]?.items).toHaveLength(2)
    expect(document.body.textContent).toContain('Importado')
    expect(document.body.textContent).toContain('1 faixa(s) adicionada(s)')
  })

  it('import inválido mostra toast de erro', async () => {
    parsePlaylistsImportMock.mockReturnValue({ ok: false, playlists: [], discardedItems: 0 })
    await mountView()
    document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [makeFile('x')] })
    input?.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(document.body.textContent).toContain('Arquivo de playlists inválido')
  })
})
