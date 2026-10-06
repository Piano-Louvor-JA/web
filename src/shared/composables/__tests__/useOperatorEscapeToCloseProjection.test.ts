// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import { appConfirm } from '../useAppConfirm'
import { useOperatorEscapeToCloseProjection } from '../useOperatorEscapeToCloseProjection'

vi.mock('../useAppConfirm', () => ({ appConfirm: vi.fn() }))

describe('useOperatorEscapeToCloseProjection', () => {
  const isProjectionActive = vi.fn()
  const closeProjection = vi.fn()

  function mountHook() {
    return mount(
      defineComponent({
        setup() {
          useOperatorEscapeToCloseProjection({ isProjectionActive, closeProjection })
          return () => h('div')
        },
      }),
    )
  }

  beforeEach(() => {
    isProjectionActive.mockReset()
    closeProjection.mockReset()
    vi.mocked(appConfirm).mockReset()
  })

  it('confirma e fecha a projeção ao pressionar ESC', async () => {
    isProjectionActive.mockReturnValue(true)
    vi.mocked(appConfirm).mockResolvedValue(true)
    const wrapper = mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    await nextTick()

    expect(appConfirm).toHaveBeenCalledWith({
      title: 'Encerrar projeção?',
      message: 'Há uma projeção ativa. Encerrar agora?',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    expect(closeProjection).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('não fecha se operador cancelar', async () => {
    isProjectionActive.mockReturnValue(true)
    vi.mocked(appConfirm).mockResolvedValue(false)
    const wrapper = mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    await nextTick()

    expect(closeProjection).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignora ESC sem projeção ativa', async () => {
    isProjectionActive.mockReturnValue(false)
    const wrapper = mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(appConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignora ESC digitado em input', async () => {
    isProjectionActive.mockReturnValue(true)
    const wrapper = mountHook()
    const input = document.createElement('input')
    document.body.appendChild(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(appConfirm).not.toHaveBeenCalled()
    input.remove()
    wrapper.unmount()
  })

  it('tecla que não é Escape é ignorada (sem confirm)', async () => {
    const wrapper = mountHook()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
    await nextTick()
    await nextTick()
    expect(appConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ESC dentro de dialog aberto é ignorado (guard anti confirm-sobre-confirm)', async () => {
    isProjectionActive.mockReturnValue(true)
    const wrapper = mountHook()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await nextTick()
      await nextTick()
      expect(appConfirm).not.toHaveBeenCalled()
      expect(closeProjection).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
    wrapper.unmount()
  })

  it('ESC em contenteditable e textarea é ignorado', async () => {
    const wrapper = mountHook()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', target: ta } as KeyboardEventInit & { target: HTMLElement }))
    await nextTick()
    await nextTick()
    expect(appConfirm).not.toHaveBeenCalled()
    ta.remove()

    const ce = document.createElement('div')
    ce.contentEditable = 'true'
    document.body.appendChild(ce)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', target: ce } as KeyboardEventInit & { target: HTMLElement }))
    await nextTick()
    await nextTick()
    expect(appConfirm).not.toHaveBeenCalled()
    ce.remove()
    wrapper.unmount()
  })

  it('reentrada durante confirm em andamento é bloqueada (handling flag)', async () => {
    isProjectionActive.mockReturnValue(true)
    let resolveConfirm!: (v: boolean) => void
    vi.mocked(appConfirm).mockReturnValue(new Promise((r) => { resolveConfirm = r }))
    const wrapper = mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    // segunda ESC enquanto confirm aberto
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(appConfirm).toHaveBeenCalledTimes(1)

    resolveConfirm(true)
    await nextTick()
    await nextTick()
    expect(closeProjection).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
