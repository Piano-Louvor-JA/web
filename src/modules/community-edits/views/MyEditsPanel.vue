<script setup lang="ts">
/**
 * MyEditsPanel — Minhas Edições (portação web 1:1 do desktop app#575).
 * Lista os edits locais do autor com status; publicar chama publishEdit.
 * Paridade comportamental com o MyEditsPanel.vue do desktop.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  listLocalEdits,
  deleteLocalEdit,
  type LocalEdit,
} from '../services/local-edit-store';
import { publishEdit } from '../services/publish-edit';

const { t } = useI18n();

const edits = ref<LocalEdit[]>(listLocalEdits());
const publishing = ref<number | null>(null);
const feedback = ref<string | null>(null);

const hasEdits = computed(() => edits.value.length > 0);

function refresh(): void {
  edits.value = listLocalEdits();
}

async function onPublish(musicId: number): Promise<void> {
  publishing.value = musicId;
  feedback.value = null;
  const result = await publishEdit(musicId);
  publishing.value = null;
  feedback.value = result.published
    ? t('community.edits.published')
    : t('community.edits.publishFailed', { error: result.error });
  refresh();
}

function onDelete(musicId: number): void {
  deleteLocalEdit(musicId);
  refresh();
}

const statusColor = (status: LocalEdit['status']) =>
  status === 'published' ? 'success' : 'grey';
</script>

<template>
  <section class="my-edits-panel" data-testid="my-edits-panel">
    <h3 class="text-subtitle-1">{{ t('community.edits.title') }}</h3>

    <div
      v-if="feedback"
      class="my-edits-panel__feedback"
      data-testid="edits-feedback"
    >
      {{ feedback }}
    </div>

    <p v-if="!hasEdits" class="text-body-2 text-medium-emphasis">
      {{ t('community.edits.empty') }}
    </p>

    <ul v-else class="my-edits-panel__list" data-testid="edits-list">
      <li v-for="edit in edits" :key="edit.musicId" class="my-edits-panel__item">
        <span
          class="my-edits-panel__status"
          :class="`my-edits-panel__status--${edit.status}`"
          data-testid="edit-status"
        >
          {{
            edit.status === 'published'
              ? t('community.edits.statusPublished')
              : t('community.edits.statusDraft')
          }}
        </span>
        <span class="my-edits-panel__music">
          {{ t('community.edits.musicLabel', { id: edit.musicId }) }}
        </span>
        <span class="my-edits-panel__actions">
          <button
            v-if="edit.status === 'draft'"
            type="button"
            class="my-edits-panel__btn my-edits-panel__btn--primary"
            data-testid="publish-edit-btn"
            @click="onPublish(edit.musicId)"
          >
            {{ t('community.edits.publish') }}
          </button>
          <button
            type="button"
            class="my-edits-panel__btn my-edits-panel__btn--danger"
            data-testid="delete-edit-btn"
            @click="onDelete(edit.musicId)"
          >
            {{ t('community.edits.delete') }}
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.my-edits-panel__list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.my-edits-panel__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
}
.my-edits-panel__status {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
}
.my-edits-panel__status--published {
  background: rgba(76, 175, 80, 0.16);
  color: #2e7d32;
}
.my-edits-panel__status--draft {
  background: rgba(158, 158, 158, 0.2);
}
.my-edits-panel__actions {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}
.my-edits-panel__btn {
  cursor: pointer;
  font-size: 0.8125rem;
  padding: 0.25rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border, currentColor);
  background: transparent;
}
.my-edits-panel__btn--primary {
  background: var(--accent, #1976d2);
  color: #fff;
  border-color: transparent;
}
.my-edits-panel__btn--danger {
  color: #c62828;
}
</style>
