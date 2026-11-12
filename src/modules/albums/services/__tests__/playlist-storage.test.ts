import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})

import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  movePlaylistItem,
  removePlaylistItem,
  renamePlaylist,
} from '../playlist-storage'

describe('playlist-storage', () => {
  beforeEach(() => localStorage.clear())

  it('cria e lista playlist persistida', () => {
    const playlist = createPlaylist('Culto jovem')

    expect(playlist.name).toBe('Culto jovem')
    expect(playlist.items).toEqual([])
    expect(playlist.createdAt).toBe(playlist.updatedAt)
    expect(listPlaylists()).toEqual([playlist])
  })

  it('adiciona faixa e evita duplicata consecutiva', () => {
    const playlist = createPlaylist('Ensaio')
    const item = { musicId: 7, albumId: 3, title: 'Vem, Senhor' }

    const updated = addPlaylistItem(playlist.id, item)
    const duplicated = addPlaylistItem(playlist.id, item)

    expect(updated?.playlist.items).toEqual([item])
    expect(updated?.added).toBe(true)
    expect(duplicated?.added).toBe(false)
    expect(listPlaylists()[0]?.items).toEqual([item])
  })

  it('remove faixa, renomeia e remove playlist', () => {
    const playlist = createPlaylist('Antiga')
    addPlaylistItem(playlist.id, { musicId: 1, albumId: null, title: 'Uma' })

    expect(removePlaylistItem(playlist.id, 0)?.items).toEqual([])
    expect(renamePlaylist(playlist.id, 'Nova')?.name).toBe('Nova')
    expect(deletePlaylist(playlist.id)).toBe(true)
    expect(listPlaylists()).toEqual([])
  })

  it('reordena músicas e persiste a nova sequência', () => {
  const playlist = createPlaylist('Louvores do culto')

  const primeira = { musicId: 1, albumId: 10, title: 'Primeira' }
  const segunda = { musicId: 2, albumId: 10, title: 'Segunda' }
  const terceira = { musicId: 3, albumId: 10, title: 'Terceira' }

  addPlaylistItem(playlist.id, primeira)
  addPlaylistItem(playlist.id, segunda)
  addPlaylistItem(playlist.id, terceira)

  const resultado = movePlaylistItem(playlist.id, 0, 2)

  expect(resultado?.items).toEqual([
    segunda,
    terceira,
    primeira,
  ])

  expect(listPlaylists()[0]?.items).toEqual([
    segunda,
    terceira,
    primeira,
  ])
  })

  it('rejeita índices inválidos sem alterar a playlist', () => {
  const playlist = createPlaylist('Ensaio')
  const primeira = { musicId: 1, albumId: 10, title: 'Primeira' }
  const segunda = { musicId: 2, albumId: 10, title: 'Segunda' }

  addPlaylistItem(playlist.id, primeira)
  addPlaylistItem(playlist.id, segunda)

  expect(movePlaylistItem(playlist.id, -1, 1)).toBeNull()
  expect(movePlaylistItem(playlist.id, 2, 0)).toBeNull()
  expect(movePlaylistItem(playlist.id, 0, -1)).toBeNull()
  expect(movePlaylistItem(playlist.id, 0, 2)).toBeNull()

  expect(listPlaylists()[0]?.items).toEqual([primeira, segunda])
})

it('não movimenta músicas de uma playlist inexistente', () => {
  const resultado = movePlaylistItem('playlist-inexistente', 0, 1)

  expect(resultado).toBeNull()
  expect(listPlaylists()).toEqual([])
})

it('rejeita remoções inválidas sem alterar a playlist', () => {
  const playlist = createPlaylist('Ensaio')
  const item = { musicId: 1, albumId: 10, title: 'Primeira' }

  addPlaylistItem(playlist.id, item)

  expect(removePlaylistItem(playlist.id, -1)).toBeNull()
  expect(removePlaylistItem(playlist.id, 1)).toBeNull()
  expect(removePlaylistItem('inexistente', 0)).toBeNull()

  expect(listPlaylists()[0]?.items).toEqual([item])
})

})