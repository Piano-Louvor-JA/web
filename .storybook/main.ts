import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|ts)'],
  addons: [],
  viteFinal(config) {
    // O catálogo de componentes não deve instalar o service worker da aplicação.
    config.plugins = (config.plugins ?? []).flat(10).filter(
      (plugin) => !plugin?.name?.startsWith('vite-plugin-pwa'),
    )
    return config
  },
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
}
export default config
