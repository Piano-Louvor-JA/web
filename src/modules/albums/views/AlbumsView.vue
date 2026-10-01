<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  removePlaylistItem,
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
const newPlaylistName = ref('')
const expandedPlaylistId = ref<string | null>(null)
const importFeedback = ref('')
let importFeedbackTimer: ReturnType<typeof setTimeout> | null = null

function showImportFeedback(message: string) {
  importFeedback.value = message
  if (importFeedbackTimer) clearTimeout(importFeedbackTimer)
  importFeedbackTimer = setTimeout(() => {
    importFeedback.value = ''
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

function removePlaylist(id: string) {
  deletePlaylist(id)
  playlists.value = listPlaylists()
}

function removePlaylistTrack(id: string, index: number) {
  removePlaylistItem(id, index)
  playlists.value = listPlaylists()
}

function togglePlaylist(id: string) {
  expandedPlaylistId.value = expandedPlaylistId.value === id ? null : id
}

async function playPlaylist(playlist: Playlist) {
  if (playlist.items.length === 0) return
  await mediaStore.playQueue(playlist.items, 0)
  void router.push({ name: 'media' })
}
const router = useRouter()

const {
  categories,
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
  playSung,
  playInstrumental,
  playSlides,
  openLyric,
  closeLyric,
} = useAlbums()

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
                  <span class="albums-view__playlist-name">
                    <strong>{{ playlist.name }}</strong>
                    <small>{{ playlist.items.length }} faixa(s)</small>
                  </span>
                  <i
                    class="ti albums-view__playlist-chevron"
                    :class="expandedPlaylistId === playlist.id ? 'ti-chevron-down' : 'ti-chevron-right'"
                    aria-hidden="true"
                  />
                </button>
                <div class="albums-view__playlist-actions">
                  <button
                    type="button"
                    class="albums-view__playlist-play"
                    :disabled="playlist.items.length === 0"
                    :aria-label="`Tocar ${playlist.name}`"
                    @click="playPlaylist(playlist)"
                  >
                    <i class="ti ti-player-play" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="albums-view__playlist-remove"
                    :aria-label="`Remover playlist ${playlist.name}`"
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
                  >
                    <span class="albums-view__playlist-track-index">{{ index + 1 }}</span>
                    <span class="albums-view__playlist-track-title">{{ item.title }}</span>
                    <button
                      type="button"
                      class="albums-view__playlist-track-remove"
                      :aria-label="`Remover ${item.title} da playlist`"
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

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />
  </section>
</template>

<style scoped lang="scss">
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
  margin: 0;
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
</style>
