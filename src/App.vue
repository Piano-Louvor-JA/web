<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import EulaDialog from '@shared/components/EulaDialog.vue'
import { useEula } from '@shared/composables/useEula'
import { handleRedirectResult } from '@modules/auth/services/firebase-client'
// sync v2 (web#183): flush quando a rede volta + pull no boot
import { startOutboxTriggers } from '@modules/sync/services/sync-outbox-service'

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

onMounted(async () => {
  // sync v2 (web#183): popup de projeção não sincroniza estado do operador
  if (!isPopupWindow.value) startOutboxTriggers()
  const result = await handleRedirectResult()
  if (result) {
    // Atualiza o estado reativo (localStorage sozinho não dispara reatividade)
    const { authSession } = await import('@modules/auth/composables/useAuth')
    authSession.value = result
  }
})
</script>

<template>
  <EulaDialog v-if="showEula" />
  <RouterView v-if="showApp" />
</template>
