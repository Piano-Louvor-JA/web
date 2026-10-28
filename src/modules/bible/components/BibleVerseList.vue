<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import type { BibleSelection } from '../types/bible'

const props = defineProps<{
  chapterTitle: string
  verses: Array<{ number: number; text: string }>
  selectedVerses: number[]
  verseSearchQuery: string
  isLoading: boolean
  projection: BibleSelection
  previewSnippet: string
  hasProjection: boolean
}>()

const emit = defineEmits<{
  'update:verseSearchQuery': [value: string]
  verseSearchSubmit: []
  selectVerse: [verseNumber: number, event: MouseEvent]
  previousVerse: []
  nextVerse: []
  clearProjection: []
  copy: []
}>()

const { t } = useI18n()
const copyFeedbackKey = ref<string | null>(null)

const canNavigate = computed(() => props.selectedVerses.length > 0)

async function handleCopy() {
  const text = props.hasProjection
    ? `${props.projection.text}\n${props.projection.scripturalReference}`
    : props.verses.map((verse) => `${verse.number}. ${verse.text}`).join('\n')

  try {
    await navigator.clipboard.writeText(text)
    copyFeedbackKey.value = 'bible.copied'
  } catch {
    copyFeedbackKey.value = 'bible.copyFailed'
  }

  window.setTimeout(() => {
    copyFeedbackKey.value = null
  }, 1800)

  emit('copy')
}

function isSelected(verseNumber: number): boolean {
  return props.selectedVerses.includes(verseNumber)
}
</script>

<template>
  <GlassCard
    class="bible-reader"
    :padding="false"
    elevated
  >
    <header class="bible-reader__header">
      <h2 class="bible-reader__title">
        {{ chapterTitle || t('bible.title') }}
      </h2>

      <div class="bible-reader__nav">
        <div class="bible-reader__nav-group">
          <button
            type="button"
            class="bible-reader__circle-btn"
            :disabled="!canNavigate"
            :aria-label="t('bible.previousChapter')"
            :title="t('bible.previousChapter')"
            @click="emit('previousVerse')"
          >
            <i
              class="ti ti-chevron-left"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="bible-reader__circle-btn"
            :disabled="!canNavigate"
            :aria-label="t('bible.nextChapter')"
            :title="t('bible.nextChapter')"
            @click="emit('nextVerse')"
          >
            <i
              class="ti ti-chevron-right"
              aria-hidden="true"
            />
          </button>
        </div>

        <div class="bible-reader__nav-group">
          <button
            type="button"
            class="bible-reader__circle-btn bible-reader__circle-btn--clear bible-reader__circle-btn--projection"
            :disabled="!hasProjection"
            :aria-label="t('bible.clearProjection')"
            :title="t('bible.clearProjection')"
            @click="emit('clearProjection')"
          >
            <i
              class="ti ti-eraser"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="bible-reader__circle-btn"
            :aria-label="t('bible.copy')"
            :title="t('bible.copy')"
            @click="handleCopy"
          >
            <i
              class="ti ti-copy"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div class="bible-reader__search">
        <i
          class="ti ti-search bible-reader__search-icon"
          aria-hidden="true"
        />
        <input
          class="bible-reader__search-input"
          type="search"
          :value="verseSearchQuery"
          :placeholder="t('bible.searchVerse')"
          :aria-label="t('bible.searchVerse')"
          @input="emit('update:verseSearchQuery', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="emit('verseSearchSubmit')"
        >
      </div>
    </header>

    <p
      v-if="copyFeedbackKey"
      class="bible-reader__feedback"
      role="status"
    >
      {{ t(copyFeedbackKey) }}
    </p>

    <div class="bible-reader__scroll">
      <div
        v-if="isLoading"
        class="bible-reader__state"
      >
        {{ t('bible.loading') }}
      </div>

      <div
        v-else-if="verses.length === 0"
        class="bible-reader__state"
      >
        {{ t('bible.emptyChapter') }}
      </div>

      <div
        v-else
        class="bible-reader__verses"
      >
        <button
          v-for="verse in verses"
          :id="`bible-verse-${verse.number}`"
          :key="verse.number"
          type="button"
          class="bible-reader__verse"
          :class="{ 'bible-reader__verse--active': isSelected(verse.number) }"
          @click="emit('selectVerse', verse.number, $event)"
        >
          <span class="bible-reader__verse-num">{{ verse.number }}</span>
          <span class="bible-reader__verse-text">{{ verse.text }}</span>
        </button>
      </div>
    </div>

  </GlassCard>
</template>

<style scoped lang="scss">
.bible-reader {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.bible-reader__header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  flex-shrink: 0;
  padding: 1.25rem 1.75rem 0.75rem;
  background: var(--ds-color-surface-container);
  border-bottom: 1px solid var(--ds-color-outline-variant);

  @media (max-width: 1280px) {
    padding: 0.75rem 1rem 0.5rem;
    gap: 0.4rem 0.5rem;
  }

  @media (max-width: 600px) {
    padding: 0.75rem 1rem 0.5rem;
    gap: 0.5rem;
  }
}

.bible-reader__title {
  margin: 0;
  flex-shrink: 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ds-color-primary-soft);

  @media (max-width: 1280px) {
    font-size: 1.1rem;
  }

  @media (max-width: 600px) {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 1.15rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.bible-reader__nav {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  flex-shrink: 0;

  @media (max-width: 600px) {
    margin-left: auto;
    gap: 0.5rem;
  }
}

.bible-reader__nav-group {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;

  @media (max-width: 600px) {
    gap: 0.25rem;
  }
}

.bible-reader__circle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;

  @media (max-width: 600px) {
    width: 1.75rem;
    height: 1.75rem;
  }
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-container-high) 90%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 140ms ease;

  .ti {
    font-size: 1.15rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, var(--ds-color-surface-container-high));
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &--clear {
    background: color-mix(in srgb, #93000a 45%, var(--ds-color-surface-container-high));
    color: #ffb4ab;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, #93000a 62%, var(--ds-color-surface-container-high));
      color: #ffdad6;
    }
  }

  &--projection {
    @media (max-width: 768px) {
      display: none;
    }
  }
}


.bible-reader__search {
  position: relative;
  flex: 0 1 auto;
  min-width: 8rem;
  width: calc((100% - 1.25rem) / 2);
  max-width: calc((100% - 1.25rem) / 2);
  margin-left: auto;

  @media (max-width: 600px) {
    flex: 1 1 100%;
    width: 100%;
    max-width: 100%;
    margin-left: 0;
  }
}

.bible-reader__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ds-color-on-surface-variant);
  font-size: 1rem;
  pointer-events: none;
}

.bible-reader__search-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ds-color-outline-strong) 80%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface);
  padding: 0.5rem 0.75rem 0.5rem 2.25rem;
  font-size: 0.875rem;
  outline: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:focus {
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  }
}


.bible-reader__feedback {
  flex-shrink: 0;
  margin: 0;
  padding: 0 1.75rem 0.5rem;
  font-size: 0.8rem;
  color: var(--ds-color-secondary, #78d6d2);
}

.bible-reader__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 1.75rem 7rem;
  font-size: 1.05rem;
  line-height: 1.7;

  @media (max-width: 768px) {
    padding: 0.25rem 0 7rem;
    overflow-y: visible !important;
    height: auto !important;
  }

  // ≤430px: scroll interno independente — restaura o overflow-y: auto
  // que o breakpoint 768px acima removeu com !important.
  @media (max-width: 430px) {
    overflow-y: auto !important;
    height: auto;
    flex: 1 1 auto;
    min-height: 0;
  }
}

.bible-reader__state {
  color: var(--ds-color-on-surface-variant);
  opacity: 0.8;
}

.bible-reader__verses {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.bible-reader__verse {
  display: flex;
  gap: 1.25rem;
  width: 100%;
  text-align: left;
  border: 0;
  border-left: 4px solid transparent;
  background: transparent;
  color: inherit;
  padding: 0.65rem 0.5rem;
  border-radius: 0.35rem 0 0.35rem 0;
  cursor: pointer;
  opacity: 0.65;
  transition:
    opacity 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease;

  @media (max-width: 1280px) {
    gap: 0.75rem;
    padding: 0.4rem 0.35rem;
    font-size: 0.92rem;
  }

  @media (max-width: 600px) {
    padding-inline: 1rem;
  }

  &:hover {
    opacity: 0.9;
    background: color-mix(in srgb, var(--ds-color-primary) 6%, transparent);
  }

  &--active {
    opacity: 1;
    margin-inline: -1.75rem;
    padding-inline: 1.75rem;
    padding-block: 1rem;
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    border-left-color: var(--ds-color-primary);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-color-primary) 20%, transparent);

    @media (max-width: 600px) {
      margin-inline: 0;
      padding-inline: 1rem;
      width: 100%;
      max-width: 100%;
      border-radius: 0;
    }

    .bible-reader__verse-text {
      font-weight: 500;
      font-size: 1.15rem;
      color: var(--ds-color-on-surface);
    }
  }
}

.bible-reader__verse-num {
  flex-shrink: 0;
  width: 1.5rem;
  font-weight: 700;
  color: var(--ds-color-primary-soft);
}

.bible-reader__verse-text {
  flex: 1;
  line-height: 1.65;
}


</style>

<style lang="scss">
[data-mode='light'] .bible-reader__circle-btn {
  background: #f5f6fa;
}

[data-mode='light'] .bible-reader__circle-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ds-color-primary) 10%, #f7f8fc);
}

[data-mode='light'] .bible-reader__circle-btn--clear {
  background: #fce8e6;
  color: #ba1a1a;

  &:hover:not(:disabled) {
    background: #f9dedc;
    color: #93000a;
  }
}

[data-mode='light'] .bible-reader__search-input {
  background: #f7f8fc;
  border-color: #e8ecf3;
}

[data-mode='light'] .bible-reader__search-input:focus {
  background: #fff;
}
</style>
