// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

import RankingView from '../RankingView.vue'
import { getAuthSession } from '@/modules/auth/services/auth-client'
import { getMyPosition, getRanking } from '../../services/ranking'

vi.mock('@/modules/auth/services/auth-client', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('../../services/ranking', () => ({
  getRanking: vi.fn(),
  getMyPosition: vi.fn(),
}))

const mockedRanking = vi.mocked(getRanking)
const mockedMyPosition = vi.mocked(getMyPosition)
const mockedSession = vi.mocked(getAuthSession)

const entries = [
  { user_id: 1, display_name: 'Ana', position: 1, total: 100 },
  { user_id: 2, display_name: 'Bruno', position: 2, total: 80 },
]

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      ranking: {
        title: 'Ranking',
        subtitle: 'Top da comunidade',
        week: 'Semana',
        all: 'Geral',
        myPosition: 'Você está em {position}º',
        notRankedYet: 'Você ainda não está no ranking',
        loginToSeePosition: 'Entre para ver sua posição',
        points: '{points} pts',
      },
      community: { back: 'Voltar', loading: 'Carregando…' },
    },
  },
})

function mountView() {
  return mount(RankingView, {
    global: { plugins: [i18n] },
  })
}

describe('RankingView — integração', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRanking.mockResolvedValue(entries)
    mockedMyPosition.mockResolvedValue({ position: 2, total: 80 })
    mockedSession.mockReturnValue({
      token: 'tok',
      user: { id_user: 2, email: 'b@c.d', displayName: 'Bruno' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('carrega ranking geral e minha posição quando logado', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ranking')
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Bruno')
    expect(wrapper.text()).toContain('Você está em 2º')
    expect(mockedRanking).toHaveBeenCalledWith('all')
    expect(mockedMyPosition).toHaveBeenCalledWith('all', 'tok')
  })

  it('logado sem posição mostra notRankedYet', async () => {
    mockedMyPosition.mockResolvedValue({ position: null, total: 0 })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Você ainda não está no ranking')
  })

  it('deslogado mostra convite de login e não pede posição', async () => {
    mockedSession.mockReturnValue(null)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Entre para ver sua posição')
    expect(mockedMyPosition).toHaveBeenCalledWith('all', null)
  })

  it('trocar aba para semana recarrega com window=week', async () => {
    const wrapper = mountView()
    await flushPromises()

    const tabs = wrapper.findAll('.ranking-view__tab')
    await tabs[0].trigger('click')
    await flushPromises()

    expect(mockedRanking).toHaveBeenLastCalledWith('week')
    expect(mockedMyPosition).toHaveBeenLastCalledWith('week', 'tok')
  })

  it('destaca a linha do usuário logado (row--me)', async () => {
    const wrapper = mountView()
    await flushPromises()

    const meRow = wrapper.find('.ranking-view__row--me')
    expect(meRow.exists()).toBe(true)
    expect(meRow.text()).toContain('Bruno')
  })

  it('destaca o primeiro colocado (row--top)', async () => {
    const wrapper = mountView()
    await flushPromises()

    const topRow = wrapper.find('.ranking-view__row--top')
    expect(topRow.exists()).toBe(true)
    expect(topRow.text()).toContain('Ana')
  })

  it('ranking vazio mostra estado de vazio', async () => {
    mockedRanking.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ana')
    expect(wrapper.find('.ranking-view__list').exists()).toBe(false)
  })
})
