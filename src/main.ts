import { registerBibleRuntimeSink } from '@modules/bible/services/bible-runtime'
import { publishToStageRelay } from '@shared/services/palco-cloud-bridge'
import { createApp } from 'vue'
import { installClientPlatformHeader } from './shared/lib/client-platform'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@styles/tailwind.css'
import vuetify from '@plugins/vuetify'
import i18n from '@plugins/i18n'
import router from '@/router'
import { useThemeManager } from '@design-system/composables'
import { APP_PRODUCT_NAME } from '@shared/constants/app'
import { initUiZoom } from '@shared/composables/useUiZoom'
import { installPopupOpenerBridge } from '@shared/services/popup-windows'

registerBibleRuntimeSink((state) => publishToStageRelay('bible', state))

document.title = APP_PRODUCT_NAME

useThemeManager()
initUiZoom()
installPopupOpenerBridge()

installClientPlatformHeader()
const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')
