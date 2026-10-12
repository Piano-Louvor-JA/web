<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import EulaDialog from '@shared/components/EulaDialog.vue'
import { useEula } from '@shared/composables/useEula'
import { handleRedirectResult } from '@modules/auth/services/firebase-client'
import { authSession } from '@modules/auth/composables/useAuth'
import { startOutboxTriggers, flushOutbox } from '@modules/sync/services/sync-outbox-service'
import { flushMediaOutbox } from '@modules/media/services/outbox'
import { startSljaMigrationWatch } from '@modules/liturgy/services/local-slja-migration'

const { isAccepted } = useEula()

// WT-5G: popup de projeção NÃO passa pelo gate legal. O aceite é da janela
// do operador (perfil/sessionStorage é por aba em alguns contextos); popup
// recém-aberta sem flag própria ficava presa no EULA = tela branca/preta.
const isPopupWindow = computed(
  () =>
    window.name.startsWith('PopupWindow') ||
    window.name === 'LiturgyWebControl' ||
    route.path.startsWith('/popup'),
)
const route = useRoute()
const showEula = computed(() => !isAccepted.value && !isPopupWindow.value)
const showApp = computed(() => isAccepted.value || isPopupWindow.value)

let stopSync: (() => void) | undefined
const flushMedia = () => { void flushMediaOutbox().catch(console.error) }
window.addEventListener('online', flushMedia)
const stopSessionWatch = watch(() => authSession.value?.token, (token) => {
  if (token && !isPopupWindow.value) flushMedia()
  if (token && !isPopupWindow.value) void flushOutbox().catch(() => {})
})
onUnmounted(() => { stopSync?.(); stopSessionWatch(); window.removeEventListener('online', flushMedia) })

onMounted(async () => {
  flushMedia()
  const result = await handleRedirectResult()
  // web#187: watcher de login — oferta de migração dos .slja locais (1x/sessão)
  startSljaMigrationWatch()
  if (result) {
    // Atualiza o estado reativo (localStorage sozinho não dispara reatividade)
    authSession.value = result
  }
  // sync v2 (web#188): flush on-online + hook de prefs + pull no boot
  if (!isPopupWindow.value) stopSync = startOutboxTriggers()
})
</script>

<template>
  <EulaDialog v-if="showEula" />
  <RouterView v-if="showApp" />
</template>
