// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import ReportDialog from '../ReportDialog.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      ranking: {
        report: 'Denunciar',
        reportPrompt: 'Motivo da denúncia',
        reportTooShort: 'Mínimo {min} caracteres',
      },
      community: {
        back: 'Voltar',
      },
    },
  },
})

// Teleport to="body": o DOM real vai para document.body, não para o wrapper
function mountDialog(props: { open: boolean; collectionName?: string }) {
  return mount(ReportDialog, {
    props,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

function dialogEl(): Element | null {
  return document.body.querySelector('.report-dialog')
}

describe('ReportDialog', () => {
  it('não renderiza quando open=false', () => {
    const wrapper = mountDialog({ open: false })
    expect(dialogEl()).toBeNull()
    wrapper.unmount()
  })

  it('renderiza quando open=true', async () => {
    const wrapper = mountDialog({ open: true, collectionName: 'Hinos' })
    await nextTick()
    expect(dialogEl()).not.toBeNull()
    expect(document.body.textContent).toContain('Denunciar')
    expect(document.body.textContent).toContain('Hinos')
    wrapper.unmount()
  })

  it('botão submit começa desabilitado', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()
    const submit = document.body.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    wrapper.unmount()
  })

  it('habilita submit com motivo válido e emite submit trimado', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    const textarea = document.body.querySelector(
      'textarea',
    ) as HTMLTextAreaElement
    textarea.value = '  conteúdo impróprio  '
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const form = document.body.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit'))
    await nextTick()

    expect(wrapper.emitted('submit')).toEqual([['conteúdo impróprio']])
    wrapper.unmount()
  })

  it('mostra hint e não emite quando o motivo é curto', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    const textarea = document.body.querySelector(
      'textarea',
    ) as HTMLTextAreaElement
    textarea.value = 'ab'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    expect(document.body.textContent).toContain('Mínimo 3 caracteres')

    const form = document.body.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit'))
    await nextTick()
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('emite close pelo backdrop', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    ;(document.body.querySelector(
      '.report-dialog__backdrop',
    ) as HTMLElement).click()
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emite close pelo botão voltar', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    const backBtn = document.body.querySelector(
      '.report-dialog__btn--secondary',
    ) as HTMLButtonElement
    backBtn.click()
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emite close com tecla esc no textarea', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    const textarea = document.body.querySelector(
      'textarea',
    ) as HTMLTextAreaElement
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('limpa o motivo ao reabrir', async () => {
    const wrapper = mountDialog({ open: true })
    await nextTick()

    let textarea = document.body.querySelector(
      'textarea',
    ) as HTMLTextAreaElement
    textarea.value = 'motivo anterior'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    await wrapper.setProps({ open: false })
    await nextTick()
    await wrapper.setProps({ open: true })
    await nextTick()

    textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
    wrapper.unmount()
  })
})
