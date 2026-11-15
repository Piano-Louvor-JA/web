<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MusicTrackActions from '@shared/components/MusicTrackActions.vue'
import type { AlbumSearchHit } from '../types/albums'

defineProps<{
  hit: AlbumSearchHit
  busy?: boolean
}>()

const emit = defineEmits<{
  sung: []
  instrumental: []
  slides: []
  lyric: []
  playlist: []
}>()

const { t } = useI18n()
const rowHovered = ref(false)
</script>

<template>
  <div
    class="album-search-hit"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
  >
    <span class="album-search-hit__info">
      <span class="album-search-hit__title-row">
        <span
          v-if="hit.isHymnal && hit.track != null"
          class="album-search-hit__number"
        >
          {{ hit.track }}
        </span>
        <span class="album-search-hit__title">
          {{ hit.name }}
        </span>
      </span>
      <span class="album-search-hit__subtitle">
        {{ hit.albumNames }}
      </span>
    </span>

    <span class="album-search-hit__duration">
      {{ hit.durationLabel }}
    </span>

    <div class="album-search-hit__actions">
      <MusicTrackActions
        :show-playlist-action="true"
        @playlist="emit('playlist')"
        :music-id="hit.musicId"
        :track-name="hit.name"
        :has-instrumental="hit.hasInstrumental"
        :busy="busy"
        :row-hovered="rowHovered"
        variant="contained"
        @sung="emit('sung')"
        @instrumental="emit('instrumental')"
        @slides="emit('slides')"
        @lyric="emit('lyric')"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.album-search-hit {
  --album-search-accent: #ff8a3d;

  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4rem auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.95rem;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-outline) 70%, transparent);
  background: transparent;
  color: var(--ds-color-on-surface);
  text-align: left;
  overflow: hidden;
  transition: background-color 140ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  &:last-child {
    border-bottom: none;
  }
}

.album-search-hit__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.album-search-hit__title-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.album-search-hit__number {
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--album-search-accent);
  font-variant-numeric: tabular-nums;
}

.album-search-hit__title {
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-search-hit__subtitle {
  font-size: 0.8rem;
  color: var(--album-search-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-search-hit__duration {
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.album-search-hit__actions {
  position: relative;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-self: end;
}

@media (max-width: 600px) {
  .album-search-hit {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'title'
      'duration'
      'actions';
  }

  .album-search-hit__info {
    grid-area: title;
  }

  .album-search-hit__duration {
    grid-area: duration;
    text-align: left;
  }

  .album-search-hit__actions {
    grid-area: actions;
    justify-self: start;
  }
}
</style>
