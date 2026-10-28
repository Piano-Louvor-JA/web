<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StagePaletteButton from '../../settings/components/StagePaletteButton.vue'
import BibleNavPanel from '../components/BibleNavPanel.vue'
import BibleProjectFab from '../components/BibleProjectFab.vue'
import BibleToolbar from '../components/BibleToolbar.vue'
import BibleVerseList from '../components/BibleVerseList.vue'
import { useBibleReader } from '../composables/useBibleReader'
import { useBibleNavCollapse } from '../composables/useBibleNavCollapse'

const { t } = useI18n()

const {
  versions,
  selectedVersionId,
  selectedBookId,
  selectedChapter,
  selectedVerses,
  testamentFilter,
  showNavPanel,
  bookSearchQuery,
  chapterSearchQuery,
  verseSearchQuery,
  globalSearchQuery,
  isLoadingMeta,
  isLoadingVerses,
  lastErrorKey,
  isProjecting,
  projection,
  filteredBooks,
  chapterNumbers,
  locationLabel,
  chapterTitle,
  verseEntries,
  visibleVerseEntries,
  hasProjection,
  previewSnippet,
  clearError,
  applyVerseSearch,
  selectVersion,
  selectBook,
  selectChapter,
  selectVerse,
  clearSelection,
  goToAdjacentVerse,
  setTestamentFilter,
  toggleNavPanel,
  toggleProjection,
  clearProjectionWindow,
  refresh,
} = useBibleReader()

function onProject() {
  void toggleProjection()
}

function onClearProjection() {
  void clearProjectionWindow()
}

function onPreviousVerse() {
  void goToAdjacentVerse(-1)
}

function onNextVerse() {
  void goToAdjacentVerse(1)
}

// ═══ SCROLL CONTROL: mobile ═══
const { isMobile, booksCollapsed, chaptersCollapsed } = useBibleNavCollapse()
const navAllCollapsed = computed(() => isMobile.value && booksCollapsed.value && chaptersCollapsed.value)
</script>

<template>
  <section
    class="bible-view"
    :class="{ 'bible-view--has-selection': selectedBookId !== null && selectedChapter !== null }"
  >
    <BibleToolbar
      :versions="versions"
      :selected-version-id="selectedVersionId"
      :location-label="locationLabel"
      :show-nav-panel="showNavPanel"
      :bible-search-query="globalSearchQuery"
      :versions-disabled="isLoadingMeta"
      @select-version="selectVersion"
      @toggle-nav="toggleNavPanel"
      @update:bible-search-query="globalSearchQuery = $event"
    />

    <div
      v-if="lastErrorKey"
      class="bible-view__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <div class="bible-view__alert-actions">
        <button
          type="button"
          class="bible-view__alert-btn"
          @click="refresh"
        >
          {{ t('bible.retry') }}
        </button>
        <button
          type="button"
          class="bible-view__alert-btn bible-view__alert-btn--ghost"
          @click="clearError"
        >
          {{ t('bible.dismiss') }}
        </button>
      </div>
    </div>

    <div
      v-else-if="isLoadingMeta"
      class="bible-view__state"
    >
      {{ t('bible.loading') }}
    </div>

    <div
      v-else-if="filteredBooks.length === 0 && versions.length === 0"
      class="bible-view__state"
    >
      {{ t('bible.emptyCatalog') }}
    </div>

    <div
      v-else
      class="bible-view__body"
      :class="{
        'bible-view__body--reader-only': !showNavPanel,
        'bible-view__body--nav-collapsed': navAllCollapsed,
      }"
    >
      <BibleNavPanel
        v-if="showNavPanel"
        class="bible-view__nav"
        :books="filteredBooks"
        :selected-book-id="selectedBookId"
        :testament="testamentFilter"
        :book-search-query="bookSearchQuery"
        :chapters="chapterNumbers"
        :selected-chapter="selectedChapter"
        :chapter-search-query="chapterSearchQuery"
        @update:book-search-query="bookSearchQuery = $event"
        @update:chapter-search-query="chapterSearchQuery = $event"
        @update:testament="setTestamentFilter"
        @select-book="selectBook"
        @select-chapter="selectChapter"
      />

      <BibleVerseList
        v-if="selectedBookId !== null && selectedChapter !== null"
        class="bible-view__reader"
        :chapter-title="chapterTitle"
        :verses="visibleVerseEntries"
        :selected-verses="selectedVerses"
        :verse-search-query="verseSearchQuery"
        :is-loading="isLoadingVerses"
        :projection="projection"
        :preview-snippet="previewSnippet"
        :has-projection="hasProjection"
        @update:verse-search-query="verseSearchQuery = $event"
        @verse-search-submit="applyVerseSearch"
        @select-verse="selectVerse"
        @previous-verse="onPreviousVerse"
        @next-verse="onNextVerse"
        @clear-projection="clearSelection"
      />
      <div
        v-else-if="selectedBookId !== null"
        class="bible-view__reader bible-view__placeholder"
      >
        {{ t('bible.selectChapterPrompt') }}
      </div>
      <div
        v-else
        class="bible-view__reader bible-view__placeholder"
      >
        {{ t('bible.selectBookAndChapter') }}
      </div>
    </div>

    <BibleProjectFab
      :disabled="!hasProjection"
      :projecting="isProjecting"
      @project="onProject"
      @clear="onClearProjection"
    />
  </section>
</template>

<style scoped lang="scss">
.bible-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0.75rem var(--ds-spacing-page, 2rem) 0;
  overflow-x: clip;
  max-width: 100%;

  // Desktop médio / projetor 1024×768: menos gap e padding vertical.
  @media (max-width: 1280px) {
    gap: 0.65rem;
    padding-top: 0.5rem;
  }

  @media (max-width: 600px) {
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 0;
  }
}

.bible-view__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem;
  flex: 1 1 auto;
  min-height: 0;

  &--reader-only {
    grid-template-columns: minmax(0, 1fr);
  }

  // Desktop médio (ex.: 1024×768): mantém nav | reader lado a lado, com gap menor.
  @media (max-width: 1280px) {
    gap: 0.75rem;
  }

  // Tablet/mobile (≤960px = md): layout em coluna.
  // Quando nav-panel aberto: tudo flui naturalmente (auto auto), barra do browser rola.
  // Quando nav colapsado: reader ocupa resto da tela com scroll proprio.
  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;

    // Nav colapsado: header compacto + reader com altura fixa e scroll interno.
    // Altura = viewport - header app - toolbar bible - paddings - dock.
    &--nav-collapsed {
      grid-template-rows: auto minmax(0, 1fr);
      height: calc((100 * var(--ui-vh)) - 3.5rem - 5rem - var(--ds-dock-height, 4.5rem));
      overflow: hidden;

      @media (max-width: 768px) {
        height: auto !important;
        overflow: visible !important;
      }
    }
  }

  @media (max-width: 600px) {
    gap: 0.5rem;
  }
}

.bible-view__nav {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 960px) {
    flex-shrink: 0;
  }

  // Mobile: o nav-panel colapsavel precisa se expandir sem ser cortado
  @media (max-width: 768px) {
    overflow: visible;
  }
}

.bible-view__reader {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    overflow: visible !important;
    height: auto !important;
    min-height: 0 !important;
  }
}

.bible-view :deep(.bible-toolbar) {
  flex-shrink: 0;
  position: sticky;
  // top deve coincidir exatamente com a altura do header global
  // para que o conteudo do nav-panel seja clipado ao passar por baixo
  top: var(--ds-header-height, 5.5rem);
  z-index: 50;
  box-shadow: var(--ds-shadow-md);
  // isopárpá stacking context: o backdrop-filter do próprio GlassCard cria um
  // novo contexto. Precisamos do `isolation: isolate` para garantir que a toolbar
  // se sobreponha aos irmãos (nav-panel, reader) que também têm backdrop-filter.
  isolation: isolate;

  @media (max-width: 600px) {
    top: 4.5rem;
  }

  @media (max-width: 430px) {
    top: 4rem;
  }
}

// ═══ ≤430px: scroll isolado no reader, nav-panel fixo abaixo da toolbar ═══
// O body não rola externamente; apenas .bible-reader__scroll tem overflow-y: auto.
@media (max-width: 430px) {
  .bible-view__body {
    // viewport - header app (4rem) - toolbar bible - paddings - dock
    height: calc((100 * var(--ui-vh)) - 4rem - 5rem - var(--ds-dock-height, 4.5rem)) !important;
    overflow-y: hidden !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
  }

  .bible-view__nav {
    margin-top: 0.5rem;
    flex-shrink: 0;
    // Altura maxima para o nav-panel: metade da altura disponivel.
    // Garante scroll interno sem empurrar o reader para fora da viewport.
    max-height: 45vh;
    overflow: hidden;
    min-height: 0;
  }

  .bible-view__reader {
    overflow: hidden !important;
    min-height: 0 !important;
    flex: 1 1 auto;
  }
}

// Fundo mais opaco na toolbar para garantir clipping visual do nav-panel
.bible-view :deep(.bible-toolbar) {
  background: color-mix(in srgb, var(--ds-color-surface-elevated) 96%, transparent) !important;
}

.bible-view__state,
.bible-view__alert {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 72%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  padding: 1.5rem;
  color: var(--ds-color-on-surface-variant);
}

.bible-view__alert {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  p {
    margin: 0;
    color: var(--ds-color-on-surface);
  }
}

.bible-view__alert-actions {
  display: flex;
  gap: 0.5rem;
}

.bible-view__alert-btn {
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary-soft);
  padding: 0.4rem 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &--ghost {
    background: transparent;
    border: 1px solid var(--ds-color-outline);
  }
}

.bible-view__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--ds-color-on-surface-variant, rgba(255, 255, 255, 0.6));
  font-size: 0.95rem;
  padding: 2rem;
}
</style>

<style lang="scss">
// Telas ≤430px: travar o body/viewport para que apenas o scroll interno do reader funcione.
@media (max-width: 430px) {
  body:has(.bible-view) {
    overflow-y: hidden !important;
    overscroll-behavior: none;
  }
}

[data-mode='light'] .bible-view .ds-glass-card {
  background: color-mix(in srgb, #ffffff 82%, transparent);
  border-color: #e8ecf3;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.03);
}

[data-mode='light'] .bible-view .ds-glass-card:hover {
  background: color-mix(in srgb, #ffffff 90%, transparent);
}

[data-mode='light'] .bible-view__state,
[data-mode='light'] .bible-view__alert {
  background: color-mix(in srgb, #ffffff 82%, transparent);
  border-color: #e8ecf3;
}
</style>
