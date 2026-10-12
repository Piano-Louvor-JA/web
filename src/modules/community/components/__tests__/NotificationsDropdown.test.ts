// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('../../services/notifications', () => ({
  markAllRead: vi.fn(),
}))

import NotificationsDropdown from '../NotificationsDropdown.vue'
import { markAllRead } from '../../services/notifications'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      notifications: {
        title: 'Notificações',
        markRead: 'Marcar como lidas',
        empty: 'Nada por aqui',
      },
    },
  },
})

function makeNotification(id: number, type = 'badge_granted') {
  return {
    id,
    type,
    title: `Título ${id}`,
    body: `Corpo ${id}`,
    created_at: '2026-09-17T10:00:00Z',
  }
}

// Teleport to="body": o DOM real vai para document.body, não para o wrapper
function mountDropdown(notifications: ReturnType<typeof makeNotification>[]) {
  return mount(NotificationsDropdown, {
    props: { notifications },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

function dropdownEl(): Element | null {
  return document.body.querySelector('.notif-dropdown')
}

describe('NotificationsDropdown', () => {
  beforeEach(() => {
    vi.mocked(markAllRead).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renderiza estado vazio quando não há notificações', () => {
    const wrapper = mountDropdown([])
    expect(dropdownEl()).not.toBeNull()
    expect(document.body.textContent).toContain('Notificações')
    expect(document.body.textContent).toContain('Nada por aqui')
    wrapper.unmount()
  })

  it('não mostra botão de marcar lidas quando não há notificações', () => {
    const wrapper = mountDropdown([])
    expect(document.body.querySelector('.notif-dropdown__mark')).toBeNull()
    wrapper.unmount()
  })

  it('renderiza notificações com título e corpo', () => {
    const wrapper = mountDropdown([makeNotification(1), makeNotification(2)])
    expect(document.body.textContent).toContain('Título 1')
    expect(document.body.textContent).toContain('Corpo 2')
    expect(document.body.textContent).toContain('Marcar como lidas')
    wrapper.unmount()
  })

  it('usa ícone conhecido para tipo mapeado', () => {
    const wrapper = mountDropdown([makeNotification(1, 'music_promoted')])
    const icon = document.body.querySelector('.notif-dropdown__item .ti')
    expect(icon?.classList.contains('ti-trophy')).toBe(true)
    wrapper.unmount()
  })

  it('usa ícone default para tipo desconhecido', () => {
    const wrapper = mountDropdown([makeNotification(1, 'tipo_exotico')])
    const icon = document.body.querySelector('.notif-dropdown__item .ti')
    expect(icon?.classList.contains('ti-bell')).toBe(true)
    wrapper.unmount()
  })

  it('marca como lidas e fecha ao clicar no botão', async () => {
    const wrapper = mountDropdown([makeNotification(1)])

    ;(document.body.querySelector(
      '.notif-dropdown__mark',
    ) as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    expect(markAllRead).toHaveBeenCalledOnce()
    expect(wrapper.emitted('mark-read')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emite close ao clicar fora do dropdown', async () => {
    const wrapper = mountDropdown([makeNotification(1)])
    // aguarda o "armed" do setTimeout(0)
    await new Promise((r) => setTimeout(r, 10))

    document.body.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('não emite close para cliques internos', async () => {
    const wrapper = mountDropdown([makeNotification(1)])
    await new Promise((r) => setTimeout(r, 10))

    ;(document.body.querySelector(
      '.notif-dropdown__head',
    ) as HTMLElement).click()
    await wrapper.vm.$nextTick()
    // clique interno está contido em rootEl — não fecha
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
