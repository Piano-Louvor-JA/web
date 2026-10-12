import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAlbumsStore } from '@modules/albums/stores/useAlbumsStore'
import type { MediaPlaybackMode } from '@modules/media/types/media'
import { appConfirm } from '@shared/composables/useAppConfirm'

import { formatMomentDuration } from '../services/liturgy-item-helpers'
import {
  decodeJaBytes,
  parseJaLiturgy,
} from '../services/liturgy-ja-import'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { useScheduledStore } from '../stores/useScheduledStore'
import type { LiturgyDayKey } from '../types/liturgy'
import { useLiturgyClock } from './useLiturgyClock'

/** Orquestra a feature de liturgia na view. */
export function useLiturgy() {
  const store = useLiturgyStore()
  const albumsStore = useAlbumsStore()
  const router = useRouter()
  const { t } = useI18n()

  const {
    selectedDay,
    selectedCustomIndex,
    selectedItemIndex,
    siteProjectionItemId,
    videoProjectionItemId,
    customLiturgies,
    lastActionMessageKey,
    itemDialogOpen,
    editingIndex,
    itemDialogLockedCategory,
    itemDialogHideTypePicker,
    itemDraft,
    customDialogOpen,
    newCustomName,
    countdownRunning,
    canStartCountdown,
    canCloneLiturgy,
    cloneDialogOpen,
    cloneSourceKey,
    cloneSources,
    deletionLocked,
    currentItems,
    currentNotes,
    currentStartTime,
    currentEndTime,
    sessionStartedAt,
    currentCustomTitle,
    isDraftValid,
    categoryOptions,
    complementaryTitleSuggestions,
    musicSearchQuery,
    filteredMusic,
    selectedMusic,
    musicCatalogEmpty,
    musicList,
  } = storeToRefs(store)

  const { lyricOpen, lyricDoc, isLoadingLyric } = storeToRefs(albumsStore)

  const busyMusicId = ref<number | null>(null)

  const musicInstrumentalById = computed(() => {
    const map: Record<number, boolean> = {}
    for (const entry of musicList.value) {
      map[entry.id] = entry.hasInstrumental
    }
    return map
  })

  const clock = useLiturgyClock(
    () => currentStartTime.value,
    () => currentEndTime.value,
    () => countdownRunning.value,
    () => sessionStartedAt.value,
  )

  let syncTimer: number | null = null

  onMounted(() => {
    void store.hydrate()
    void store.syncSiteProjectionState()
    syncTimer = window.setInterval(() => {
      void store.syncSiteProjectionState()
    }, 400)
  })

  onUnmounted(() => {
    if (syncTimer != null) {
      window.clearInterval(syncTimer)
      syncTimer = null
    }
  })

  function worshipLabel(): string {
    if (selectedDay.value === 'custom' && currentCustomTitle.value) {
      return currentCustomTitle.value
    }
    const dayLabel =
      selectedDay.value === 'custom'
        ? t('liturgy.days.custom')
        : t(`liturgy.days.${selectedDay.value}`)
    return t('liturgy.worshipOf', { day: dayLabel })
  }

  const startLabels = computed(() => currentItems.value.map(() => '—'))

  const durationLabels = computed(() =>
    currentItems.value.map((item) => formatMomentDuration(item.durationMs)),
  )

  async function confirmClearLiturgy() {
    if (currentItems.value.length === 0 || deletionLocked.value) return
    if (!await appConfirm({
      title: t('liturgy.clearLiturgy'),
      message: t('liturgy.messages.confirmClear'),
      confirmLabel: t('liturgy.ok'),
      danger: true,
    })) return
    store.clearAllItems()
  }

  async function confirmRemoveItem(index: number) {
    if (deletionLocked.value) return
    const item = currentItems.value[index]
    const message =
      item?.type === 'category'
        ? t('liturgy.messages.confirmDeleteCategory')
        : t('liturgy.messages.confirmDelete')
    if (!await appConfirm({
      title: t('liturgy.editItem'),
      message,
      confirmLabel: t('liturgy.ok'),
      danger: true,
    })) return
    store.removeItem(index)
  }

  async function confirmRemoveCustom(index: number) {
    const name = customLiturgies.value[index]?.name ?? ''
    if (!await appConfirm({
      title: t('liturgy.clearLiturgy'),
      message: t('liturgy.messages.confirmDeleteCustom', { name }),
      confirmLabel: t('liturgy.ok'),
      danger: true,
    })) return
    store.removeCustomLiturgy(index)
  }

  function onSelectItem(index: number) {
    void store.selectItem(index, router)
  }

  function onPlayItemOnScreens(index: number) {
    void store.playItemOnScreens(index)
  }

  function onSelectDay(day: LiturgyDayKey) {
    store.selectDay(day)
  }

  /** Abre seletor de arquivo e retorna bytes (browser: FileReader). */
  function pickFileBytes(accept: string): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
        reader.onerror = () => resolve(null)
        reader.readAsArrayBuffer(file)
      }
      input.click()
    })
  }

  function pickFileText(accept: string): Promise<{ name: string; text: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, text: String(reader.result) })
        reader.onerror = () => resolve(null)
        reader.readAsText(file)
      }
      input.click()
    })
  }

  /** Importa liturgia .ja do LouvorJA Delphi (merge por dia). */
  async function onImportJa() {
    const bytes = await pickFileBytes('.ja')
    if (!bytes) {
      await appConfirm({
        title: t('liturgy.importJa'),
        message: t('liturgy.importJaReadError'),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    let parsed
    try {
      parsed = parseJaLiturgy(decodeJaBytes(bytes))
    } catch {
      await appConfirm({
        title: t('liturgy.importJa'),
        message: t('liturgy.importJaInvalid'),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    const duplicates = store.countJaDuplicates(parsed)
    let mode: 'merge' | 'overwrite' = 'merge'
    if (duplicates > 0) {
      mode = await appConfirm({
        title: t('liturgy.importJaOverwriteTitle'),
        message: t('liturgy.importJaOverwriteAsk', { count: duplicates }),
        confirmLabel: t('liturgy.importJaOverwrite'),
        cancelLabel: t('liturgy.importJaKeep'),
        danger: true,
      })
        ? 'overwrite'
        : 'merge'
    }
    const { added, skipped, days } = await store.importJaDays(parsed, mode)
    lastActionMessageKey.value = null
    await appConfirm({
      title: t('liturgy.importJa'),
      message:
        mode === 'overwrite'
          ? t('liturgy.importJaOverwritten', { added, days: days.length })
          : t('liturgy.importJaDone', { added, skipped, days: days.length }),
      confirmLabel: t('liturgy.ok'),
    })
  }

  /** Importa itens agendados (DATAPACKET XML) do Delphi: 2 arquivos. */
  async function onImportScheduled() {
    const scheduled = useScheduledStore()
    const cats = await pickFileText('.xml')
    if (!cats) return
    // Arquivos irmãos do Delphi ainda não portados — reconhece e avisa.
    const notPorted = ['coletaneasusuario', 'favoritos', 'videosonusuario', 'configpt']
    if (notPorted.some((n) => cats.name.toLowerCase().includes(n))) {
      await appConfirm({
        title: t('liturgy.scheduled.import'),
        message: t('liturgy.scheduled.notPorted', { name: cats.name }),
        confirmLabel: t('liturgy.ok'),
      })
      return
    }
    const items = await pickFileText('.xml')
    const n = scheduled.importFromDelphi(cats.text, items?.text ?? null)
    lastActionMessageKey.value = null
    await appConfirm({
      title: t('liturgy.scheduled.import'),
      message: t('liturgy.scheduled.imported', { count: n }),
      confirmLabel: t('liturgy.ok'),
    })
  }

  async function onManageTeam() {
    await appConfirm({
      title: t('liturgy.team.title'),
      message: t('liturgy.team.comingSoon'),
      confirmLabel: t('liturgy.ok'),
    })
  }

  async function runMusicAction(
    index: number,
    action: () => Promise<boolean | void>,
  ) {
    const item = currentItems.value[index]
    const musicId =
      item?.type === 'music' && item.musicId != null ? item.musicId : null
    busyMusicId.value = musicId
    try {
      await action()
    } finally {
      busyMusicId.value = null
    }
  }

  function onMusicSung(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'audio', router),
    )
  }

  function onMusicInstrumental(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'instrumental', router),
    )
  }

  function onMusicSlides(index: number) {
    albumsStore.closeLyric()
    void runMusicAction(index, () =>
      store.playMusicMode(index, 'no_audio' satisfies MediaPlaybackMode, router),
    )
  }

  function onOpenAddDialog() {
    albumsStore.closeLyric()
    store.openAddDialog()
  }

  function onOpenAddSubItemDialog(categoryId: string) {
    albumsStore.closeLyric()
    store.openAddSubItemDialog(categoryId)
  }

  function onOpenEditDialog(index: number) {
    albumsStore.closeLyric()
    store.openEditDialog(index)
  }

  function onMusicLyric(index: number) {
    const item = currentItems.value[index]
    if (item?.type !== 'music' || item.musicId == null) return
    void runMusicAction(index, () => albumsStore.openLyric(item.musicId!))
  }

  function refreshProjectionState() {
    void store.syncSiteProjectionState()
  }

  return {
    selectedDay,
    selectedCustomIndex,
    selectedItemIndex,
    siteProjectionItemId,
    customLiturgies,
    lastActionMessageKey,
    itemDialogOpen,
    editingIndex,
    itemDialogLockedCategory,
    itemDialogHideTypePicker,
    itemDraft,
    customDialogOpen,
    newCustomName,
    currentItems,
    currentNotes,
    isDraftValid,
    categoryOptions,
    complementaryTitleSuggestions,
    musicSearchQuery,
    filteredMusic,
    selectedMusic,
    musicCatalogEmpty,
    musicInstrumentalById,
    busyMusicId,
    lyricOpen,
    lyricDoc,
    isLoadingLyric,
    startLabels,
    durationLabels,
    worshipLabel,
    headerDateTime: clock.headerDateTime,
    remainingCountdownLabel: clock.remainingCountdownLabel,
    startTimeInput: clock.startTimeInput,
    endTimeInput: clock.endTimeInput,
    countdownExpired: clock.countdownExpired,
    countdownRunning,
    canStartCountdown,
    canCloneLiturgy,
    cloneDialogOpen,
    cloneSourceKey,
    cloneSources,
    deletionLocked,
    videoProjectionItemId,
    selectDay: onSelectDay,
    importJa: onImportJa,
    importScheduled: onImportScheduled,
    selectCustomLiturgy: store.selectCustomLiturgy,
    setSessionStartFromInput: store.setSessionStartFromInput,
    clearSessionStart: store.clearSessionStart,
    setSessionEndFromInput: store.setSessionEndFromInput,
    clearSessionEnd: store.clearSessionEnd,
    startCountdown: store.startCountdown,
    stopCountdown: store.stopCountdown,
    openAddDialog: onOpenAddDialog,
    openAddSubItemDialog: onOpenAddSubItemDialog,
    openEditDialog: onOpenEditDialog,
    closeItemDialog: store.closeItemDialog,
    saveItemDraft: store.saveItemDraft,
    setItemDraft: store.setItemDraft,
    setMusicSearchQuery: store.setMusicSearchQuery,
    confirmRemoveItem,
    confirmClearLiturgy,
    reorderItems: store.reorderItems,
    selectItem: onSelectItem,
    playItemOnScreens: onPlayItemOnScreens,
    toggleItemDone: store.toggleItemDone,
    openCustomDialog: store.openCustomDialog,
    closeCustomDialog: store.closeCustomDialog,
    createCustomLiturgy: store.createCustomLiturgy,
    confirmRemoveCustom,
    openCloneDialog: store.openCloneDialog,
    closeCloneDialog: store.closeCloneDialog,
    cloneLiturgyFromSelected: store.cloneLiturgyFromSelected,
    toggleDeletionLock: store.toggleDeletionLock,
    clearActionMessage: store.clearActionMessage,
    setActionMessage: store.setActionMessage,
    setNotes: store.setNotes,
    onManageTeam,
    onMusicPick: store.onMusicPick,
    refreshMusicCatalog: store.refreshMusicCatalog,
    clearMusicPick: store.clearMusicPick,
    onMusicSung,
    onMusicInstrumental,
    onMusicSlides,
    onMusicLyric,
    closeLyric: albumsStore.closeLyric,
    refreshProjectionState,
  }
}
