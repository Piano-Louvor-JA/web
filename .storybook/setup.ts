import type { App } from 'vue'
import { createPinia } from 'pinia'
import i18n from '../src/plugins/i18n'

/** Instala somente os plugins de apresentação, sem iniciar rede ou sincronização. */
export function installStorybookPlugins(app: App): void {
  app.use(createPinia())
  app.use(i18n)
}
