import { ref, computed, type ComputedRef } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useRouter, type RouteLocationNormalized } from 'vue-router'

const MOBILE_BREAKPOINT = 768

// Estado singleton para o dialog de aviso mobile
const isMobileRef = ref(false)
const mobileWarningDismissed = ref<Record<string, boolean>>({})

function initMobileDetection() {
/* v8 ignore next -- guard de ambiente (web é SPA; no browser o branch ativo é sempre este) */
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    isMobileRef.value = mediaQuery.matches
    mediaQuery.addEventListener('change', (e) => {
      isMobileRef.value = e.matches
    })
  }
}

/* v8 ignore next 2 -- module-level: avaliado no import; SPA nunca roda sem window (SSR) */
if (typeof window !== 'undefined') {
  initMobileDetection()
}

export interface MobileRouteGuardOptions {
  /** Chave única para esta rota (usada para persistir dismiss) */
  routeKey: string
  /** Rota para redirecionar se usuário clicar em "Acessar pelo desktop" */
  desktopRedirectRoute?: string
  /** Título customizado do aviso */
  customTitle?: string
  /** Descrição customizada do aviso */
  customDescription?: string
}

export interface UseMobileRouteGuardReturn {
  isMobile: ComputedRef<boolean>
  shouldShowWarning: ComputedRef<boolean>
  dismissWarning: () => void
  goToDesktop: () => void
  checkRoute: (to: RouteLocationNormalized) => boolean
}

/**
 * Composable para proteger rotas que não funcionam bem no mobile.
 * Retorna true se a navegação deve prosseguir, false se deve ser bloqueada.
 *
 * Uso em navegação:
 * ```ts
 * router.beforeEach((to) => {
 *   const { checkRoute } = useMobileRouteGuard({ routeKey: 'settings-projection' })
 *   return checkRoute(to)
 * })
 * ```
 *
 * Uso em componente para mostrar dialog:
 * ```ts
 * const { shouldShowWarning, dismissWarning, goToDesktop } = useMobileRouteGuard({
 *   routeKey: 'settings-projection'
 * })
 * ```
 */
export function useMobileRouteGuard(options: MobileRouteGuardOptions): UseMobileRouteGuardReturn {
  const { t } = useI18n()
  const router = useRouter()

  const { smAndDown } = useDisplay()

  const isMobile = computed(() => isMobileRef.value || smAndDown.value)

  const shouldShowWarning = computed(() => {
    if (!isMobile.value) return false
    return !mobileWarningDismissed.value[options.routeKey]
  })

  function dismissWarning() {
    mobileWarningDismissed.value[options.routeKey] = true
  }

  function goToDesktop() {
    dismissWarning()
    if (options.desktopRedirectRoute) {
      router.push(options.desktopRedirectRoute)
    }
  }

  function checkRoute(to: RouteLocationNormalized): boolean {
    // Se não for mobile, permitir
    if (!isMobile.value) return true

    // Se já dismissou para esta rota, permitir
    if (mobileWarningDismissed.value[options.routeKey]) return true

    // Bloquear navegação e mostrar warning
    // O componente que usa este guard deve mostrar o dialog
    return false
  }

  return {
    isMobile,
    shouldShowWarning,
    dismissWarning,
    goToDesktop,
    checkRoute,
  }
}

/**
 * Versão simplificada para usar como guard global no router.
 * NÃO usa useDisplay() (que requer contexto de componente Vuetify).
 * Usa apenas isMobileRef (matchMedia) que funciona em qualquer contexto.
 *
 * Rotas com meta.desktopOnly === true são redirecionadas para '/' (home)
 * quando acessadas em mobile/tablet (≤768px), inclusive via URL direta.
 */
export function createMobileRouteGuard(defaultOptions?: Partial<MobileRouteGuardOptions>) {
  return (to: RouteLocationNormalized) => {
    // isMobileRef vem do useMobileDetection (window.matchMedia) — seguro fora de componente
    const isMobile = isMobileRef.value

    if (!isMobile) return true

    // Verificar se a rota tem meta.desktopOnly
    const desktopOnly = to.meta.desktopOnly === true

    if (!desktopOnly) return true

    const routeKey = (to.meta.mobileRouteKey as string) || to.name?.toString() || 'unknown'

    if (mobileWarningDismissed.value[routeKey]) return true

    // Redirecionar para home em vez de apenas bloquear.
    // Dispara evento para feedback visual (toast/snackbar) opcional.
    window.dispatchEvent(new CustomEvent('mobile-route-blocked', {
      detail: {
        routeKey,
        to,
        options: { ...defaultOptions, routeKey },
      },
    }))

    // Redirect para home — cobre acesso via URL direta e via navegação interna
    return { name: 'home', replace: true }
  }
}