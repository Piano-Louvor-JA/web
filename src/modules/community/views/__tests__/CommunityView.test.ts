// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom não implementa scrollTo em Element
Element.prototype.scrollTo = vi.fn()
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CommunityView from '../CommunityView.vue'
import { getAuthSession } from '@/modules/auth/services/auth-client'
import {
  listCommunityCollectionsPage,
  saveCommunityCopy,
} from '../../services/community-catalog'
import { registerUse, reportCollection } from '../../services/ranking'
import { getSeasonalEvent } from '../../services/seasonal-event'
import { getNotifications } from '../../services/notifications'
import { getWeeklyTasks } from '../../services/weekly-tasks'

vi.mock('@/modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('../../services/community-catalog', () => ({
  listCommunityCollectionsPage: vi.fn(),
  saveCommunityCopy: vi.fn(),
}))
vi.mock('../../services/ranking', () => ({
  registerUse: vi.fn(),
  reportCollection: vi.fn(),
}))
vi.mock('../../services/seasonal-event', () => ({
  getSeasonalEvent: vi.fn(),
}))
vi.mock('../../services/notifications', () => ({
  getNotifications: vi.fn(),
  markAllRead: vi.fn(),
}))
vi.mock('../../services/weekly-tasks', () => ({
  getWeeklyTasks: vi.fn(),
}))
const moderation = vi.hoisted(() => ({
  block: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('../../services/blocks', () => ({
  blockAuthor: moderation.block,
  listBlockedAuthors: vi.fn(async () => []),
  unblockAuthor: vi.fn(async () => true),
}))
vi.mock('@/shared/composables/useAppConfirm', () => ({
  appConfirm: moderation.confirm,
}))
vi.mock('../../components/BlockedAuthorsDialog.vue', () => ({
  default: {
    name: 'BlockedAuthorsDialog',
    props: ['open'],
    emits: ['close'],
    template: '<div v-if="open" data-test="blocked-dialog-mock" />',
  },
}))

const mockedCatalog = vi.mocked(listCommunityCollectionsPage)
const mockedSaveCopy = vi.mocked(saveCommunityCopy)
const mockedRegisterUse = vi.mocked(registerUse)
const mockedReport = vi.mocked(reportCollection)
const mockedSeasonal = vi.mocked(getSeasonalEvent)
const mockedNotifs = vi.mocked(getNotifications)
const mockedTasks = vi.mocked(getWeeklyTasks)
const mockedSession = vi.mocked(getAuthSession)

const collection = {
  id: 7,
  name: 'Hinos de louvor',
  authorName: 'Rafael',
  authorId: 2, // outro autor: o usuário logado (id 1) pode denunciar/bloquear
  musicsCount: 12,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00Z',
}

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      community: {
        title: 'Comunidade',
        subtitle: 'Coletâneas públicas',
        back: 'Voltar',
        ranking: 'Ranking',
        loading: 'Carregando…',
        empty: 'Nada encontrado',
        searchPlaceholder: 'Buscar',
        clearSearch: 'Limpar',
        saveCopy: 'Salvar cópia',
        copySaved: 'Salvo',
        byAuthor: 'por {author}',
        trackCount: '{count} faixas',
        pagination: 'Páginas',
      },
      ranking: {
        weeklyTasks: 'Metas semanais',
        points: '+{points} pts',
        report: 'Denunciar',
      },
      notifications: { title: 'Notificações' },
    },
  },
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/community', component: CommunityView },
      { path: '/community/ranking', component: { template: '<div />' } },
    ],
  })
}

function mountView() {
  const router = makeRouter()
  router.push('/community')
  const wrapper = mount(CommunityView, {
    global: { plugins: [i18n, router] },
  })
  return wrapper
}

describe('CommunityView — integração', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCatalog.mockResolvedValue({
      items: [collection],
      page: 1,
      lastPage: 2,
      total: 25,
    })
    mockedTasks.mockResolvedValue([
      { id: 1, description: 'Use 3 coletâneas', bonus: 10, done: false },
    ])
    mockedNotifs.mockResolvedValue([])
    mockedSeasonal.mockResolvedValue({
      name: 'Semana do Hinário',
      description: '2x pontos',
      multiplier: 2,
    })
    mockedSession.mockReturnValue({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'Rafael' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mostra loading e depois renderiza catálogo, tarefas e evento sazonal', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Comunidade')
    expect(wrapper.text()).toContain('Hinos de louvor')
    expect(wrapper.text()).toContain('por Rafael')
    expect(wrapper.text()).toContain('Metas semanais')
    expect(wrapper.text()).toContain('Semana do Hinário')
    expect(wrapper.text()).toContain('x2')
  })

  it('usuário logado vê sino de notificações e link de ranking', async () => {
    mockedNotifs.mockResolvedValue([
      {
        id: 1,
        type: 'ranking',
        title: 'Subiu',
        body: '+3',
        created_at: '2026-09-17T10:00:00Z',
      },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.community-view__bell').exists()).toBe(true)
    expect(wrapper.find('.community-view__bell-badge').text()).toBe('1')
    expect(wrapper.find('.community-view__ranking-link').exists()).toBe(true)
  })

  it('usuário deslogado não vê sino', async () => {
    mockedSession.mockReturnValue(null)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.community-view__bell').exists()).toBe(false)
  })

  it('filtra por busca e limpa', async () => {
    mockedCatalog.mockResolvedValue({
      items: [
        collection,
        { ...collection, id: 8, name: 'Cantatas', authorName: null },
      ],
      page: 1,
      lastPage: 1,
      total: 2,
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('input[type="search"]').setValue('cantatas')
    expect(wrapper.findAll('.community-view__card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Cantatas')

    await wrapper.find('.community-view__search-clear').trigger('click')
    expect(wrapper.findAll('.community-view__card')).toHaveLength(2)
  })

  it('salva cópia com sucesso (registerUse + saveCommunityCopy + reload)', async () => {
    mockedRegisterUse.mockResolvedValue(true)
    mockedSaveCopy.mockResolvedValue(42)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.community-view__copy-btn').trigger('click')
    await flushPromises()

    expect(mockedRegisterUse).toHaveBeenCalledWith(7, 'tok')
    expect(mockedSaveCopy).toHaveBeenCalledWith(collection)
    expect(wrapper.text()).toContain('Salvo')
  })

  it('mostra erro quando saveCommunityCopy falha', async () => {
    mockedRegisterUse.mockResolvedValue(false)
    mockedSaveCopy.mockResolvedValue(null)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.community-view__copy-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Salvo')
    // botão volta a habilitar (savedError não trava)
    expect(
      (wrapper.find('.community-view__copy-btn').element as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('abre dialog de denúncia e submete motivo', async () => {
    mockedReport.mockResolvedValue(true)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-test="community-report"]').trigger('click')
    await wrapper.vm.$nextTick()

    const textarea = document.body.querySelector(
      'textarea',
    ) as HTMLTextAreaElement
    textarea.value = 'conteúdo impróprio'
    textarea.dispatchEvent(new Event('input'))

    const form = document.body.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mockedReport).toHaveBeenCalledWith(7, 'conteúdo impróprio', 'tok')
  })

  it('paginação: goTo busca a página seguinte', async () => {
    const wrapper = mountView()
    await flushPromises()

    mockedCatalog.mockResolvedValue({
      items: [],
      page: 2,
      lastPage: 2,
      total: 25,
    })
    const buttons = wrapper.findAll('.community-view__page-btn')
    // botões: prev, 1, 2, next — clica no "2"
    await buttons[2].trigger('click')
    await flushPromises()

    expect(mockedCatalog).toHaveBeenLastCalledWith(2, 24)
    expect(wrapper.text()).toContain('Nada encontrado')
  })

  it('catálogo vazio mostra estado vazio', async () => {
    mockedCatalog.mockResolvedValue({
      items: [],
      page: 1,
      lastPage: 1,
      total: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Nada encontrado')
  })

  it('prev/next desabilitados corretamente na primeira página', async () => {
    const wrapper = mountView()
    await flushPromises()

    const buttons = wrapper.findAll('.community-view__page-btn')
    expect(
      (buttons[0].element as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (buttons[buttons.length - 1].element as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('CommunityView — denunciar e bloquear (App Store 1.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCatalog.mockResolvedValue({ items: [collection], page: 1, lastPage: 1, total: 1 })
    mockedTasks.mockResolvedValue(null)
    mockedNotifs.mockResolvedValue([])
    mockedSeasonal.mockResolvedValue(null)
    mockedSession.mockReturnValue({
      token: 'tok',
      user: { id_user: 1, email: 'a@b.c', displayName: 'Rafael' },
    })
    moderation.confirm.mockResolvedValue(true)
    moderation.block.mockResolvedValue({ id: 2, name: 'Rafael' })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('coletânea própria não mostra denunciar nem bloquear', async () => {
    mockedCatalog.mockResolvedValue({ items: [{ ...collection, authorId: 1 }], page: 1, lastPage: 1, total: 1 })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-test="community-report"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="community-block-author"]').exists()).toBe(false)
  })

  it('bloquear: confirma, chama a API com o token e recarrega', async () => {
    const wrapper = mountView()
    await flushPromises()
    const loads = mockedCatalog.mock.calls.length
    await wrapper.find('[data-test="community-block-author"]').trigger('click')
    await flushPromises()
    expect(moderation.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }))
    expect(moderation.block).toHaveBeenCalledWith(7, 'tok')
    expect(mockedCatalog.mock.calls.length).toBeGreaterThan(loads)
    expect(wrapper.find('[data-test="community-moderation-msg"]').text()).toContain('community.blockDone')
  })

  it('cancelar não bloqueia; falha avisa erro', async () => {
    const wrapper = mountView()
    await flushPromises()
    moderation.confirm.mockResolvedValueOnce(false)
    await wrapper.find('[data-test="community-block-author"]').trigger('click')
    await flushPromises()
    expect(moderation.block).not.toHaveBeenCalled()

    moderation.block.mockResolvedValueOnce(null)
    await wrapper.find('[data-test="community-block-author"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-view__status--error').exists()).toBe(true)
  })

  it('sem login: pede para entrar e não abre confirmação', async () => {
    mockedSession.mockReturnValue(null)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-test="community-block-author"]').trigger('click')
    await flushPromises()
    expect(moderation.confirm).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="community-moderation-msg"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="community-blocked-users"]').exists()).toBe(false)
  })

  it('usuários bloqueados abre o diálogo e recarrega ao fechar com mudança', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-test="community-blocked-users"]').trigger('click')
    expect(wrapper.find('[data-test="blocked-dialog-mock"]').exists()).toBe(true)
    const loads = mockedCatalog.mock.calls.length
    wrapper.findComponent({ name: 'BlockedAuthorsDialog' }).vm.$emit('close', true)
    await flushPromises()
    expect(wrapper.find('[data-test="blocked-dialog-mock"]').exists()).toBe(false)
    expect(mockedCatalog.mock.calls.length).toBeGreaterThan(loads)
  })
})
