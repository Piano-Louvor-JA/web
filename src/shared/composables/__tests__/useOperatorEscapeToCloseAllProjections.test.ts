// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

import { useOperatorEscapeToCloseAllProjections } from '../useOperatorEscapeToCloseAllProjections'

const mocks = vi.hoisted(() => ({
  media: { isProjecting: false, clearProjection: vi.fn(), requestClose: vi.fn() },
  bible: { isProjecting: false, clearProjectionWindow: vi.fn() },
  random: { isProjecting: false, clearProjection: vi.fn() },
  timer: { isProjecting: false, clearProjection: vi.fn() },
  countdown: { isProjecting: false, clearProjection: vi.fn() },
  clock: { isProjecting: false, clearProjection: vi.fn() },
  liturgy: {
    isProjecting: false,
    clearWebProjection: vi.fn(),
  },
}))

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return { ...actual }
})

vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => mocks.media,
}))
vi.mock('@modules/bible/stores/useBibleStore', () => ({
  useBibleStore: () => mocks.bible,
}))
vi.mock('@modules/random/stores/useRandomStore', () => ({
  useRandomStore: () => mocks.random,
}))
vi.mock('@modules/timer/stores/useTimerStore', () => ({
  useTimerStore: () => mocks.timer,
}))
vi.mock('@modules/countdown/stores/useCountdownStore', () => ({
  useCountdownStore: () => mocks.countdown,
}))
vi.mock('@modules/clock/stores/useClockStore', () => ({
  useClockStore: () => mocks.clock,
}))
vi.mock('@modules/liturgy/stores/useLiturgyStore', () => ({
  useLiturgyStore: () => mocks.liturgy,
}))

vi.mock('@shared/services/popup-windows', () => ({
  hasScreenPopups: vi.fn(() => false),
}))

const routerPush = vi.fn()
const { useRouteMock } = vi.hoisted(() => ({
  useRouteMock: vi.fn(() => ({ name: 'media' })),
}))
vi.mock('vue-router', () => ({
  useRoute: () => useRouteMock(),
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('../useAppConfirm', () => ({ appConfirm: vi.fn() }))

import { appConfirm } from '../useAppConfirm'
import { hasScreenPopups } from '@shared/services/popup-windows'

function mountHook() {
  return mount(
    defineComponent({
      setup() {
        useOperatorEscapeToCloseAllProjections()
        return () => h('div')
      },
    }),
    { global: { plugins: [createPinia()] } },
  )
}

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(appConfirm).mockReset()
  for (const group of Object.values(mocks)) {
    for (const value of Object.values(group)) {
      if (typeof value === 'function') value.mockReset()
      else if (typeof value === 'boolean') group.isProjecting = false
    }
  }
  mocks.liturgy.siteProjectionItemId = undefined
  mocks.liturgy.videoProjectionItemId = undefined
  useRouteMock.mockReset()
  useRouteMock.mockReturnValue({ name: 'media' })
  vi.mocked(hasScreenPopups).mockReturnValue(false)
})

describe('useOperatorEscapeToCloseAllProjections', () => {
  it('não abre confirm sem nenhuma projeção ativa', async () => {
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => {})

    expect(appConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('confirma e fecha TODAS as projeções ativas', async () => {
    mocks.media.isProjecting = true
    mocks.bible.isProjecting = true
    mocks.liturgy.isProjecting = true
    mocks.liturgy.siteProjectionItemId = 3
    vi.mocked(appConfirm).mockResolvedValue(true)
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => expect(appConfirm).toHaveBeenCalled())
    await vi.waitFor(() => {
      expect(mocks.media.clearProjection).toHaveBeenCalledOnce()
      expect(mocks.bible.clearProjectionWindow).toHaveBeenCalledOnce()
      expect(mocks.liturgy.clearWebProjection).toHaveBeenCalledOnce()
    })
    wrapper.unmount()
  })

  it('não fecha nada se operador cancelar', async () => {
    mocks.media.isProjecting = true
    mocks.timer.isProjecting = true
    vi.mocked(appConfirm).mockResolvedValue(false)
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => expect(appConfirm).toHaveBeenCalled())
    await vi.waitFor(() => {})
    expect(mocks.media.clearProjection).not.toHaveBeenCalled()
    expect(mocks.timer.clearProjection).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignora ESC dentro de input/textarea', async () => {
    mocks.media.isProjecting = true
    const wrapper = mountHook()
    const input = document.createElement('input')
    document.body.appendChild(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => {})

    expect(appConfirm).not.toHaveBeenCalled()
    input.remove()
    wrapper.unmount()
  })

  it('ignora ESC com dialog aberto (evita confirm sobre confirm)', async () => {
    mocks.media.isProjecting = true
    const wrapper = mountHook()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => {})

    expect(appConfirm).not.toHaveBeenCalled()
    dialog.remove()
    wrapper.unmount()
  })

  it('ESC sem projeção na rota /media dispara requestClose do now playing', async () => {
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => expect(mocks.media.requestClose).toHaveBeenCalledOnce())

    expect(appConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ESC fora da rota /media sem projeção é no-op', async () => {
    vi.mocked(useRouteMock).mockReturnValueOnce({ name: 'albums' })
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => {})

    expect(mocks.media.requestClose).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('remove o listener ao desmontar', async () => {
    mocks.media.isProjecting = true
    const wrapper = mountHook()
    wrapper.unmount()

    pressEscape()
    await vi.waitFor(() => {})

    expect(appConfirm).not.toHaveBeenCalled()
  })

  it('tecla não-Escape não abre confirm', async () => {
    const wrapper = mountHook()
    mocks.media.isProjecting = true
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await vi.waitFor(() => {})
    expect(appConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('fecha random/timer/countdown/clock projetando (além de media/bíblia/liturgia)', async () => {
    vi.mocked(appConfirm).mockResolvedValue(true)
    mocks.random.isProjecting = true
    mocks.timer.isProjecting = true
    mocks.countdown.isProjecting = true
    mocks.clock.isProjecting = true
    mocks.bible.isProjecting = true
    mocks.liturgy.siteProjectionItemId = 's1'
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => {
      expect(mocks.random.clearProjection).toHaveBeenCalled()
      expect(mocks.timer.clearProjection).toHaveBeenCalled()
      expect(mocks.countdown.clearProjection).toHaveBeenCalled()
      expect(mocks.clock.clearProjection).toHaveBeenCalled()
      expect(mocks.bible.clearProjectionWindow).toHaveBeenCalled()
      expect(mocks.liturgy.clearWebProjection).toHaveBeenCalled()
    })
    wrapper.unmount()
  })

  it('reentrada durante confirm é bloqueada (handling)', async () => {
    let resolveConfirm!: (v: boolean) => void
    vi.mocked(appConfirm).mockReturnValue(new Promise((r) => { resolveConfirm = r }))
    mocks.media.isProjecting = true
    const wrapper = mountHook()

    pressEscape()
    await vi.waitFor(() => expect(appConfirm).toHaveBeenCalledTimes(1))
    pressEscape()
    await vi.waitFor(() => {})
    expect(appConfirm).toHaveBeenCalledTimes(1)

    resolveConfirm(true)
    await vi.waitFor(() => expect(mocks.media.clearProjection).toHaveBeenCalledOnce())
    wrapper.unmount()
  })

  it('liturgy só com videoProjectionItemId também entra nos closers', async () => {
    vi.mocked(appConfirm).mockResolvedValue(true)
    mocks.liturgy.videoProjectionItemId = 'v9'
    const wrapper = mountHook()
    pressEscape()
    await vi.waitFor(() => expect(mocks.liturgy.clearWebProjection).toHaveBeenCalled())
    wrapper.unmount()
  })
})
