import { ref, computed, type ComputedRef } from 'vue'

const MOBILE_BREAKPOINT = 768

/* v8 ignore next -- guards de SSR (o web é SPA; window sempre existe no browser) */
const mediaQuery = typeof window !== 'undefined'
  ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
  : null

const isMobileRef = ref(mediaQuery?.matches ?? false)

function onMediaChange(e: MediaQueryListEvent) {
  isMobileRef.value = e.matches
}

/* v8 ignore next -- guards de SSR (o web é SPA; window sempre existe no browser) */
if (typeof window !== 'undefined') {
  mediaQuery?.addEventListener('change', onMediaChange)
}

/**
 * Composable para detecção de mobile (≤768px).
 * Usa MediaQueryList para reatividade nativa e performática.
 */
export function useMobileDetection() {
  const isMobile = computed(() => isMobileRef.value)

  return {
    isMobile,
    isDesktop: computed(() => !isMobileRef.value),
  }
}

/**
 * Rotas que requerem desktop (não funcionam bem em mobile).
 * Adicione rotas aqui conforme necessário.
 */
export const DESKTOP_ONLY_ROUTES = [
  'settings-appearance',
  'settings-projection',
  'settings-general',
  'settings-media',
  'liturgy',
  'media',
  'albums',
  'clock',
  'timer',
  'countdown',
  'random',
] as const

export type DesktopOnlyRouteName = typeof DESKTOP_ONLY_ROUTES[number]

/**
 * Verifica se uma rota requer desktop.
 */
export function isDesktopOnlyRoute(routeName: string | null | undefined): routeName is DesktopOnlyRouteName {
  if (!routeName) return false
  return DESKTOP_ONLY_ROUTES.includes(routeName as DesktopOnlyRouteName)
}

/**
 * Composable para mostrar aviso de recurso indisponível no mobile.
 * Retorna funções para verificar e mostrar o aviso.
 */
export function useDesktopOnlyGuard() {
  const { isMobile } = useMobileDetection()

  function checkAndWarn(routeName: string | null | undefined): boolean {
    if (!isDesktopOnlyRoute(routeName)) return true
    if (!isMobile.value) return true

    // Retorna false indicando que deve bloquear/mostrar aviso
    return false
  }

  return {
    checkAndWarn,
    isMobile,
  }
}

/**
 * Mensagem padrão para recursos desktop-only.
 */
export const DESKTOP_ONLY_MESSAGE = {
  title: 'Recurso disponível apenas no desktop',
  description: 'Esta funcionalidade foi projetada para telas maiores e não está disponível em dispositivos móveis.',
  actionLabel: 'Acessar pelo desktop',
  actionHref: '/', // ou link para download/versão desktop
} as const