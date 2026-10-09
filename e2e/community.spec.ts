import { expect, test } from '@playwright/test'

// E2E: Módulo Community — catálogo, ranking, tarefas, notificações, denúncia

const mockCollections = {
  items: [
    {
      id: 7,
      name: 'Hinos de louvor',
      authorName: 'Rafael',
      authorId: 1,
      musicsCount: 12,
      coverUrl: null,
      createdAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 8,
      name: 'Cantatas de Natal',
      authorName: 'Maria',
      authorId: 2,
      musicsCount: 8,
      coverUrl: null,
      createdAt: '2026-11-01T00:00:00Z',
    },
  ],
  page: 1,
  lastPage: 1,
  total: 2,
}

const mockRanking = [
  { user_id: 1, display_name: 'Ana', position: 1, total: 100 },
  { user_id: 2, display_name: 'Bruno', position: 2, total: 80 },
  { user_id: 3, display_name: 'Carlos', position: 3, total: 60 },
]

const mockMyPosition = { position: 2, total: 80 }

const mockSeasonal = {
  name: 'Semana do Hinário',
  description: '2x pontos',
  multiplier: 2,
}

const mockTasks = [
  { id: 1, description: 'Use 3 coletâneas', bonus: 10, done: false },
  { id: 2, description: 'Denuncie 1 coletânea', bonus: 5, done: false },
]

const mockNotifications = [
  {
    id: 1,
    type: 'ranking',
    title: 'Subiu no ranking',
    body: 'Você subiu 3 posições',
    created_at: '2026-09-17T10:00:00Z',
  },
]

test.describe('Community — Fluxos E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login mock — injeta token no localStorage antes de navegar
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem(
        'auth_session',
        JSON.stringify({
          token: 'test-token',
          user: { id_user: 1, email: 'test@test.com', displayName: 'TestUser' },
        }),
      )
    })

    // Mock de todas as APIs do community
    await page.route('**/v1/community/collections*', async (route) => {
      const url = new URL(route.request().url())
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10)
      const perPage = parseInt(url.searchParams.get('per_page') || '24', 10)
      const start = (pageNum - 1) * perPage
      const items = mockCollections.items.slice(start, start + perPage)
      await route.fulfill({
        json: {
          items,
          page: pageNum,
          lastPage: Math.ceil(mockCollections.items.length / perPage),
          total: mockCollections.items.length,
        },
      })
    })

    await page.route('**/v1/community/ranking*', async (route) => {
      const url = new URL(route.request().url())
      const window = url.searchParams.get('window') || 'all'
      await route.fulfill({ json: mockRanking })
    })

    await page.route('**/v1/community/ranking/me*', async (route) => {
      await route.fulfill({ json: mockMyPosition })
    })

    await page.route('**/v1/community/seasonal-event', async (route) => {
      await route.fulfill({ json: mockSeasonal })
    })

    await page.route('**/v1/community/weekly-tasks', async (route) => {
      await route.fulfill({ json: mockTasks })
    })

    await page.route('**/v1/community/notifications', async (route) => {
      await route.fulfill({ json: mockNotifications })
    })

    await page.route('**/v1/community/collections/copy', async (route) => {
      await route.fulfill({ json: { id: 42 }, status: 201 })
    })

    await page.route('**/v1/community/collections/use', async (route) => {
      await route.fulfill({ json: true, status: 200 })
    })

    await page.route('**/v1/community/collections/report', async (route) => {
      await route.fulfill({ json: true, status: 201 })
    })

    await page.route('**/v1/community/**', async (route) => {
      await route.fulfill({ json: {}, status: 404 })
    })

    // Navegar pro community
    await page.goto('/community')
    await page.waitForLoadState('networkidle')
  })

  test('mostra catálogo de coletâneas com busca, paginação e detalhes', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Comunidade')
    await expect(page.locator('.community-view__card')).toHaveCount(2)
    await expect(page.locator('.community-view__card').first()).toContainText('Hinos de louvor')
    await expect(page.locator('.community-view__card').first()).toContainText('por Rafael')
    await expect(page.locator('.community-view__card').first()).toContainText('12 faixas')

    // Busca
    await page.fill('input[type="search"]', 'cantatas')
    await page.waitForTimeout(300)
    await expect(page.locator('.community-view__card')).toHaveCount(1)
    await expect(page.locator('.community-view__card')).toContainText('Cantatas de Natal')

    // Limpar busca
    await page.click('.community-view__search-clear')
    await expect(page.locator('.community-view__card')).toHaveCount(2)
  })

  test('salva cópia de coletânea e mostra feedback', async ({ page }) => {
    await page.click('.community-view__copy-btn')
    await expect(page.locator('.community-view__card').first()).toContainText('Salvo')
    // Botão fica desabilitado brevemente durante save
    await expect(page.locator('.community-view__copy-btn').first()).toBeDisabled({ timeout: 1000 })
    // Volta a ficar habilitado
    await expect(page.locator('.community-view__copy-btn').first()).toBeEnabled({ timeout: 3000 })
  })

  test('abre ranking e mostra posição do usuário', async ({ page }) => {
    await page.click('.community-view__ranking-link')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText('Ranking')
    await expect(page.locator('.ranking-view__row')).toHaveCount(3)
    await expect(page.locator('.ranking-view__row--me')).toContainText('Bruno')
    await expect(page.locator('.ranking-view__row--top')).toContainText('Ana')
  })

  test('troca aba ranking semana/geral', async ({ page }) => {
    await page.click('.community-view__ranking-link')
    await page.waitForLoadState('networkidle')
    await page.click('.ranking-view__tab:has-text("Semana")')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.ranking-view__tab--active')).toContainText('Semana')
  })

  test('mostra notificações no sino', async ({ page }) => {
    await expect(page.locator('.community-view__bell')).toBeVisible()
    await expect(page.locator('.community-view__bell-badge')).toHaveText('1')
    await page.click('.community-view__bell')
    await expect(page.locator('.notifications-dropdown')).toBeVisible()
    await expect(page.locator('.notifications-dropdown')).toContainText('Subiu no ranking')
  })

  test('abre e submete denúncia de coletânea', async ({ page }) => {
    await page.click('.community-view__report-btn')
    await expect(page.locator('.report-dialog')).toBeVisible()
    await page.fill('textarea', 'Conteúdo impróprio para a comunidade')
    await page.click('.report-dialog__submit')
    await expect(page.locator('.report-dialog')).toHaveCount(0)
  })

  test('mostra tarefas semanais e evento sazonal', async ({ page }) => {
    await expect(page.locator('.community-view__seasonal')).toContainText('Semana do Hinário')
    await expect(page.locator('.community-view__seasonal')).toContainText('x2')
    await expect(page.locator('.community-view__task')).toHaveCount(2)
  })
})

test.describe('Community — Sem login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.route('**/v1/community/**', async (route) => {
      await route.fulfill({ json: {}, status: 200 })
    })
    await page.goto('/community')
    await page.waitForLoadState('networkidle')
  })

  test('não mostra sino de notificações', async ({ page }) => {
    await expect(page.locator('.community-view__bell')).toHaveCount(0)
  })

  test('não mostra card de posição no ranking (link ainda existe)', async ({ page }) => {
    await page.click('.community-view__ranking-link')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.ranking-view__me')).toContainText('Entre para ver')
  })
})