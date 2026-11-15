// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

import AlbumsView from '../views/AlbumsView.vue'
import {
  listPlaylists,
  renamePlaylist,
  savePlaylists,
} from '../services/playlist-storage'

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

vi.mock('../../media/stores/useMediaStore', () => ({
  useMediaStore: () => ({
    playQueue: vi.fn().mockResolvedValue(undefined),
  }),
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
          rename: 'Renomear playlist {name}',
          newName: 'Novo nome da playlist',
          saveName: 'Salvar',
          emptyPlaylistFeedback: 'Playlist vazia — adicione faixas antes de tocar.',
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

function makePlaylist(name: string, items: { musicId: number; albumId: number | null; title: string }[]) {
  return {
    id: `pl-${name}`,
    name,
    items,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
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

/** Abre o modal de Playlists e retorna o painel teletransportado. */
async function openPlaylistsModal() {
  document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  savePlaylists([])
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AlbumsView — painel de playlists: renomear', () => {
  it('renomeia playlist: lista e storage refletem o novo nome', async () => {
    savePlaylists([
      makePlaylist('Culto', [
        { musicId: 1, albumId: null, title: 'A' },
        { musicId: 2, albumId: null, title: 'B' },
      ]),
    ])
    await mountView()
    await openPlaylistsModal()

    const renameBtn = document.querySelector<HTMLButtonElement>('[data-testid="playlist-rename"]')
    expect(renameBtn).toBeTruthy()
    renameBtn?.click()
    await flushPromises()

    const input = document.querySelector<HTMLInputElement>('[data-testid="playlist-rename-input"]')
    expect(input).toBeTruthy()
    input!.value = 'Culto Especial'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(listPlaylists()[0]?.name).toBe('Culto Especial')
    expect(listPlaylists()[0]?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
    expect(document.body.textContent).toContain('Culto Especial')
    expect(renamePlaylist).toBeDefined()
  })

  it('cancela renomeio com Esc sem alterar storage', async () => {
    savePlaylists([makePlaylist('Culto', [{ musicId: 1, albumId: null, title: 'A' }])])
    await mountView()
    await openPlaylistsModal()

    document.querySelector<HTMLButtonElement>('[data-testid="playlist-rename"]')?.click()
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('[data-testid="playlist-rename-input"]')
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(listPlaylists()[0]?.name).toBe('Culto')
    expect(document.querySelector('[data-testid="playlist-rename-input"]')).toBeNull()
  })
})

describe('AlbumsView — painel de playlists: tocar playlist vazia', () => {
  it('playlist vazia: mostra feedback "vazia" e não navega', async () => {
    savePlaylists([makePlaylist('Vazia', [])])
    await mountView()
    await openPlaylistsModal()

    const playBtn = document.querySelector<HTMLButtonElement>('[data-testid="playlist-play"]')
    expect(playBtn).toBeTruthy()
    playBtn?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Playlist vazia')
  })
})
