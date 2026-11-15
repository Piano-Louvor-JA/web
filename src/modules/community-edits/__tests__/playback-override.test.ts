import { beforeEach, expect, it, vi } from 'vitest'
import { resolveMediaTrack } from '@modules/media/services/custom-catalog'
import { saveLocalEdit } from '../services/local-edit-store'
import { fetchAppliedEdit } from '../services/applied-edits'

vi.mock('@modules/media/services/media-catalog', () => ({
  loadMediaTrack: vi.fn(async () => ({ id: 42, name: 'Oficial', audioUrl: 'original.mp3', lyrics: [] })),
}))
vi.mock('../services/applied-edits', () => ({ fetchAppliedEdit: vi.fn(async () => null) }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

it('reprodução oficial aplica a edição local sem consultar a rede', async () => {
  saveLocalEdit(42, { lyrics: JSON.stringify([{ order: 1, lyric: 'Corrigido', time: '00:02' }]) })
  const track = await resolveMediaTrack(42)
  expect(track?.lyrics[0]?.lyric).toBe('Corrigido')
  expect(track?.audioUrl).toBe('original.mp3')
  expect(fetchAppliedEdit).not.toHaveBeenCalled()
})

it('sem edição local, reprodução aplica a edição aprovada', async () => {
  vi.mocked(fetchAppliedEdit).mockResolvedValueOnce({ lyrics: JSON.stringify([{ order: 1, lyric: 'Aprovado' }]), timing: null })
  const track = await resolveMediaTrack(42)
  expect(track?.lyrics[0]?.lyric).toBe('Aprovado')
  expect(track?.name).toBe('Oficial')
})
