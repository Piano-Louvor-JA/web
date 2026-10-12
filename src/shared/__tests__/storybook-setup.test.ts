import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { installStorybookPlugins } from '../../../.storybook/setup'
import LiturgyDayTabs from '@modules/liturgy/components/LiturgyDayTabs.vue'

describe('Storybook: plugins de apresentação', () => {
  it('renderiza a história de dias com traduções reais sem iniciar a aplicação', () => {
    const wrapper = mount(LiturgyDayTabs, {
      props: { selectedDay: 'saturday' },
      global: { plugins: [{ install: installStorybookPlugins }] },
    })
    expect(wrapper.text()).toContain('Sáb')
    expect(wrapper.text()).not.toContain('liturgy.')
    wrapper.unmount()
  })
})
