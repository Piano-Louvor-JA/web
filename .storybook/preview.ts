import { setup } from '@storybook/vue3-vite'
import { installStorybookPlugins } from './setup'
import type { Preview } from '@storybook/vue3-vite'
import '../src/styles/base.css'
import '../src/styles/tailwind.css'

setup(installStorybookPlugins)

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
