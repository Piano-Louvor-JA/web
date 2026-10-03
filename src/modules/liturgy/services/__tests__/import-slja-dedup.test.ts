import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * web#187 — dedup de import .slja (paridade app a60ddfd):
 * - hash sha-256 do arquivo → client_uuid determinístico no createCustomMusic
 * - resposta 200 (existed) = pula uploads e retorna a música existente
 * - sem sessão continua indo pra IndexedDB (não muda)
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

// crypto.subtle real do node (vitest node env tem)
const mocks = vi.hoisted(() => ({
  createCustomMusic: vi.fn(),
  createCustomCollection: vi.fn(),
  createCustomLyric: vi.fn(),
  listCustomCollections: vi.fn(),
  uploadCustomFile: vi.fn(),
  updateCustomMusic: vi.fn(),
  parseSlja: vi.fn(),
  getAuthSession: vi.fn(),
}))

vi.mock('@modules/media/services/custom-catalog', () => mocks)
vi.mock('@shared/services/slja', () => ({ parseSlja: mocks.parseSlja }))
vi.mock('@modules/auth/services/auth-client', () => ({
  getAuthSession: mocks.getAuthSession,
}))

import { importSljaAsCustomMusic } from '../import-slja'

function sljaFile(): File {
  const bytes = new TextEncoder().encode('SLJA-FIXO-1234')
  return new File([bytes], 'hino-teste.slja', { type: 'application/octet-stream' })
}

function archive() {
  return {
    title: 'Hino Teste',
    slides: [
      { lyric: 'primeira estrofe', order: 1, timeMs: 0 },
      { lyric: 'segunda estrofe', order: 2, timeMs: 5000 },
    ],
  }
}

describe('dedup de import .slja (web#187)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lsStore.clear()
    mocks.parseSlja.mockResolvedValue(archive())
    mocks.getAuthSession.mockReturnValue({ token: 'tok', idUser: 7 })
    mocks.listCustomCollections.mockResolvedValue([
      { id: 77, name: 'Importações .slja' },
    ])
    mocks.createCustomLyric.mockResolvedValue({ id: 1 })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 9, url: 'u' })
  })

  it('createCustomMusic recebe client_uuid determinístico (mesmo arquivo = mesmo uuid)', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 555 })
    const r1 = await importSljaAsCustomMusic(sljaFile())
    const r2 = await importSljaAsCustomMusic(sljaFile())

    expect(r1).not.toBeNull()
    expect(r2).not.toBeNull()
    const calls = mocks.createCustomMusic.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]![1]!.client_uuid).toBeTruthy()
    expect(calls[1]![1]!.client_uuid).toBe(calls[0]![1]!.client_uuid)
  })

  it('200 (existed) → pula uploads e retorna a música existente', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 555, existed: true })
    const r = await importSljaAsCustomMusic(sljaFile())

    expect(r).toMatchObject({ musicId: 555, local: false, slides: 0 })
    expect(mocks.uploadCustomFile).not.toHaveBeenCalled()
    expect(mocks.createCustomLyric).not.toHaveBeenCalled()
  })

  it('201 (novo) → fluxo normal com uploads e lyrics', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 556 })
    const r = await importSljaAsCustomMusic(sljaFile())

    expect(r).toMatchObject({ musicId: 556, local: false })
    expect(mocks.createCustomLyric).toHaveBeenCalled()
  })

  it('client_uuid muda quando o arquivo muda', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 1 })
    await importSljaAsCustomMusic(sljaFile())
    const other = new File([new TextEncoder().encode('OUTRO-ARQUIVO')], 'o.slja')
    mocks.parseSlja.mockResolvedValue(archive())
    await importSljaAsCustomMusic(other)
    const [c1, c2] = mocks.createCustomMusic.mock.calls
    expect(c1![1]!.client_uuid).not.toBe(c2![1]!.client_uuid)
  })
})
