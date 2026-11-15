import { expect, test, type Page } from '@playwright/test'

// E2E PW-1: painel de playlists no hub Albums — criar → renomear → tocar (vazia) → excluir.
// API mockada por page.route (regra dura: E2E nunca contra produção).

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('eula_accepted_v1', 'true')
    localStorage.setItem(
      'louvorja.custom.auth',
      JSON.stringify({
        token: 'test-token',
        user: { id_user: 1, email: 'test@test.com', displayName: 'TestUser' },
      }),
    )
  })
  await page.route('**/v1/**', async (route) => {
    await route.fulfill({ json: [] })
  })
}

async function openPlaylistsModal(page: Page) {
  await page.getByRole('button', { name: /playlists/i }).first().click()
  await expect(page.getByRole('dialog', { name: 'Playlists' })).toBeVisible()
}

test.describe('Playlists — painel do hub Albums', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/albums')
  })

  test('criar → renomear → feedback de vazia → excluir', async ({ page }) => {
    await openPlaylistsModal(page)

    // 1. Criar playlist
    await page.getByLabel('Nome da nova playlist...').fill('Culto Especial')
    await page.getByRole('button', { name: 'Criar' }).click()
    await expect(page.getByText('Culto Especial')).toBeVisible()

    // 2. Renomear no painel
    await page.getByTestId('playlist-rename').click()
    const renameInput = page.getByTestId('playlist-rename-input')
    await expect(renameInput).toBeVisible()
    await renameInput.fill('Culto Renomeado')
    await renameInput.press('Enter')
    await expect(page.getByText('Culto Renomeado')).toBeVisible()

    // Storage reflete o rename (playlist-storage / updatedAt)
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('louvorja-playlists-v1') ?? '[]'),
    )
    const names = (stored as { name: string }[]).map((p) => p.name)
    expect(names).toContain('Culto Renomeado')

    // 3. Tocar playlist vazia → feedback, sem navegar
    await page.getByTestId('playlist-play').click()
    await expect(page.getByText(/Playlist vazia/i)).toBeVisible()
    expect(page.url()).not.toContain('/media')

    // 4. Excluir
    await page.getByRole('button', { name: /Remover playlist Culto Renomeado/i }).click()
    await expect(page.getByText('Culto Renomeado')).toBeHidden()

    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('louvorja-playlists-v1') ?? '[]'),
    )
    expect((after as unknown[]).length).toBe(0)
  })
})
