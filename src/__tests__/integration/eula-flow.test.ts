import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ptBR from '@locales/pt-BR'

// --- Mocks ---

vi.mock('vuetify/components', () => ({
  VBtn: {
    name: 'VBtn',
    emits: ['click'],
    props: { variant: String, size: String, disabled: Boolean },
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}))

vi.mock('@design-system/index', () => ({
  GlassCard: {
    name: 'GlassCard',
    template: '<div class="glass-card-stub"><slot /></div>',
  },
}))

vi.mock('../../../docs/LEGAL/eula/pt-BR.txt?raw', () => ({
  default: 'Mocked EULA text',
}))

import { _resetEulaState } from '@shared/composables/useEula'

// Router minimo para o teste de integracao
const HomeView = { template: '<div data-testid="home">Home Page</div>' }

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: HomeView }],
})

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': ptBR },
})

async function makeWrapper() {
  const App = (await import('@app/../App.vue')).default
  return mount(App, {
    global: {
      plugins: [router, i18n],
      stubs: {
        Teleport: { template: '<div class="teleport-stub"><slot /></div>' },
      },
    },
  })
}

describe('Integracao: App.vue + EulaDialog + useEula', () => {
  beforeEach(async () => {
    localStorage.clear()
    _resetEulaState()
    vi.restoreAllMocks()
    await router.push('/')
  })

  it('mostra EulaDialog e ESCONDE o router-view antes do aceite', { timeout: 20_000 }, async () => {
    const wrapper = await makeWrapper()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Licença')
    expect(wrapper.find('[data-testid="home"]').exists()).toBe(false)
  })

  it('mostra router-view APOS aceitar o EULA', async () => {
    const wrapper = await makeWrapper()
    await wrapper.vm.$nextTick()

    // Simular aceite: rolar ate o fim e clicar Aceito
    const textArea = wrapper.find('[role="region"]')
    Object.defineProperty(textArea.element, 'scrollHeight', { configurable: true, value: 500 })
    Object.defineProperty(textArea.element, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(textArea.element, 'scrollTop', { configurable: true, value: 100 })
    await textArea.trigger('scroll')

    const acceptBtn = wrapper.findAll('button').find((b) => b.text().includes('Aceito'))
    await acceptBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    // Agora o router-view deve aparecer
    expect(wrapper.find('[data-testid="home"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Licença')
  })

  it('persiste aceite: ao remontar, nao mostra EULA novamente', async () => {
    // Primeiro mount: aceitar
    const wrapper1 = await makeWrapper()
    await wrapper1.vm.$nextTick()

    const textArea = wrapper1.find('[role="region"]')
    Object.defineProperty(textArea.element, 'scrollHeight', { configurable: true, value: 500 })
    Object.defineProperty(textArea.element, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(textArea.element, 'scrollTop', { configurable: true, value: 100 })
    await textArea.trigger('scroll')

    const acceptBtn = wrapper1.findAll('button').find((b) => b.text().includes('Aceito'))
    await acceptBtn?.trigger('click')

    // Reset do estado do modulo para simular reload
    _resetEulaState()

    // Segundo mount: ja aceito
    const wrapper2 = await makeWrapper()
    await wrapper2.vm.$nextTick()

    expect(wrapper2.text()).not.toContain('Licença')
    expect(wrapper2.find('[data-testid="home"]').exists()).toBe(true)
  })

  it('fluxo completo de recusa: recusar > confirmar > tela de saida', async () => {
    const wrapper = await makeWrapper()
    await wrapper.vm.$nextTick()

    // Clicar Nao aceito
    const declineBtn = wrapper.findAll('button').find((b) => b.text().includes('Não aceito'))
    await declineBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Tem certeza?')

    // Clicar Sim, recusar
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('Sim, recusar'))
    await confirmBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('não aceitou')
    expect(wrapper.find('[data-testid="home"]').exists()).toBe(false)

    // Verificar que localStorage foi limpo
    expect(localStorage.getItem('eula_accepted_v1')).toBeNull()
  })

  it('aceite e depois recusa (via nova sessao) volta a mostrar EULA', async () => {
    // Sessao 1: aceitar
    localStorage.setItem('eula_accepted_v1', 'true')
    _resetEulaState()

    const wrapper1 = await makeWrapper()
    await wrapper1.vm.$nextTick()
    expect(wrapper1.find('[data-testid="home"]').exists()).toBe(true)

    // Simular limpeza (usuario limpou dados do site)
    localStorage.clear()
    _resetEulaState()

    // Sessao 2: EULA aparece de novo
    const wrapper2 = await makeWrapper()
    await wrapper2.vm.$nextTick()
    expect(wrapper2.text()).toContain('Licença')
  })
})
