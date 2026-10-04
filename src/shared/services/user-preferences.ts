import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { getBrowserItem, setBrowserItem } from '@shared/services/browser-storage'

export type UserPreferences = Record<string, unknown>

/**
 * Hook de sync (web#188): registrado no boot pelo módulo de sync — é
 * chamado a CADA setUserPreference de key sincronizável. Mantém shared
 * sem dependência de modules (inversão).
 */
let prefsChangedHook: ((key: string) => void) | null = null

export function registerPrefsChangedHook(fn: (key: string) => void): void {
  prefsChangedHook = fn
}

export function loadUserPreferences(): UserPreferences {
  return getBrowserItem<UserPreferences>(BROWSER_STORAGE_KEYS.userPreferences, {}) ?? {}
}

export function saveUserPreferences(preferences: UserPreferences): void {
  setBrowserItem(BROWSER_STORAGE_KEYS.userPreferences, preferences)
}

export function setUserPreference(key: string, value: unknown): UserPreferences {
  const current = loadUserPreferences()
  const next = { ...current, [key]: value }
  saveUserPreferences(next)
  try {
    prefsChangedHook?.(key)
  } catch {
    // hook de sync nunca bloqueia o fluxo local
  }
  return next
}

export function getUserPreference<T = unknown>(key: string, fallback: T | null = null): T | null {
  const current = loadUserPreferences()
  if (!(key in current)) return fallback
  return current[key] as T
}

export function clearUserPreferences(): void {
  setBrowserItem(BROWSER_STORAGE_KEYS.userPreferences, {})
}
