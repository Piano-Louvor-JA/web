
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

import AlbumsView from '../views/AlbumsView.vue'
import { listPlaylists, savePlaylists } from '../services/playlist-storage'
import ptBR from '../locales/pt-BR'
import en from '../locales/en'
import es from '../locales/es'

enableAutoUnmount(afterEach)

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

const { push, playQueue } = vi.hoisted(() => ({ push: vi.fn(), playQueue: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../../media/stores/useMediaStore', () => ({ useMediaStore: () => ({ playQueue }) }))

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'pt-BR': {
      albums: {
        playlists: {
          title: 'Playlists',
          rename: 'Renomear',
          renamed: 'Playlist renomeada',
        },
      },
    },
  },
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  savePlaylists([])
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AlbumsView — painel de playlists', () => {
  it.each([['pt-BR', ptBR], ['en', en], ['es', es]] as const)('traduz os controles e feedback em %s', async (locale, messages) => {
    savePlaylists([{ id: 'empty', name: 'Culto', items: [], createdAt: '', updatedAt: '' }])
    const localized = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
    const wrapper = mount(AlbumsView, { attachTo: document.body, global: { plugins: [localized, createPinia()] } })
    await flushPromises()
    await wrapper.get('.albums-view__toolbar-btn').trigger('click')
    expect(document.querySelector('[data-testid="playlist-rename"]')?.getAttribute('aria-label')).toBe(messages.albums.playlists.rename.replace('{name}', 'Culto'))
    document.querySelector<HTMLButtonElement>('.albums-view__playlist-play')!.click()
    await flushPromises()
    expect(document.querySelector('[role="status"]')?.textContent).toContain(messages.albums.playlists.emptyPlayback)
  })
  it('informa playlist vazia sem reproduzir ou navegar', async () => {
    savePlaylists([{ id: 'empty', name: 'Vazia', items: [], createdAt: '', updatedAt: '' }])
    const wrapper = mount(AlbumsView, { attachTo: document.body, global: { plugins: [i18n, createPinia()] } })
    await flushPromises()
    await wrapper.get('.albums-view__toolbar-btn').trigger('click')
    document.querySelector<HTMLButtonElement>('.albums-view__playlist-play')!.click()
    await flushPromises()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('albums.playlists.emptyPlayback')
    expect(playQueue).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('exclui a ativa entre três playlists e mantém as demais após remontar', async () => {
    savePlaylists(['A', 'B', 'C'].map(id => ({ id, name: id, items: [], createdAt: '', updatedAt: '' })))
    const wrapper = mount(AlbumsView, { attachTo: document.body, global: { plugins: [i18n, createPinia()] } })
    await flushPromises()
    await wrapper.get('.albums-view__toolbar-btn').trigger('click')
    document.querySelectorAll<HTMLButtonElement>('.albums-view__playlist-toggle')[1]!.click()
    await flushPromises()
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1)
    document.querySelectorAll<HTMLButtonElement>('[data-testid="playlist-delete"]')[1]!.click()
    await flushPromises()

    // Confirma a exclusão no modal
    document.querySelector<HTMLButtonElement>('.app-confirm__btn--primary')!.click()

    // Aguarda a animação de fechamento do modal
    await new Promise(resolve => setTimeout(resolve, 70))
    await flushPromises()
    expect(document.querySelectorAll('.albums-view__playlist')).toHaveLength(2)
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0)
    expect(listPlaylists().map(p => p.id)).toEqual(['A', 'C'])
    wrapper.unmount()
    const remounted = mount(AlbumsView, { attachTo: document.body, global: { plugins: [i18n, createPinia()] } })
    await flushPromises()
    await remounted.get('.albums-view__toolbar-btn').trigger('click')
    expect(document.querySelectorAll('.albums-view__playlist')).toHaveLength(2)
    remounted.unmount()
  })

  it('reproduz as faixas em ordem e navega para mídia', async () => {
    const items = [{ musicId: 1, albumId: null, title: 'A' }, { musicId: 2, albumId: null, title: 'B' }]
    savePlaylists([{ id: 'play', name: 'Culto', items, createdAt: '', updatedAt: '' }])
    const wrapper = mount(AlbumsView, { attachTo: document.body, global: { plugins: [i18n, createPinia()] } })
    await flushPromises()
    await wrapper.get('.albums-view__toolbar-btn').trigger('click')
    document.querySelector<HTMLButtonElement>('[data-testid="playlist-play"]')!.click()
    await flushPromises()
    expect(playQueue).toHaveBeenCalledWith(items, 0)
    expect(push).toHaveBeenCalledWith({ name: 'media' })
    wrapper.unmount()
  })
  it('permite renomear playlist com duas faixas e persiste a alteração', async () => {
    savePlaylists([
      {
        id: 'playlist-1',
        name: 'Culto',
        items: [
          { musicId: 1, albumId: null, title: 'Música A' },
          { musicId: 2, albumId: null, title: 'Música B' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    mount(AlbumsView, {
      attachTo: document.body,
      global: { plugins: [i18n, createPinia()] },
    })
    await flushPromises()

    document.querySelector<HTMLButtonElement>(
      '.albums-view__toolbar-btn',
    )?.click()
    await flushPromises()

    const renameButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="playlist-rename"]',
    )

    expect(renameButton).not.toBeNull()

    renameButton?.click()
    await flushPromises()

    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="playlist-rename-input"]',
    )

    expect(input).not.toBeNull()

    input!.value = 'Culto Jovem'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    document.querySelector<HTMLButtonElement>(
      '[data-testid="playlist-rename-save"]',
    )?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Culto Jovem')

    const saved = listPlaylists()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Playlist renomeada')
    expect(saved[0]?.name).toBe('Culto Jovem')
    expect(saved[0]?.items).toHaveLength(2)
    expect(saved[0]?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('exclui uma playlist com três músicas do painel e do armazenamento', async () => {
    savePlaylists([
      {
        id: 'playlist-delete-1',
        name: 'Louvores de Sábado',
        items: [
          { musicId: 1, albumId: null, title: 'Música A' },
          { musicId: 2, albumId: null, title: 'Música B' },
          { musicId: 3, albumId: null, title: 'Música C' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    mount(AlbumsView, {
      attachTo: document.body,
      global: { plugins: [i18n, createPinia()] },
    })

    await flushPromises()

    document.querySelector<HTMLButtonElement>('.albums-view__toolbar-btn')?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('Louvores de Sábado')

    const deleteButton =
      document.querySelector<HTMLButtonElement>('[data-testid="playlist-delete"]')

    expect(deleteButton).not.toBeNull()

    deleteButton?.click()
    await flushPromises()

    // Confirma a exclusão da playlist no modal
    const confirmButton =
      document.querySelector<HTMLButtonElement>('.app-confirm__btn--primary')

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()

    // Aguarda o fechamento do modal antes de verificar a exclusão
    await new Promise(resolve => setTimeout(resolve, 70))
    await flushPromises()

    expect(document.body.textContent).not.toContain('Louvores de Sábado')
    expect(listPlaylists()).toHaveLength(0)
  })
})
