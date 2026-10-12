<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { APP_VERSION } from '@shared/constants/app'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'
import { exportLouvorjaFile, importLouvorjaFile } from '@modules/sync/services/louvorja-file'
import {
  exportLouvorjaFromBrowser,
  importLouvorjaIntoBrowser,
} from '@modules/sync/services/louvorja-adapter'
import {
  decodeLouvorjaPackage,
  encodeLouvorjaPackage,
  isValidLouvorjaContent,
} from '@modules/sync/services/louvorja-package'

const { t, locale } = useI18n()

// EN desabilitado por hora — sem assets/conteúdo em inglês.
// ES habilitado (paridade de chaves 100%).
const locales = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'es', label: 'Español' },
  // { value: 'en', label: 'English' },
] as const

const currentLanguage = ref(
  getUserPreference<string>(USER_PREFERENCE_KEYS.language, 'pt-BR') ?? 'pt-BR',
)

function changeLanguage(value: typeof locales[number]['value']) {
  currentLanguage.value = value
  locale.value = value
  setUserPreference(USER_PREFERENCE_KEYS.language, value)
}

type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'success'; messageKey: string; params?: Record<string, unknown> }
  | { kind: 'error'; messageKey: string }

const syncStatus = ref<SyncStatus>({ kind: 'idle' })
const isSyncBusy = ref(false)

async function handleSyncExport() {
  if (isSyncBusy.value) return
  isSyncBusy.value = true
  syncStatus.value = { kind: 'idle' }
  try {
    const pkg = exportLouvorjaFromBrowser(APP_VERSION, 'web')
    const ok = await exportLouvorjaFile(encodeLouvorjaPackage(pkg))
    syncStatus.value = ok
      ? { kind: 'success', messageKey: 'settings.general.syncExported' }
      : { kind: 'error', messageKey: 'settings.general.syncCancelled' }
  } catch (error) {
    console.error('[settings] falha ao exportar pacote', error)
    syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
  } finally {
    isSyncBusy.value = false
  }
}

async function handleSyncImport() {
  if (isSyncBusy.value) return
  isSyncBusy.value = true
  syncStatus.value = { kind: 'idle' }
  try {
    const raw = await importLouvorjaFile()
    if (raw == null) {
      syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncCancelled' }
      return
    }
    if (!isValidLouvorjaContent(raw)) {
      syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
      return
    }
    const result = importLouvorjaIntoBrowser(decodeLouvorjaPackage(raw))
    if (result.applied.includes('liturgy')) {
      // Hidrata o store de liturgia sem F5 (t_89f8d9e3).
      window.dispatchEvent(new CustomEvent('liturgy:imported'))
    }
    if (result.applied.length > 0) {
      syncStatus.value = {
        kind: 'success',
        messageKey: 'settings.general.syncImported',
        params: { applied: result.applied.join(', ') },
      }
    } else {
      syncStatus.value = {
        kind: 'success',
        messageKey: 'settings.general.syncNothingToApply',
        params: {
          localModified: result.localModified ?? '—',
          packageModified: result.packageModified ?? '—',
        },
      }
    }
  } catch (error) {
    console.error('[settings] falha ao importar pacote', error)
    syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
  } finally {
    isSyncBusy.value = false
  }
}
</script>

<template>
  <section class="general-settings">
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__heading">
        <i class="ti ti-world" aria-hidden="true" />
        <h2>{{ t('settings.general.languageTitle') }}</h2>
      </div>
      <p>{{ t('settings.general.languageHint') }}</p>
      <div class="general-settings__languages">
        <button
          v-for="item in locales"
          :key="item.value"
          type="button"
          :class="{ 'general-settings__language--active': currentLanguage === item.value }"
          class="general-settings__language"
          @click="changeLanguage(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </GlassCard>

    <!-- Sincronização (.louvorja) -->
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__heading">
        <i class="ti ti-arrows-exchange" aria-hidden="true" />
        <h2>{{ t('settings.general.syncTitle') }}</h2>
      </div>
      <p>{{ t('settings.general.syncHint') }}</p>
      <div class="general-settings__languages">
        <button
          type="button"
          class="general-settings__language general-settings__sync-btn"
          :disabled="isSyncBusy"
          @click="handleSyncExport"
        >
          <i class="ti ti-file-export" aria-hidden="true" />
          {{ t('settings.general.syncExport') }}
        </button>
        <button
          type="button"
          class="general-settings__language general-settings__sync-btn"
          :disabled="isSyncBusy"
          @click="handleSyncImport"
        >
          <i class="ti ti-file-import" aria-hidden="true" />
          {{ t('settings.general.syncImport') }}
        </button>
      </div>
      <p v-if="syncStatus.kind === 'success'" class="general-settings__status general-settings__status--success">
        <i class="ti ti-circle-check" aria-hidden="true" />
        {{ t(syncStatus.messageKey, syncStatus.params ?? {}) }}
      </p>
      <p v-else-if="syncStatus.kind === 'error'" class="general-settings__status general-settings__status--error">
        <i class="ti ti-alert-circle" aria-hidden="true" />
        {{ t(syncStatus.messageKey) }}
      </p>
    </GlassCard>
  </section>
</template>

<style scoped lang="scss">
.general-settings { max-width: 48rem; display: grid; gap: 1.5rem; }
.general-settings__card { display: grid; gap: 1rem; }
.general-settings__heading { display: flex; gap: .75rem; align-items: center; }
.general-settings__heading h2, .general-settings__card p { margin: 0; }
.general-settings__heading .ti { color: var(--ds-color-primary); font-size: 1.5rem; }
.general-settings__languages { display: flex; flex-wrap: wrap; gap: .75rem; }
.general-settings__language { padding: .65rem 1rem; border: 1px solid var(--ds-color-outline); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; }
.general-settings__language--active { border-color: var(--ds-color-primary); color: var(--ds-color-primary); font-weight: 700; }
.general-settings__sync-btn { display: inline-flex; align-items: center; gap: .5rem; font-weight: 500;

  &:disabled { opacity: .45; cursor: not-allowed; }

  .ti { font-size: 1.1rem; }
}
.general-settings__status { display: flex; align-items: center; gap: .5rem; margin: 0; font-size: .875rem; font-weight: 500; }
.general-settings__status--success { color: #4caf50; }
.general-settings__status--error { color: #ef5350; }
</style>
