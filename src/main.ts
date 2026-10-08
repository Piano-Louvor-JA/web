import { createApp } from 'vue'
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
import { startTelemetry } from '@shared/services/telemetry'

document.title = APP_PRODUCT_NAME

useThemeManager()
initUiZoom()
installPopupOpenerBridge()
void startTelemetry()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')
