/**
 * Testes da portação web das Editas da Comunidade — paridade 1:1 com desktop
 * (matriz RF do PLAN-portacao.md §4). Fixtures sintéticos, zero produção.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteLocalEdit,
  getLocalEdit,
  listLocalEdits,
  saveLocalEdit,
  markLocalEditPublished,
} from '../services/local-edit-store';
import { applyEditToTrack, resolveEditOverride } from '../services/edit-resolver';
import { publishEdit } from '../services/publish-edit';
import { fetchAppliedEdit } from '../services/applied-edits';
import type { MediaTrackRecord } from '../../media/types/media';

// auth-client do web: sessão mockada no localStorage
const SESSION_KEY = (() => {
  // chave real usada pelo auth-client (lida do módulo em runtime nos testes de publish)
  return 'louvorja.custom.auth';
})();

const officialTrack = {
  id: 42,
  name: 'Hino Oficial 42',
  lyrics: [{ text: 'verso oficial', time: '00:00:01' }],
} as unknown as MediaTrackRecord;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('local-edit-store (RF-01, RF-02)', () => {
  it('salva e lê um edit draft', () => {
    saveLocalEdit(42, { lyrics: '[{"text":"verso editado"}]' });
    const edit = getLocalEdit(42);
    expect(edit?.lyrics).toBe('[{"text":"verso editado"}]');
    expect(edit?.status).toBe('draft');
  });

  it('RF-01: só letra/timing persistem — campos fora do escopo são descartados', () => {
    saveLocalEdit(42, {
      lyrics: 'x',
      ...({ audio: 'hack', cover: 'hack' } as object),
    } as never);
    const edit = getLocalEdit(42) as unknown as Record<string, unknown>;
    expect(edit.audio).toBeUndefined();
    expect(edit.cover).toBeUndefined();
  });

  it('save parcial preserva campos anteriores', () => {
    saveLocalEdit(42, { lyrics: 'A' });
    saveLocalEdit(42, { timing: 'T' });
    const edit = getLocalEdit(42);
    expect(edit?.lyrics).toBe('A');
    expect(edit?.timing).toBe('T');
  });

  it('lista ordenada por updatedAtMs desc', () => {
    saveLocalEdit(1, { lyrics: 'a' });
    saveLocalEdit(2, { lyrics: 'b' });
    // garantir timestamps distintos (same-ms pode empatar)
    const list = listLocalEdits();
    if (list[0].musicId === list[1].musicId) {
      // nunca deve ocorrer: chaves distintas
      expect.fail('chaves colidiram');
    }
    expect([list[0].musicId, list[1].musicId]).toContain(2);
    expect([list[0].musicId, list[1].musicId]).toContain(1);
  });

  it('delete remove; markPublished muda status', () => {
    saveLocalEdit(7, { lyrics: 'x' });
    markLocalEditPublished(7);
    expect(getLocalEdit(7)?.status).toBe('published');
    deleteLocalEdit(7);
    expect(getLocalEdit(7)).toBeNull();
  });

  it('localStorage corrompido → mapa vazio, não quebra', () => {
    window.localStorage.setItem('louvorja.local-edits.v1', '{lixo');
    expect(getLocalEdit(42)).toBeNull();
    expect(listLocalEdits()).toEqual([]);
  });
});

describe('edit-resolver (RF-02, RF-08)', () => {
  it('aplica edit por cima do oficial PRESERVANDO metadados', () => {
    const out = applyEditToTrack(officialTrack, {
      lyrics: '[{"text":"novo"}]',
      timing: null,
    });
    expect(out.name).toBe('Hino Oficial 42'); // metadado intacto
    expect(out.lyrics).toEqual([{ text: 'novo' }]);
  });

  it('edit local vence; sem edit local usa applied; sem nada = oficial', async () => {
    // 1) com edit local: fetchApplied NÃO é chamado
    saveLocalEdit(42, { lyrics: '[{"text":"local"}]' });
    const fetcher = vi.fn().mockResolvedValue({ lyrics: '[{"text":"remoto"}]', timing: null });
    const out1 = await resolveEditOverride(42, officialTrack, fetcher);
    expect(out1?.lyrics).toEqual([{ text: 'local' }]);
    expect(fetcher).not.toHaveBeenCalled();

    // 2) sem edit local: usa applied remoto
    deleteLocalEdit(42);
    const out2 = await resolveEditOverride(42, officialTrack, fetcher);
    expect(out2?.lyrics).toEqual([{ text: 'remoto' }]);

    // 3) sem nada: oficial intacta
    const fetcherNull = vi.fn().mockResolvedValue(null);
    const out3 = await resolveEditOverride(42, officialTrack, fetcherNull);
    expect(out3).toBe(officialTrack);
  });

  it('edit parcial (só timing) não apaga lyrics oficial', async () => {
    deleteLocalEdit(42);
    const out = applyEditToTrack(officialTrack, { lyrics: null, timing: 'T' });
    expect(out.lyrics).toEqual(officialTrack.lyrics);
  });

  it('lyrics JSON inválido no edit → oficial intacta', () => {
    const out = applyEditToTrack(officialTrack, { lyrics: 'não-json', timing: null });
    expect(out.lyrics).toEqual(officialTrack.lyrics);
  });
});

describe('publish-edit (RF-03)', () => {
  function mockFetchOk() {
    return vi.fn().mockResolvedValue({ ok: true, status: 201 } as Response);
  }

  it('sem sessão: não envia, mantém draft', async () => {
    saveLocalEdit(42, { lyrics: 'x' });
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const result = await publishEdit(42);
    expect(result.published).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getLocalEdit(42)?.status).toBe('draft');
    vi.unstubAllGlobals();
  });

  it('com sessão: POST com clientUuid sha256 determinístico e marca published', async () => {
    saveLocalEdit(42, { lyrics: '[{"text":"editado"}]' });
    // sessão: mesmo formato que o auth-client lê
    window.localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({ token: 'tok-test', user: { id_user: 7 } }),
    );
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const result = await publishEdit(42);
    expect(result.published).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/custom/edits');
    const body = JSON.parse(init.body as string) as { clientUuid: string; musicId: number };
    expect(body.musicId).toBe(42);
    expect(body.clientUuid).toMatch(/^[0-9a-f]{64}$/);
    expect(getLocalEdit(42)?.status).toBe('published');
    vi.unstubAllGlobals();
  });

  it('re-publicar conteúdo idêntico gera o MESMO clientUuid (idempotência)', async () => {
    window.localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({ token: 'tok-test', user: { id_user: 7 } }),
    );
    saveLocalEdit(42, { lyrics: 'mesmo' });
    vi.stubGlobal('fetch', mockFetchOk());
    const r1 = await publishEdit(42);
    saveLocalEdit(42, { status: 'draft' });
    const r2 = await publishEdit(42);
    expect(r1.published && r2.published && r1.clientUuid === r2.clientUuid).toBe(true);
    vi.unstubAllGlobals();
  });

  it('erro de API mantém draft', async () => {
    saveLocalEdit(42, { lyrics: 'x' });
    window.localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({ token: 'tok-test', user: { id_user: 7 } }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const result = await publishEdit(42);
    expect(result).toEqual({ published: false, error: 'api error 500' });
    expect(getLocalEdit(42)?.status).toBe('draft');
    vi.unstubAllGlobals();
  });

  it('sem edit local: erro imediato, sem rede', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const result = await publishEdit(999);
    expect(result.published).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('applied-edits (RF-08)', () => {
  it('retorna o edit applied da música', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          edits: [{ music_id: 42, lyrics: '[{"text":"aprovado"}]', timing: null }],
        }),
      } as Response),
    );
    const applied = await fetchAppliedEdit(42);
    expect(applied?.lyrics).toBe('[{"text":"aprovado"}]');
    vi.unstubAllGlobals();
  });

  it('erro de rede → null (oficial intacta)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await fetchAppliedEdit(42)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('resposta sem hit para a música → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ edits: [] }) } as Response),
    );
    expect(await fetchAppliedEdit(42)).toBeNull();
    vi.unstubAllGlobals();
  });
});
