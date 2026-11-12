import { expect, test } from '@playwright/test'

test('playlists: criar → adicionar → renomear → tocar → excluir', async ({ page }) => {
  // All external requests are mocked: no production or staging writes.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue()
    const file = url.pathname.split('/').pop()
    if (file?.endsWith('_categories')) return route.fulfill({ json: [
      { id_category: 1, name: 'Álbuns', albums: [{ id_album: 900, name: 'Álbum de teste' }] },
    ] })
    if (file === 'album_900') return route.fulfill({ json: {
      name: 'Álbum de teste', musics: [{ id_music: 901, name: 'Faixa de teste', track: 1 }],
    } })
    if (file === 'music_901') return route.fulfill({ json: {
      id_music: 901, name: 'Faixa de teste', url_music: null,
      lyric: [{ order: 1, lyric: 'Louvor', show_slide: 1 }],
    } })
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(() => {
    localStorage.setItem('eula_accepted_v1', 'true')
    localStorage.setItem('language', 'pt-BR')
  })
  await page.goto('/albums')
  const openPanel = () => page.locator('.albums-view__toolbar-btn').first().click()
  await openPanel()
  await page.getByPlaceholder('Nome da nova playlist...').fill('Culto')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.getByRole('button', { name: 'Tocar Culto', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('A playlist está vazia.')
  await expect(page).toHaveURL(/\/albums$/)
  await page.locator('.albums-view__modal-header button').click()
  await page.locator('.album-collection-card').filter({ hasText: 'Álbum de teste' }).hover()
  await page.getByRole('button', { name: 'Abrir Álbum de teste', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar Faixa de teste à playlist' }).click()
  await page.locator('.playlist-picker__option').filter({ hasText: 'Culto' }).click()
  await page.goto('/albums')
  await openPanel()
  await page.getByTestId('playlist-rename').click()
  await page.getByTestId('playlist-rename-input').fill('Culto Jovem')
  await page.getByTestId('playlist-rename-save').click()
  await expect(page.getByRole('status')).toHaveText('Playlist renomeada')
  await expect(page.locator('.albums-view__playlist-name')).toContainText('Culto Jovem')
  await page.getByRole('button', { name: 'Tocar Culto Jovem', exact: true }).click()
  await expect(page).toHaveURL(/\/media/)
  await page.goto('/albums')
  await openPanel()
  await page.getByTestId('playlist-delete').click()
  await expect(page.locator('.albums-view__playlist')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('louvorja-playlists-v1') ?? '[]'))).toEqual([])
  await page.reload()
  await openPanel()
  await expect(page.locator('.albums-view__playlist')).toHaveCount(0)
})
