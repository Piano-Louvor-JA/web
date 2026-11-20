import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

import MediaHotkeyHelp from './MediaHotkeyHelp.vue'
import en from '../locales/en'
import es from '../locales/es'
import ptBR from '../locales/pt-BR'

describe('ajuda do teclado do player', () => {
  it.each([['pt-BR', ptBR], ['en', en], ['es', es]] as const)('oferece tooltip por foco em %s e fecha por Escape', async (locale, messages) => {
    const wrapper = mount(MediaHotkeyHelp, {
      props: { hasAudio: true },
      global: { plugins: [createI18n({ legacy: false, locale, messages: { [locale]: messages } })] },
    })
    try {
      const button = wrapper.get('button')
      expect(button.attributes('aria-label')).toBe(messages.media.hotkeys.help)
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
      await button.trigger('focus')
      const tooltip = wrapper.get('[role="tooltip"]')
      expect(button.attributes('aria-describedby')).toBe(tooltip.attributes('id'))
      expect(tooltip.text()).toContain(messages.media.hotkeys.previous)
      expect(tooltip.text()).toContain(messages.media.hotkeys.next)
      expect(tooltip.text()).toContain(messages.media.hotkeys.toggle)
      await button.trigger('keydown', { key: 'Escape' })
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
      await wrapper.setProps({ hasAudio: false })
      await button.trigger('focus')
      expect(wrapper.get('[role="tooltip"]').text()).not.toContain(messages.media.hotkeys.toggle)
    } finally { wrapper.unmount() }
  })
})
