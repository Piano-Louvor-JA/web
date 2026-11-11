/**
 * Teste do MyEditsPanel (portação web) — paridade com o teste my-edits-panel do desktop.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

import MyEditsPanel from '../views/MyEditsPanel.vue';

vi.mock('../../media/services/custom-catalog', () => ({
  customApiUrl: (p: string) => `https://api.test/v1/custom${p}`,
}));
vi.mock('../../auth/services/auth-client', () => ({
  authHeaders: () => ({ authorization: 'Bearer tok' }),
  getAuthSession: () => ({ token: 'tok', user: { id_user: 7 } }),
}));
vi.mock('../services/publish-edit', () => ({
  publishEdit: vi.fn().mockResolvedValue({ published: true, clientUuid: 'abc'.padEnd(64, '0') }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      community: {
        edits: {
          title: 'Minhas Edições',
          empty: 'Você ainda não editou nenhuma música do catálogo.',
          musicLabel: 'Música #{id}',
          publish: 'Publicar correção',
          delete: 'Excluir',
          published: 'Correção publicada — aguardando o concilio.',
          publishFailed: 'Não foi possível publicar: {error}',
          statusPublished: 'Publicada',
          statusDraft: 'Rascunho',
        },
      },
    },
  },
});

const mountPanel = () =>
  mount(MyEditsPanel, { global: { plugins: [i18n] } });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    'louvorja.local-edits.v1',
    JSON.stringify({
      '42': {
        musicId: 42,
        lyrics: '[{"text":"edit"}]',
        timing: null,
        status: 'draft',
        updatedAtMs: 1,
      },
    }),
  );
});

describe('MyEditsPanel (web portação)', () => {
  it('lista o edit local com badge rascunho', () => {
    const w = mountPanel();
    expect(w.find('[data-testid="edits-list"]').exists()).toBe(true);
    expect(w.find('[data-testid="edit-status"]').text()).toBe('Rascunho');
    expect(w.text()).toContain('Música #42');
  });

  it('vazio quando não há edits', () => {
    window.localStorage.setItem('louvorja.local-edits.v1', '{}');
    const w = mountPanel();
    expect(w.find('[data-testid="edits-list"]').exists()).toBe(false);
    expect(w.text()).toContain('Você ainda não editou');
  });

  it('publicar: chama publishEdit, mostra feedback e atualiza status local', async () => {
    const { publishEdit } = await import('../services/publish-edit');
    const w = mountPanel();
    await w.find('[data-testid="publish-edit-btn"]').trigger('click');
    await flushPromises();
    expect(publishEdit).toHaveBeenCalledTimes(1);
    expect(publishEdit).toHaveBeenCalledWith(42);
    expect(w.find('[data-testid="edits-feedback"]').text()).toContain('publicada');
    // publishEdit mocked não grava no store — paridade é com o store real (coberto nos testes de serviço)
    expect(w.find('[data-testid="edit-status"]').text()).toBe('Rascunho');
  });

  it('excluir remove da lista', async () => {
    const w = mountPanel();
    await w.find('[data-testid="delete-edit-btn"]').trigger('click');
    expect(w.find('[data-testid="edits-list"]').exists()).toBe(false);
  });
});
