<script setup lang="ts">
import { filterAlbumMusicIndex } from '../services/album-music-search'
import { appConfirm } from '@shared/composables/useAppConfirm'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'

import AlbumCollectionCard from '../components/AlbumCollectionCard.vue'
import AlbumHymnalCard from '../components/AlbumHymnalCard.vue'
import AlbumLyricDialog from '../components/AlbumLyricDialog.vue'
import AlbumSearchHitRow from '../components/AlbumSearchHitRow.vue'
import { useAlbums } from '../composables/useAlbums'
import type { AlbumCategory, AlbumCollection } from '../types/albums'

const { t } = useI18n()

import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  removePlaylistItem,
  movePlaylistItem,
  renamePlaylist,
  savePlaylists,
  type Playlist,
} from '../services/playlist-storage'
import {
  parsePlaylistsImport,
  serializePlaylists,
} from '../services/playlist-io'
import { useMediaStore } from '../../media/stores/useMediaStore'
import PopupRouteSelect from '../../settings/components/PopupRouteSelect.vue'

const mediaStore = useMediaStore()
const playlists = ref<Playlist[]>(listPlaylists())
const selectedPlaylistTrack = ref<{
  musicId: number
  albumId: number | null
  title: string
} | null>(null)

const addMusicPlaylistId = ref<string | null>(null)
const addMusicSearchQuery = ref('')
const addMusicSearchResults = computed(() => {
  const query = addMusicSearchQuery.value.trim()

  if (!query) return []

  return filterAlbumMusicIndex(musicIndex.value, query)
})

function isMusicInOpenPlaylist(musicId: number): boolean {
  const playlist = playlists.value.find(
    (item) => item.id === addMusicPlaylistId.value,
  )

  return playlist?.items.some(
    (item) => item.musicId === musicId,
  ) ?? false
}

function openAddMusicSearch(playlistId: string) {
  addMusicSearchQuery.value = ''
  addMusicPlaylistId.value = playlistId
  void hydrateMusicIndex()
}

function addMusicToOpenPlaylist(hit: { musicId: number; name: string }) {
  const playlistId = addMusicPlaylistId.value
  if (!playlistId) return

  const result = addPlaylistItem(playlistId, {
    musicId: hit.musicId,
    albumId: null,
    title: hit.name,
  })

  playlists.value = listPlaylists()

if (result?.added) {
  showAddMusicFeedback(t('albums.playlists.musicAdded'))
} else {
  showAddMusicFeedback(t('albums.playlists.musicAlreadyAdded'))
}
}

function openPlaylistPicker(hit: { musicId: number; name: string }) {
  selectedPlaylistTrack.value = {
    musicId: hit.musicId,
    albumId: null,
    title: hit.name,
  }
  playlists.value = listPlaylists()
}
function addSelectedTrackToPlaylist(playlistId: string) {
  const track = selectedPlaylistTrack.value
  if (!track) return

  const result = addPlaylistItem(playlistId, track)

  playlists.value = listPlaylists()
  selectedPlaylistTrack.value = null

if (result?.added) {
  showImportFeedback(t('albums.playlists.musicAdded'))
} else {
  showImportFeedback(t('albums.playlists.musicAlreadyAdded'))
}
}
const newPlaylistName = ref('')
const renamingPlaylistId = ref<string | null>(null)
const renamingPlaylistName = ref('')
const expandedPlaylistId = ref<string | null>(null)
const importFeedback = ref('')
const addMusicFeedback = ref('')
let importFeedbackTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => {
  if (importFeedbackTimer) clearTimeout(importFeedbackTimer)
})

function showImportFeedback(message: string) {
  importFeedback.value = message
  if (importFeedbackTimer) clearTimeout(importFeedbackTimer)
  importFeedbackTimer = setTimeout(() => {
    importFeedback.value = ''
  }, 2600)
}

let addMusicFeedbackTimer: ReturnType<typeof setTimeout> | undefined

function showAddMusicFeedback(message: string) {
  addMusicFeedback.value = message

  if (addMusicFeedbackTimer) {
    clearTimeout(addMusicFeedbackTimer)
  }

  addMusicFeedbackTimer = setTimeout(() => {
    addMusicFeedback.value = ''
  }, 2600)
}

const fileInput = ref<HTMLInputElement | null>(null)

function exportPlaylists() {
  if (playlists.value.length === 0) return
  const payload = JSON.stringify(serializePlaylists(playlists.value), null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const today = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `playlists-${today}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Permite re-selecionar o mesmo arquivo depois.
  input.value = ''
  if (!file) return
  void file.text().then((raw) => {
    const result = parsePlaylistsImport(raw)
    if (!result.ok) {
      showImportFeedback(t('albums.playlists.invalidFile'))
      return
    }
    // Merge por nome: playlist nova entra; existente ganha só faixas novas.
    const current = listPlaylists()
    const byName = new Map(current.map((p) => [p.name.toLowerCase(), p]))
    let addedTracks = 0
    let newLists = 0
    for (const imported of result.playlists) {
      const existing = byName.get(imported.name.toLowerCase())
      if (!existing) {
        current.push(imported)
        byName.set(imported.name.toLowerCase(), imported)
        newLists += 1
        addedTracks += imported.items.length
        continue
      }
      for (const item of imported.items) {
        const dup = existing.items.some(
          (i) => i.musicId === item.musicId && i.albumId === item.albumId,
        )
        if (!dup) {
          existing.items.push(item)
          addedTracks += 1
        }
      }
    }
    if (newLists > 0 || addedTracks > 0) {
      savePlaylists(current)
      playlists.value = listPlaylists()
    }
    const summary: string[] = []
    if (newLists > 0) {
      summary.push(
        t('albums.playlists.newLists', { count: newLists }),
      )
    }
    if (addedTracks > 0) {
      summary.push(
        t('albums.playlists.addedTracks', { count: addedTracks }),
      )
    }
    showImportFeedback(
      summary.length > 0
        ? t('albums.playlists.imported', { summary: summary.join(', ') })
        : t('albums.playlists.nothingToImport'),
    )
  })
}

function addPlaylist() {
  const name = newPlaylistName.value.trim()
  if (!name) return
  createPlaylist(name)
  playlists.value = listPlaylists()
  newPlaylistName.value = ''
}

// --- Minhas Coletâneas (custom, via API /v1/custom) ---
import {
  createCustomCollection,
  listCustomCollections,
  fromCustomCollectionId,
  updateCustomCollection,
  uploadCustomFile,
  customFileUrl,
  type CustomCollectionSummary,
  toCustomCollectionId,
} from '@modules/media/services/custom-catalog'

const customCollections = ref<CustomCollectionSummary[]>([])
const isLoadingCustomCollections = ref(false)
const customCollectionsLoaded = ref(false)

/** Coletâneas custom no formato AlbumCollection (mesma estética dos álbuns). */
const customCollectionCards = computed<AlbumCollection[]>(() =>
  customCollections.value.map((c) => ({
    id: toCustomCollectionId(c.id),
    kind: 'album' as const,
    name: c.name,
    subtitle: c.description ?? '',
    coverUrl: c.coverUrl ? customFileUrl(c.coverUrl) : null,
    trackCount: c.musicsCount,
    catalogKey: `custom_collection_${c.id}`,
    isCustom: true,
  })),
)

// Modais compactos (Playlists / Minhas Coletâneas)
const playlistsModalOpen = ref(false)
const customModalOpen = ref(false)

// Criação de coletânea custom
const newCustomCollectionName = ref('')

async function onCreateCustomCollection(): Promise<void> {
  const name = newCustomCollectionName.value.trim()
  if (!name) return
  const created = await createCustomCollection(name)
  newCustomCollectionName.value = ''
  customCollectionsLoaded.value = false
  await hydrateCustomCollections()
  if (created) {
    const routeId = toCustomCollectionId(created.id)
    openCustomCollection(routeId)
  }
}

async function hydrateCustomCollections() {
  if (customCollectionsLoaded.value) return
  isLoadingCustomCollections.value = true
  try {
    customCollections.value = await listCustomCollections()
    customCollectionsLoaded.value = true
  } finally {
    isLoadingCustomCollections.value = false
  }
}

const showCustomCollections = computed(
  () =>
    customCollections.value.length > 0 ||
    isLoadingCustomCollections.value === true,
)

function openCustomCollection(id: number) {
  router.push({
    name: 'albums-collection',
    params: { collectionId: String(toCustomCollectionId(id)) },
  })
}

onMounted(() => {
  void hydrateCustomCollections()
})

async function removePlaylist(id: string) {
  const playlist = playlists.value.find((item) => item.id === id)
  if (!playlist) return

  const confirmed = await appConfirm({
    title: t('albums.playlists.deleteConfirmTitle', { name: playlist.name }),
    message: t('albums.playlists.deleteConfirmMessage'),
    confirmLabel: t('albums.playlists.deleteConfirmButton'),
    danger: true,
  })

  if (!confirmed) return

  deletePlaylist(id)
  playlists.value = listPlaylists()

  if (expandedPlaylistId.value === id) {
    expandedPlaylistId.value = null
  }

  if (renamingPlaylistId.value === id) {
    renamingPlaylistId.value = null
    renamingPlaylistName.value = ''
  }
}

function startRenamePlaylist(playlist: Playlist) {
  renamingPlaylistId.value = playlist.id
  renamingPlaylistName.value = playlist.name
}

function confirmRenamePlaylist(id: string, newName: string) {
  const name = newName.trim()
  if (!name) return

  const updated = renamePlaylist(id, name)
  if (!updated) return

  playlists.value = listPlaylists()
  renamingPlaylistId.value = null
  renamingPlaylistName.value = ''
  showImportFeedback(t('albums.playlists.renamed'))
}

function removePlaylistTrack(id: string, index: number) {
  removePlaylistItem(id, index)
  playlists.value = listPlaylists()
}

function movePlaylistTrack(
  playlistId: string,
  fromIndex: number,
  toIndex: number,
) {
  const result = movePlaylistItem(playlistId, fromIndex, toIndex)

  if (!result) return

  playlists.value = listPlaylists()
}

const draggedPlaylistTrack = ref<{
  playlistId: string
  index: number
} | null>(null)

function onPlaylistTrackDragStart(
  playlistId: string,
  index: number,
  event: DragEvent,
) {
  draggedPlaylistTrack.value = { playlistId, index }

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onPlaylistTrackDrop(
  playlistId: string,
  targetIndex: number,
) {
  const dragged = draggedPlaylistTrack.value

  if (!dragged || dragged.playlistId !== playlistId) return

  if (dragged.index !== targetIndex) {
    movePlaylistTrack(playlistId, dragged.index, targetIndex)
  }

  draggedPlaylistTrack.value = null
}

function onPlaylistTrackDragEnd() {
  draggedPlaylistTrack.value = null
}

function togglePlaylist(id: string) {
  expandedPlaylistId.value = expandedPlaylistId.value === id ? null : id
}

async function playPlaylist(playlist: Playlist) {
  if (playlist.items.length === 0) {
    showImportFeedback(t('albums.playlists.emptyPlayback'))
    return
  }

  await mediaStore.playQueue(playlist.items, 0)
  void router.push({ name: 'media' })
}
async function playPlaylistShuffle(playlist: Playlist) {
  if (playlist.items.length === 0) {
    showImportFeedback(t('albums.playlists.emptyPlayback'))
    return
  }

  const shuffledItems = [...playlist.items]

  for (let i = shuffledItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledItems[i], shuffledItems[j]] = [
      shuffledItems[j]!,
      shuffledItems[i]!,
    ]
  }

  await mediaStore.playQueue(shuffledItems, 0)
  void router.push({ name: 'media' })
}

async function playPlaylistTrack(
  playlist: Playlist,
  trackIndex: number,
) {
  await mediaStore.playQueue(playlist.items, trackIndex)
  void router.push({ name: 'media' })
}

const router = useRouter()

const {
  categories,
  musicIndex,
  hubSearchQuery,
  hubSearchResults,
  isHubSearching,
  isLoadingCatalog,
  isLoadingMusicIndex,
  lastErrorKey,
  lastActionMessageKey,
  lyricOpen,
  lyricDoc,
  isLoadingLyric,
  clearError,
  clearActionMessage,
  hydrateCatalog,
  hydrateMusicIndex,
  playSung,
  playInstrumental,
  playSlides,
  openLyric,
  closeLyric,
} = useAlbums()

const albumCoverByName = computed(() => {
  const covers = new Map<string, string>()

  for (const category of categories.value) {
    for (const collection of category.collections) {
      if (!collection.coverUrl) continue

      covers.set(
        collection.name.trim().toLocaleLowerCase(),
        collection.coverUrl,
      )
    }
  }

  return covers
})

function getMusicCover(albumNames: string): string | null {
  const names = albumNames.split(',').map((name) => name.trim().toLocaleLowerCase())

  for (const name of names) {
    const cover = albumCoverByName.value.get(name)
    if (cover) return cover
  }

  return null
}

const busyMusicId = ref<number | null>(null)

function isHymnalsCategory(category: AlbumCategory) {
  return String(category.id) === 'hymnals'
}

function categoryTitle(category: AlbumCategory) {
  if (isHymnalsCategory(category)) return t('albums.categories.hymnals')
  if (
    category.name === 'CDs Oficiais/Ano' ||
    /cds?\s*oficiais/i.test(category.name)
  ) {
    return t('albums.categories.youthAlbums')
  }
  return category.name
}

function categorySubtitle(category: AlbumCategory) {
  if (isHymnalsCategory(category)) return t('albums.categories.hymnalsSubtitle')
  if (
    category.name === 'CDs Oficiais/Ano' ||
    /cds?\s*oficiais/i.test(category.name)
  ) {
    return t('albums.categories.albumsSubtitle')
  }
  return t('albums.categories.defaultSubtitle')
}

function openCollection(collectionId: string | number) {
  router.push({
    name: 'albums-collection',
    params: { collectionId: String(collectionId) },
  })
}

function retry() {
  clearError()
  hydrateCatalog()
}

function clearHubSearch() {
  hubSearchQuery.value = ''
}

function playSingleHubResult(): void {
  if (hubSearchResults.value.length !== 1) return
  const hit = hubSearchResults.value[0]
  if (!hit) return
  void runAction(hit.musicId, () => playSung(hit.musicId))
}

async function runAction(
  musicId: number,
  action: () => Promise<boolean | void>,
) {
  busyMusicId.value = musicId
  try {
    await action()
  } finally {
    busyMusicId.value = null
  }
}
</script>

<template>
  <section class="albums-view">
    <header class="albums-view__header">
      <div class="albums-view__brand">
        <div class="albums-view__icon">
          <i
            class="ti ti-music"
            aria-hidden="true"
          />
        </div>
        <div class="albums-view__headings">
          <h1 class="albums-view__title">
            {{ t('albums.title') }}
          </h1>
          <p class="albums-view__subtitle">
            {{ t('albums.subtitle') }}
          </p>
        </div>
      </div>

      <div class="albums-view__header-actions">
        <label class="albums-view__search">
          <i
            class="ti ti-search"
            aria-hidden="true"
          />
          <input
            v-model="hubSearchQuery"
            type="search"
            :placeholder="t('albums.hubSearchPlaceholder')"
            :aria-label="t('albums.hubSearchPlaceholder')"
            @keydown.enter.prevent="playSingleHubResult"
          >
          <button
            v-if="isHubSearching"
            type="button"
            class="albums-view__search-clear"
            :aria-label="t('albums.clearSearch')"
            :title="t('albums.clearSearch')"
            @click="clearHubSearch"
          >
            <i
              class="ti ti-x"
              aria-hidden="true"
            />
          </button>
        </label>
        <button
          type="button"
          class="albums-view__toolbar-btn"
          :aria-label="t('albums.playlists.title')"
          @click="playlistsModalOpen = true"
        >
          <i class="ti ti-playlist" aria-hidden="true" />
          {{ t('albums.playlists.title') }}
          <span
            v-if="playlists.length > 0"
            class="albums-view__toolbar-count"
          >{{ playlists.length }}</span>
        </button>
        <button
          type="button"
          class="albums-view__toolbar-btn"
          :aria-label="t('albums.custom.title')"
          @click="customModalOpen = true"
        >
          <i class="ti ti-folder" aria-hidden="true" />
          {{ t('albums.custom.title') }}
          <span
            v-if="customCollections.length > 0"
            class="albums-view__toolbar-count"
          >{{ customCollections.length }}</span>
        </button>
      </div>
      <PopupRouteSelect module="media" compact />
    </header>

    <!-- Modal: Playlists -->
    <Teleport to="body">
      <div
        v-if="playlistsModalOpen"
        class="albums-view__modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('albums.playlists.title')"
      >
        <div
          class="albums-view__modal-backdrop"
          aria-hidden="true"
          @click="playlistsModalOpen = false"
        />
        <GlassCard class="albums-view__modal-panel">
          <header class="albums-view__modal-header">
            <div class="albums-view__playlists-heading">
              <i class="ti ti-playlist" aria-hidden="true" />
              <h2>{{ t('albums.playlists.title') }}</h2>
            </div>
            <button
              type="button"
              class="albums-view__playlists-io"
              :aria-label="t('albums.lyric.close')"
              @click="playlistsModalOpen = false"
            >
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>

          <form class="albums-view__modal-form" @submit.prevent="addPlaylist">
            <input
              v-model="newPlaylistName"
              required
              :placeholder="t('albums.playlists.newPlaceholder')"
              :aria-label="t('albums.playlists.newPlaceholder')"
            >
            <button type="submit">
              <i class="ti ti-plus" aria-hidden="true" /> {{ t('albums.playlists.create') }}
            </button>
            <button
              type="button"
              class="albums-view__playlists-io"
              data-testid="playlists-export"
              :disabled="playlists.length === 0"
              :aria-label="t('albums.playlists.export')"
              :title="t('albums.playlists.export')"
              @click="exportPlaylists"
            >
              <i class="ti ti-upload" aria-hidden="true" />
            </button>
            <label
              class="albums-view__playlists-io"
              data-testid="playlists-import"
              :aria-label="t('albums.playlists.import')"
              :title="t('albums.playlists.import')"
            >
              <i class="ti ti-download" aria-hidden="true" />
              <input
                ref="fileInput"
                type="file"
                accept="application/json,.json"
                hidden
                @change="onImportFileChange"
              >
            </label>
          </form>

          <p
            v-if="importFeedback"
            class="albums-view__playlists-feedback"
            role="status"
            aria-live="polite"
          >
            {{ importFeedback }}
          </p>

          <div
            v-if="playlists.length === 0"
            class="albums-view__state albums-view__playlists-empty"
          >
            <i class="ti ti-music-plus" aria-hidden="true" />
            {{ t('albums.playlists.empty') }}
          </div>

          <TransitionGroup
            v-else
            name="playlist-card"
            tag="div"
            class="albums-view__playlists-list"
          >
            <article
              v-for="playlist in playlists"
              :key="playlist.id"
              class="albums-view__playlist"
              :class="{ 'albums-view__playlist--open': expandedPlaylistId === playlist.id }"
            >
              <div class="albums-view__playlist-row">
                <button
                  type="button"
                  class="albums-view__playlist-toggle"
                  :aria-expanded="expandedPlaylistId === playlist.id"
                  @click="togglePlaylist(playlist.id)"
                >
                  <span class="albums-view__playlist-icon">
                    <i
                      class="ti"
                      :class="playlist.items.length > 0 ? 'ti-playlist' : 'ti-music-off'"
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    v-if="renamingPlaylistId !== playlist.id"
                    class="albums-view__playlist-name"
                  >
                    <strong>{{ playlist.name }}</strong>
                    <small>{{ t('albums.trackCount', { count: playlist.items.length }) }}</small>
                  </span>
                  <i
                    class="ti albums-view__playlist-chevron"
                    :class="expandedPlaylistId === playlist.id ? 'ti-chevron-down' : 'ti-chevron-right'"
                    aria-hidden="true"
                  />
                </button>
                <input
                  v-if="renamingPlaylistId === playlist.id"
                  v-model="renamingPlaylistName"
                  data-testid="playlist-rename-input"
                  class="albums-view__playlist-rename-input"
                  :aria-label="t('albums.playlists.rename', { name: playlist.name })"
                  @keydown.enter.prevent="confirmRenamePlaylist(playlist.id, renamingPlaylistName)"
                  @keydown.esc.prevent="renamingPlaylistId = null"
                />
                <div class="albums-view__playlist-actions">

                  <button
                    type="button"
                    class="albums-view__playlist-rename"
                    data-testid="playlist-add-music"
                    :aria-label="t('albums.playlists.addSongsToPlaylist', { name: playlist.name })"
                    :title="t('albums.playlists.addSongsToPlaylist', { name: playlist.name })"
                    @click="openAddMusicSearch(playlist.id)"
                  >
                  <i class="ti ti-plus" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="albums-view__playlist-rename"
                    data-testid="playlist-rename"
                    :aria-label="t('albums.playlists.rename', { name: playlist.name })"
                    :title="t('albums.playlists.rename', { name: playlist.name })"
                    @click="startRenamePlaylist(playlist)"
                    >
                    <i class="ti ti-pencil" aria-hidden="true" />
                    </button>

                  <button
                    v-if="renamingPlaylistId === playlist.id"
                    type="button"
                    class="albums-view__playlist-rename"
                    data-testid="playlist-rename-save"
                    :aria-label="t('albums.playlists.save')"
                    @click="confirmRenamePlaylist(playlist.id, renamingPlaylistName)"
                  >
                          <span>{{ t('albums.playlists.save') }}</span>
                  </button>

                  <button
                      v-if="renamingPlaylistId === playlist.id"
                      type="button"
                      class="albums-view__playlist-rename"
                      data-testid="playlist-rename-cancel"
                      :aria-label="t('common.cancel')"
                      @click="renamingPlaylistId = null"
                    >
                          <span>{{ t('common.cancel') }}</span>
                    </button>

                   <button
                    type="button"
                    class="albums-view__playlist-play"
                    data-testid="playlist-shuffle"
                    :aria-label="t('albums.playlists.playShuffle', { name: playlist.name })"
                    :title="t('albums.playlists.playShuffle', { name: playlist.name })"
                    @click="playPlaylistShuffle(playlist)"
                  >
                    <i class="ti ti-arrows-shuffle" aria-hidden="true" />
                  </button>
                 <button
                  type="button"
                  class="albums-view__playlist-play"
                  data-testid="playlist-play"
                  :aria-label="t('albums.playlists.play', { name: playlist.name })"
                  :title="t('albums.playlists.play', { name: playlist.name })"
                  @click="playPlaylist(playlist)"
                  >
                  <i class="ti ti-player-play" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="albums-view__playlist-remove"
                    data-testid="playlist-delete"
                    :aria-label="t('albums.playlists.remove', { name: playlist.name })"
                    @click="removePlaylist(playlist.id)"
                  >
                    <i class="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Transition name="playlist-tracks">
                <ul
                  v-if="expandedPlaylistId === playlist.id && playlist.items.length > 0"
                  class="albums-view__playlist-tracks"
                >
                  <li
                    v-for="(item, index) in playlist.items"
                    :key="`${item.musicId}-${index}`"
                    draggable="true"
                    @dragstart="onPlaylistTrackDragStart(playlist.id, index, $event)"
                    @dragover.prevent
                    @drop.prevent="onPlaylistTrackDrop(playlist.id, index)"
                    @dragend="onPlaylistTrackDragEnd"
                  >
                    <span
                      class="albums-view__playlist-track-drag"
                      aria-hidden="true"
                      title="Arraste para reorganizar"
                    >
                      <i class="ti ti-grip-vertical" />
                    </span>
                    <span class="albums-view__playlist-track-index">{{ index + 1 }}</span>
                    <button
                      type="button"
                      class="albums-view__playlist-track-remove"
                      :aria-label="`Reproduzir ${item.title}`"
                      :title="`Reproduzir ${item.title}`"
                      @click="playPlaylistTrack(playlist, index)"
                    >
                      <i class="ti ti-player-play" aria-hidden="true" />
                    </button>
                    <span class="albums-view__playlist-track-title">{{ item.title }}</span>
                    <button
                      type="button"
                      class="albums-view__playlist-track-remove"
                      :aria-label="t('albums.playlists.removeTrack', { name: item.title })"
                      @click="removePlaylistTrack(playlist.id, index)"
                    >
                      <i class="ti ti-x" aria-hidden="true" />
                    </button>
                  </li>
                </ul>
              </Transition>
            </article>
          </TransitionGroup>
        </GlassCard>
      </div>
    </Teleport>

    <!-- Modal: Minhas Coletâneas -->
    <Teleport to="body">
      <div
        v-if="customModalOpen"
        class="albums-view__modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('albums.custom.title')"
      >
        <div
          class="albums-view__modal-backdrop"
          aria-hidden="true"
          @click="customModalOpen = false"
        />
        <GlassCard class="albums-view__modal-panel">
          <header class="albums-view__modal-header">
            <div class="albums-view__playlists-heading">
              <i class="ti ti-folder" aria-hidden="true" />
              <h2>{{ t('albums.custom.title') }}</h2>
            </div>
            <button
              type="button"
              class="albums-view__playlists-io"
              :aria-label="t('albums.lyric.close')"
              @click="customModalOpen = false"
            >
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>

          <div
            v-if="isLoadingCustomCollections"
            class="albums-view__state albums-view__playlists-empty"
          >
            {{ t('albums.loading') }}
          </div>

          <div
            v-else-if="customCollections.length === 0"
            class="albums-view__state albums-view__playlists-empty"
          >
            <i class="ti ti-music-plus" aria-hidden="true" />
            {{ t('albums.custom.empty') }}
          </div>

          <div
            v-else
            class="albums-view__custom-grid"
          >
            <button
              v-for="collection in customCollections"
              :key="collection.id"
              type="button"
              class="albums-view__custom-card"
              :aria-label="t('albums.custom.open', { name: collection.name })"
              @click="openCustomCollection(collection.id)"
            >
              <span class="albums-view__custom-icon">
                <i class="ti ti-disc" aria-hidden="true" />
              </span>
              <span class="albums-view__custom-info">
                <strong>{{ collection.name }}</strong>
                <small>
                  {{ t('albums.custom.trackCount', { count: collection.musicsCount }) }}
                </small>
              </span>
              <i class="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <form class="albums-view__modal-form" @submit.prevent="onCreateCustomCollection">
            <input
              v-model="newCustomCollectionName"
              required
              :placeholder="t('albums.custom.newPlaceholder')"
              :aria-label="t('albums.custom.newPlaceholder')"
            >
            <button type="submit">
              <i class="ti ti-plus" aria-hidden="true" /> {{ t('albums.custom.create') }}
            </button>
          </form>

          <footer class="albums-view__modal-footer">
            <button
              type="button"
              class="albums-view__custom-editor-btn"
              :aria-label="t('albums.custom.openEditor')"
              :title="t('albums.custom.openEditor')"
              @click="router.push({ name: 'media-editor' })"
            >
              <i class="ti ti-pencil" aria-hidden="true" />
              {{ t('albums.custom.openEditor') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Teleport>

    <!-- Hinários Oficiais -->

    <div
      v-if="lastActionMessageKey && !lastActionMessageKey.startsWith('media.messages.')"
      class="albums-view__alert"
      role="status"
    >
      <p>{{ t(lastActionMessageKey) }}</p>
      <button
        type="button"
        @click="clearActionMessage"
      >
        {{ t('albums.dismiss') }}
      </button>
    </div>

    <div
      v-if="lastErrorKey && !isHubSearching"
      class="albums-view__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <button
        type="button"
        @click="retry"
      >
        {{ t('albums.retry') }}
      </button>
    </div>

    <template v-else-if="isHubSearching">
      <GlassCard
        class="albums-view__results-card"
        :padding="false"
        elevated
      >
        <div class="albums-view__results-head">
          <h2 class="albums-view__results-title">
            {{ t('albums.searchResultsTitle') }}
          </h2>
        </div>

        <div
          v-if="isLoadingMusicIndex"
          class="albums-view__state albums-view__state--inset"
        >
          {{ t('albums.loading') }}
        </div>

        <div
          v-else-if="hubSearchResults.length === 0"
          class="albums-view__state albums-view__state--inset"
        >
          {{ t('albums.messages.searchEmpty') }}
        </div>

        <div
          v-else
          class="albums-view__results-list"
        >
          <AlbumSearchHitRow
            v-for="hit in hubSearchResults"
            :key="hit.musicId"
            :hit="hit"
            :busy="busyMusicId === hit.musicId"
            @sung="runAction(hit.musicId, () => playSung(hit.musicId))"
            @instrumental="
              runAction(hit.musicId, () => playInstrumental(hit.musicId))
            "
            @slides="runAction(hit.musicId, () => playSlides(hit.musicId))"
            @lyric="runAction(hit.musicId, () => openLyric(hit.musicId))"
            @playlist="openPlaylistPicker(hit)"
          />
        </div>
      </GlassCard>
    </template>

    <div
      v-else-if="isLoadingCatalog"
      class="albums-view__state"
    >
      {{ t('albums.loading') }}
    </div>

    <div
      v-else-if="categories.length === 0"
      class="albums-view__state"
    >
      {{ t('albums.messages.catalogEmpty') }}
    </div>

    <div
      v-else
      class="albums-view__body"
    >
      <!-- Minhas Coletâneas (custom, API /v1/custom): mesma estética dos álbuns -->
      <section
        v-if="customCollections.length > 0"
        class="albums-view__category albums-view__category--custom"
      >
        <header class="albums-view__category-header">
          <h2 class="albums-view__category-title">
            {{ t('albums.custom.title') }}
          </h2>
          <p class="albums-view__category-subtitle">
            {{ t('albums.custom.sectionSubtitle') }}
          </p>
        </header>
        <GlassCard
          class="albums-view__grid-wrap"
          :padding="false"
          elevated
        >
          <div class="albums-view__grid">
            <AlbumCollectionCard
              v-for="collection in customCollectionCards"
              :key="String(collection.id)"
              :collection="collection"
              @open="openCustomCollection(fromCustomCollectionId(Number(collection.id)))"
            />
          </div>
        </GlassCard>
      </section>

      <section
        v-for="category in categories"
        :key="String(category.id)"
        class="albums-view__category"
        :class="{
          'albums-view__category--hymnals': isHymnalsCategory(category),
        }"
      >
        <header class="albums-view__category-header">
          <h2 class="albums-view__category-title">
            {{ categoryTitle(category) }}
          </h2>
          <p class="albums-view__category-subtitle">
            {{ categorySubtitle(category) }}
          </p>
        </header>

        <div
          v-if="isHymnalsCategory(category)"
          class="albums-view__hymnal-grid"
        >
          <AlbumHymnalCard
            v-for="collection in category.collections"
            :key="String(collection.id)"
            :collection="collection"
            @open="openCollection(collection.id)"
          />
        </div>

        <GlassCard
          v-else
          class="albums-view__grid-wrap"
          :padding="false"
          elevated
        >
          <div class="albums-view__grid">
            <AlbumCollectionCard
              v-for="collection in category.collections"
              :key="String(collection.id)"
              :collection="collection"
              @open="openCollection(collection.id)"
            />
          </div>
        </GlassCard>
      </section>
    </div>

    <!-- Janela para adicionar músicas à playlist -->
    <Teleport to="body">
<div
  v-if="addMusicPlaylistId"
  class="albums-view__playlist-picker-overlay"
  @click.self="addMusicPlaylistId = null"
>
  <div
    class="albums-view__playlist-picker albums-view__playlist-picker--music-search"
:class="{
  'albums-view__playlist-picker--expanded':
    addMusicSearchQuery.trim().length > 0 &&
    addMusicSearchResults.length > 0
}"
    role="dialog"
    aria-modal="true"
    :aria-label="t('albums.playlists.addMusicDialogLabel')"
  >
    <header>
      <h3>
        {{ t('albums.playlists.addMusicTitle', {
          name: playlists.find(item => item.id === addMusicPlaylistId)?.name ?? ''
        }) }}
      </h3>
      <button
        type="button"
        :aria-label="t('albums.playlists.close')"
        @click="addMusicPlaylistId = null"
      >
        <i class="ti ti-x" aria-hidden="true" />
      </button>
    </header>

    <div class="albums-view__playlist-search">
      <i class="ti ti-search" aria-hidden="true" />

      <input
        v-model="addMusicSearchQuery"
        type="search"
        class="albums-view__playlist-search-input"
        :placeholder="t('albums.playlists.searchPlaceholder')"
        :aria-label="t('albums.playlists.searchMusic')"
      />
    </div>

<p
  v-if="addMusicFeedback"
  class="albums-view__playlists-feedback"
  role="status"
  aria-live="polite"
>
  {{ addMusicFeedback }}
</p>

    <p class="albums-view__playlist-search-hint">
      {{ t('albums.playlists.searchHint') }}
    </p>

    <p v-if="!addMusicSearchQuery.trim()" class="albums-view__playlist-search-placeholder">
  {{ t('albums.playlists.searchEmptyPrompt') }}
</p>

<p v-else-if="addMusicSearchResults.length === 0">
  {{ t('albums.playlists.searchNoResults') }}
</p>

<div v-if="addMusicSearchResults.length > 0" class="albums-view__playlist-search-results">

<div class="albums-view__music-table-header">
  <span>#</span>
  <span>{{ t('albums.playlists.tableTitleCollection') }}</span>
  <span>{{ t('albums.playlists.tableDuration') }}</span>
  <span>{{ t('albums.playlists.tableActions') }}</span>
</div>

  <div
    v-for="hit in addMusicSearchResults"
    :key="hit.musicId"
    class="albums-view__music-row"
  >
    <span class="albums-view__music-number">
      {{ hit.track ?? '•' }}
    </span>

<div class="albums-view__music-info">
  <img
    v-if="getMusicCover(hit.albumNames)"
    :src="getMusicCover(hit.albumNames) ?? undefined"
    :alt="`Capa de ${hit.albumNames}`"
    class="albums-view__music-cover"
    loading="lazy"
  />

  <div class="albums-view__music-details">
    <strong>{{ hit.name }}</strong>
    <small>{{ hit.albumNames }}</small>
  </div>
</div>

    <span class="albums-view__music-duration">
      {{ hit.durationLabel || '—' }}
    </span>

    <div class="albums-view__music-actions">

    <button
  type="button"
  class="albums-view__music-play"
  :aria-label="t('albums.playlists.openWithoutAudio', { name: hit.name })"
  :title="t('albums.playlists.openWithoutAudio', { name: hit.name })"
  @click="playSlides(hit.musicId)"
>
  <i class="ti ti-volume-off" aria-hidden="true" />
</button>

    <button
  v-if="hit.hasInstrumental"
  type="button"
  class="albums-view__music-play albums-view__music-instrumental"
  :aria-label="t('albums.playlists.playInstrumental', { name: hit.name })"
  :title="t('albums.playlists.playInstrumental', { name: hit.name })"
  @click="playInstrumental(hit.musicId)"
>
  <i class="ti ti-piano" aria-hidden="true" />
</button>

  <button
    type="button"
    class="albums-view__music-play"
    :aria-label="t('albums.playlists.playMusic', { name: hit.name })"
    :title="t('albums.playlists.playMusic', { name: hit.name })"
    @click="playSung(hit.musicId)"
  >
    <i class="ti ti-player-play" aria-hidden="true" />
  </button>

<button
  type="button"
  class="albums-view__music-add"
  :disabled="isMusicInOpenPlaylist(hit.musicId)"
 :aria-label="
  isMusicInOpenPlaylist(hit.musicId)
    ? t('albums.playlists.alreadyInPlaylist', { name: hit.name })
    : t('albums.playlists.addMusicButton', { name: hit.name })
"
:title="
  isMusicInOpenPlaylist(hit.musicId)
    ? t('albums.playlists.alreadyAddedTitle')
    : t('albums.playlists.addToPlaylistButton', { name: hit.name })
"
  @click="addMusicToOpenPlaylist(hit)"
>
  <i
    :class="
      isMusicInOpenPlaylist(hit.musicId)
        ? 'ti ti-check'
        : 'ti ti-plus'
    "
    aria-hidden="true"
  />
</button>
</div>
  </div>
</div>
  </div>
</div>

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />

    </Teleport>

        <!-- Seletor de playlist para músicas da busca -->
    <div
      v-if="selectedPlaylistTrack"
      class="albums-view__playlist-picker-overlay"
      @click.self="selectedPlaylistTrack = null"
    >
      <div
        class="albums-view__playlist-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar à playlist"
      >
        <header>
          <h3>Adicionar à playlist</h3>
          <button
            type="button"
            :aria-label="t('albums.playlists.close')"
            @click="selectedPlaylistTrack = null"
          >
            <i class="ti ti-x" aria-hidden="true" />
          </button>
        </header>

        <p>{{ selectedPlaylistTrack.title }}</p>

        <div v-if="playlists.length === 0">
          Você ainda não possui playlists. Crie uma no painel de playlists.
        </div>

        <div v-else>
          <button
            v-for="playlist in playlists"
            :key="playlist.id"
            type="button"
            @click="addSelectedTrackToPlaylist(playlist.id)"
          >
            <i class="ti ti-playlist" aria-hidden="true" />
            {{ playlist.name }}
            ({{ playlist.items.length }})
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">

.albums-view__playlist-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;

  > i {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    color: var(--ds-color-on-surface-variant);
    pointer-events: none;
  }

  .albums-view__playlist-search-input {
    width: 100%;
    padding-left: 42px;
  }
}

.albums-view__playlist-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.40);
  backdrop-filter: blur(6px);
}

.albums-view__playlist-picker.albums-view__playlist-picker--music-search {
width: 100%;
max-width: 990px;
max-height: min(80vh, 720px);
padding: 1.25rem;
border: 1px solid var(--ds-color-outline-strong);
border-radius: var(--ds-radius-xl);
background: rgba(30, 30, 30, 0.65);
backdrop-filter: blur(18px);
-webkit-backdrop-filter: blur(18px);
backdrop-filter: blur(18px);
-webkit-backdrop-filter: blur(18px);
color: var(--ds-color-on-surface);
box-shadow: var(--ds-shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.35));



  .albums-view__playlist-search-input {
  width: 100%;
  min-height: 44px;
  padding: 0.9rem 1.25rem 0.9rem 46px;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md);
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface);
  font: inherit;
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &::placeholder {
    color: var(--ds-color-on-surface-variant);
    opacity: 0.8;
  }

  &:focus {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 2px color-mix(
      in srgb,
      var(--ds-color-primary) 20%,
      transparent
    );
  }
}

  @media (max-width: 640px) {
    max-height: 90vh;
    padding: 1rem;
    border-radius: 12px;
  }
}

.albums-view__playlist-picker {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 1.5rem;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.15));
  border-radius: 18px;
  background: var(--surface-primary, #1e293b);
  color: var(--text-primary, #fff);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;

    h3 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
    }

    button {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
  }

  p {
    margin-bottom: 1rem;
    opacity: 0.75;
  }

  > div > button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
}
.albums-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-sizing: border-box;
  height: calc(
    (100 * var(--ui-vh)) - var(--app-titlebar-height, 0px) - var(--ds-header-height, 5.5rem) -
      var(--ds-dock-height)
  );
  max-height: calc(
    (100 * var(--ui-vh)) - var(--app-titlebar-height, 0px) - var(--ds-header-height, 5.5rem) -
      var(--ds-dock-height)
  );
  padding: 0.75rem var(--ds-spacing-page, 2rem) 1rem;
  overflow: hidden;
  container-type: inline-size;
  container-name: albums-view;
}

.albums-view__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.albums-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.albums-view__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem 0 0.75rem 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  flex-shrink: 0;

  .ti {
    font-size: 1.4rem;
  }
}

.albums-view__headings {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}

.albums-view__title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.15;
}

.albums-view__subtitle {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ds-color-primary);
}

.albums-view__header-actions {
  display: flex;
  flex-shrink: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  max-width: 100%;
}

.albums-view__search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: 14rem;
  max-width: 100%;
  min-width: 0;
  flex-shrink: 1;
  box-sizing: border-box;
  padding: 0.55rem 0.9rem;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 82%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  color: var(--ds-color-on-surface-variant);

  .ti-search {
    flex-shrink: 0;
    color: var(--ds-color-primary);
    font-size: 1.15rem;
  }

  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-size: 0.9rem;
  }
}

.albums-view__search-clear {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  }
}

.albums-view__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-right: 0.25rem;
}

.albums-view__category-header {
  margin-bottom: 1rem;
}

.albums-view__category-title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--ds-color-on-surface);
}

.albums-view__category-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.85;
}

.albums-view__hymnal-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;

  @media (min-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.albums-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 1rem;
  padding: 1rem;
}

.albums-view__results-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.albums-view__results-head {
  flex-shrink: 0;
  padding: 0.9rem 1rem 0.55rem;
  border-bottom: 1px solid var(--ds-color-outline);
}

.albums-view__results-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ds-color-on-surface);
}

.albums-view__results-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.albums-view__state,
.albums-view__alert {
  flex: 1;
  min-height: 0;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 72%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  padding: 1.5rem;
  color: var(--ds-color-on-surface-variant);
}

.albums-view__state--inset {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
}

.albums-view__alert {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  button {
    border: 1px solid var(--ds-color-outline-strong);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    cursor: pointer;
  }
}

@media (max-width: 1280px) {
  .albums-view {
    gap: 0.85rem;
    padding: 0.5rem 1rem 0.65rem;
  }

  .albums-view__header {
    gap: 0.75rem;
  }

  .albums-view__brand {
    gap: 0.65rem;
  }

  .albums-view__icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .albums-view__title {
    font-size: 1.15rem;
  }

  .albums-view__subtitle {
    font-size: 0.85rem;
  }

  .albums-view__body {
    gap: 1.15rem;
  }

  .albums-view__category-header {
    margin-bottom: 0.65rem;
  }

  .albums-view__category-title {
    font-size: 1.05rem;
  }

  .albums-view__hymnal-grid {
    gap: 0.85rem;
  }

  .albums-view__grid {
    gap: 0.75rem;
    padding: 0.75rem;
  }
}

.albums-view__playlists {
  flex-shrink: 0;
  overflow: hidden;
}

/* Minhas Coletâneas (custom) */
.albums-view__custom {
  flex-shrink: 0;
  overflow: hidden;
}

/* --- Toolbar compacta (substitui os cards grandes de Playlists/Coletâneas) --- */
.albums-view__toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;

  .ti {
    color: var(--ds-color-primary);
    font-size: 1.05rem;
  }

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}

.albums-view__toolbar-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.72rem;
  font-weight: 700;
}

/* --- Modais (Teleport > body) --- */
.albums-view__modal {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.albums-view__modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
}

.albums-view__modal-panel {
  position: relative;
  width: min(40rem, 100%);
  max-height: min(75vh, 42rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem !important;
}

.albums-view__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.albums-view__modal-form {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;

  input {
    flex: 1 1 10rem;
    min-width: 10rem;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--ds-color-outline-strong);
    border-radius: var(--ds-radius-sm, 8px 0 8px 0);
    background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 80%, transparent);
    color: var(--ds-color-on-surface);
    font: inherit;
    font-size: 0.88rem;
    transition: border-color 0.2s ease;

    &:focus {
      outline: none;
      border-color: var(--ds-color-primary);
    }
  }

  button[type='submit'] {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0.9rem;
    border: 0;
    border-radius: var(--ds-radius-sm, 8px 0 8px 0);
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #fff);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.2s ease;

    &:hover {
      filter: brightness(1.1);
    }
  }
}

.albums-view__modal-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.06));
}

.albums-view__custom-editor-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 120ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  }
}

.albums-view__custom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.6rem;
}

.albums-view__custom-card {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.06));
  border-radius: var(--ds-radius-md, 0.8rem);
  padding: 0.65rem 0.8rem;
  background: color-mix(in srgb, var(--ds-color-surface-card) 60%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  .ti-chevron-right {
    margin-left: auto;
    opacity: 0.6;
  }
}

.albums-view__custom-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm, 0.6rem);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  font-size: 1.1rem;
}

.albums-view__custom-info {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    color: var(--ds-color-on-surface-variant);
    font-size: 0.75rem;
  }
}

.albums-view__playlists-inner {
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.albums-view__playlists-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.albums-view__playlists-heading {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;

  .ti {
    color: var(--ds-color-primary);
    font-size: 1.15rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }
}

.albums-view__playlists-header form {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}

.albums-view__playlists-header input {
  min-width: 16rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 80%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: var(--ds-color-primary);
  }
}

.albums-view__playlists-header form button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.9rem;
  border: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #fff);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.2s ease;

  &:hover {
    filter: brightness(1.1);
  }
}

.albums-view__playlists-io {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--ds-color-primary);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.albums-view__playlists-feedback {
  margin: 12px 0 0;
  padding: 0.55rem 0.8rem;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.85rem;
}

.albums-view__playlists-empty {
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.9rem;
  border: 1px dashed var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);

  .ti {
    font-size: 1.1rem;
  }
}

.albums-view__playlists-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.albums-view__playlist {
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
  transition: border-color 0.2s ease, background 0.2s ease;
  overflow: hidden;

  &--open {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--ds-color-surface-card, #2a2a2a) 75%, transparent);

    .albums-view__playlist-chevron {
      color: var(--ds-color-primary);
    }
  }
}

.albums-view__playlist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
}

.albums-view__playlist-toggle {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
  min-width: 0;
  border-radius: 12px 0 12px 0;
}

.albums-view__playlist-toggle:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: 2px;
  border-radius: 12px 0 12px 0;
}

.albums-view__playlist-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  font-size: 1rem;
}

.albums-view__playlist-name {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    font-size: 0.92rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    color: var(--ds-color-on-surface-variant);
    font-size: 0.76rem;
  }
}

.albums-view__playlist-chevron {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.9rem;
  transition: transform 0.2s ease;
}

.albums-view__playlist-actions {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  flex-shrink: 0;
}

.albums-view__playlist-rename,
.albums-view__playlist-play,
.albums-view__playlist-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.albums-view__playlist-play {
  color: var(--ds-color-primary);
  border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);

  &:hover:not(:disabled) {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #fff);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.albums-view__playlist-remove {
  color: var(--ds-color-on-surface-variant);

  &:hover {
    color: #ff6b6b;
    border-color: rgba(255, 107, 107, 0.45);
  }
}

.albums-view__playlist-tracks {
  margin: 0 0.75rem 0.7rem 3.65rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;

  li {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.45rem 0.1rem;
    font-size: 0.85rem;
    border-top: 1px solid var(--ds-color-outline);

    &:first-child {
      border-top: 0;
    }
  }
}

.albums-view__playlist-track-index {
  width: 1.4rem;
  text-align: right;
  color: var(--ds-color-primary);
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.albums-view__playlist-track-title {
  flex: 1;
  color: var(--ds-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.albums-view__playlist-track-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 0.4rem;
  opacity: 0.55;
  transition: all 0.2s ease;

  &:hover {
    color: #ff6b6b;
    opacity: 1;
  }
}

.playlist-card-enter-active,
.playlist-card-leave-active {
  transition: all 0.25s ease;
}

.playlist-card-enter-from,
.playlist-card-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}

.playlist-tracks-enter-active,
.playlist-tracks-leave-active {
  transition: opacity 0.2s ease;
}

.playlist-tracks-enter-from,
.playlist-tracks-leave-to {
  opacity: 0;
}
.albums-view__playlist-rename-input {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  box-sizing: border-box;
  padding: 8px 12px;
  color: inherit;
  background: #242424;
  border: 1px solid #555;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  outline: none;
}

.albums-view__playlist-rename-input:focus {
  border-color: #e49a58;
}

.albums-view__playlist-actions
  .albums-view__playlist-rename:has(span) {
  width: auto;
  min-width: 2.1rem;
  padding: 0 0.75rem;
  gap: 0.4rem;
  white-space: nowrap;
  font-size: 0.85rem;
  font-weight: 500;
}

/* Salvar: mesma aparência normal e no hover */
.albums-view__playlist-actions
  [data-testid="playlist-rename-save"],
.albums-view__playlist-actions
  [data-testid="playlist-rename-save"]:hover {
  background: #e9ae45;
  border-color: #e9ae45;
  color: #242424;
}

/* Cancelar: aparência normal */
.albums-view__playlist-actions
  [data-testid="playlist-rename-cancel"] {
  background: transparent;
  border-color: transparent;
  color: var(--ds-color-on-surface);
}

/* Cancelar: amarelo bem transparente no hover */
.albums-view__playlist-actions
  [data-testid="playlist-rename-cancel"]:hover {
  background: rgba(233, 174, 69, 0.1);
  border-color: transparent;
  color: #e9ae45;
}

.albums-view__playlist-search-hint {
  margin: 1rem 0 1rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.8;
}
/* Modal de adicionar músicas */
.albums-view__playlist-picker.albums-view__playlist-picker--music-search {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;

  /* Largura constante */
  width: min(950px, calc(100vw - 32px));
max-width: 950px;

  /* Compacto antes da pesquisa */
  height: auto;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 24px;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
}

/* Expande somente quando existem resultados */
.albums-view__playlist-picker--music-search.albums-view__playlist-picker--expanded {
  height: min(720px, calc(100dvh - 48px));
  overflow: hidden;
}

/* Lista com rolagem independente */
.albums-view__playlist-search-results {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
}

@media (max-width: 640px) {
  .albums-view__playlist-picker.albums-view__playlist-picker--music-search {
    width: calc(100vw - 16px);
    max-width: none;
    max-height: calc(100dvh - 16px);
    padding: 16px;
    border-radius: 12px;
  }

  .albums-view__playlist-picker--music-search.albums-view__playlist-picker--expanded {
    height: calc(100dvh - 16px);
  }
}

.albums-view__music-table-header,
.albums-view__music-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 85px 130px;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.albums-view__music-table-header {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  font-weight: 600;
  border-bottom: 1px solid var(--ds-color-outline-strong);
}

.albums-view__music-row {
  border-bottom: 1px solid var(--ds-color-outline);
  transition: background 150ms ease;

  &:hover {
    background: var(--ds-color-surface-container-high);
  }
}

.albums-view__music-number {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.85rem;
}

.albums-view__music-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong,
  small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  strong {
    color: var(--ds-color-on-surface);
    font-size: 0.9rem;
  }

  small {
    color: var(--ds-color-on-surface-variant);
    font-size: 0.75rem;
  }
}

.albums-view__music-duration {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.85rem;
}

.albums-view__music-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--ds-color-primary);
  border-radius: var(--ds-radius-sm);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  cursor: pointer;

  &:hover {
    filter: brightness(1.12);
  }
}
@media (max-width: 640px) {
  .albums-view__music-table-header,
  .albums-view__music-row {
    grid-template-columns: minmax(0, 1fr) 112px;
    gap: 8px;
    padding: 10px 8px;
  }

  .albums-view__music-table-header > :first-child,
  .albums-view__music-number,
  .albums-view__music-table-header > :nth-child(3),
  .albums-view__music-duration {
    display: none;
  }

  .albums-view__music-info {
    gap: 8px;
    min-width: 0;
  }

  .albums-view__music-cover {
    width: 36px;
    height: 36px;
  }

  .albums-view__music-details {
    min-width: 0;
  }

  .albums-view__music-info strong {
    font-size: 0.85rem;
  }

  .albums-view__music-info small {
    font-size: 0.72rem;
  }

  .albums-view__music-actions {
    gap: 4px;
    justify-content: flex-end;
  }

  .albums-view__music-play,
  .albums-view__music-add,
  .albums-view__music-instrumental {
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    flex-shrink: 0;
  }
}

.albums-view__music-info {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.albums-view__music-cover {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--ds-radius-sm);
}

.albums-view__music-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong,
  small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.albums-view__music-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;

  &:hover {
    background: var(--ds-color-surface-container-high);
    color: var(--ds-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}

.albums-view__music-instrumental {
  border-radius: var(--ds-radius-full);
}

.albums-view__music-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ds-spacing-2);
  flex-shrink: 0;
}

.albums-view__music-actions .albums-view__music-play,
.albums-view__music-actions .albums-view__music-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  min-width: 34px;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm);
  transition:
    background var(--default-transition-duration) ease,
    color var(--default-transition-duration) ease;
}

.albums-view__music-actions .albums-view__music-instrumental {
  border-radius: var(--ds-radius-full);
}

/* Música já adicionada à playlist */
.albums-view__music-add:disabled {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  opacity: 1;
  cursor: default;
}

.albums-view__playlist-track-drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}

.albums-view__playlist-track-drag:active {
  cursor: grabbing;
}

</style>
