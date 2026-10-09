import { expect, test } from '@playwright/test'

// E2E: Módulo Liturgia — CRUD de itens, navegação, projeção, importação

const mockMusicCatalog = [
  {
    id: 101,
    name: 'Grandioso És Tu',
    hymnalTrack: 1,
    albumNames: 'Hinário Adventista',
    displayLabel: 'Grandioso És Tu — Hinário Adventista (faixa 1)',
    durationMs: 240000,
    hasInstrumental: true,
  },
  {
    id: 102,
    name: 'Sublime Graça',
    hymnalTrack: 103,
    albumNames: 'Hinário Adventista',
    displayLabel: 'Sublime Graça — Hinário Adventista (faixa 103)',
    durationMs: 180000,
    hasInstrumental: true,
  },
  {
    id: 103,
    name: 'Castelo Forte',
    hymnalTrack: 337,
    albumNames: 'Hinário Adventista',
    displayLabel: 'Castelo Forte — Hinário Adventista (faixa 337)',
    durationMs: 210000,
    hasInstrumental: false,
  },
]

const mockBibleBooks = [
  { id: 1, name: 'Gênesis', chapters: 50 },
  { id: 2, name: 'Êxodo', chapters: 40 },
  { id: 19, name: 'Salmos', chapters: 150 },
  { id: 23, name: 'Isaías', chapters: 66 },
  { id: 43, name: 'João', chapters: 21 },
]

test.describe('Liturgia — Fluxos E2E', () => {
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

    // Mock das APIs de catálogo de música
    await page.route('**/v1/liturgy/music*', async (route) => {
      await route.fulfill({ json: mockMusicCatalog })
    })

    await page.route('**/v1/liturgy/bible-books*', async (route) => {
      await route.fulfill({ json: mockBibleBooks })
    })

    // Mock das preferências de liturgia (localStorage é usado, mas podemos interceptar se houver API)
    await page.route('**/v1/liturgy/**', async (route) => {
      await route.fulfill({ json: {}, status: 200 })
    })

    // Navegar para a liturgia
    await page.goto('/liturgy')
    await page.waitForLoadState('networkidle')

    // Aguardar hidratação do store
    await page.waitForTimeout(500)
  })

  test('carrega a view de liturgia com título e abas de dias', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Liturgia')
    await expect(page.locator('.liturgy-day-tabs')).toBeVisible()
    // Verifica se as abas dos dias estão presentes (segunda a domingo)
    await expect(page.locator('.liturgy-day-tabs__tab')).toHaveCount(7)
  })

  test('cria uma categoria e adiciona itens dentro dela', async ({ page }) => {
    // Clica no botão adicionar item
    await page.click('.liturgy-view__add')
    await expect(page.locator('.liturgy-item-dialog')).toBeVisible()

    // Preenche categoria
    await page.fill('input[placeholder*="Nome da categoria"]', 'Louvor Inicial')
    await page.fill('input[placeholder*="Início"]', '09:00')
    await page.fill('input[placeholder*="Fim"]', '09:30')

    // Salva categoria
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Verifica se a categoria apareceu na timeline
    await expect(page.locator('.liturgy-timeline__item').first()).toContainText('Louvor Inicial')
    await expect(page.locator('.liturgy-timeline__item').first()).toContainText('09:00')

    // Adiciona sub-item (música) dentro da categoria
    await page.click('.liturgy-timeline__item .liturgy-timeline__add-sub')
    await expect(page.locator('.liturgy-item-dialog')).toBeVisible()

    // Seleciona tipo música
    await page.click('.liturgy-type-chip:has-text("Música")')
    await page.fill('input[placeholder*="Buscar música"]', 'Grandioso')
    await page.waitForTimeout(300)
    await page.click('.liturgy-music-option:has-text("Grandioso És Tu")')

    // Salva música
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Verifica se a música apareceu dentro da categoria
    const categoryItem = page.locator('.liturgy-timeline__item').first()
    await expect(categoryItem.locator('.liturgy-timeline__children')).toContainText('Grandioso És Tu')
  })

  test('adiciona item de leitura bíblica', async ({ page }) => {
    await page.click('.liturgy-view__add')
    await expect(page.locator('.liturgy-item-dialog')).toBeVisible()

    // Seleciona tipo leitura (annotation)
    await page.click('.liturgy-type-chip:has-text("Leitura")')
    await page.fill('input[placeholder*="Título"]', 'Leitura Bíblica')
    await page.fill('input[placeholder*="Subtítulo"]', 'Salmos 23')

    // Seleciona livro bíblico
    await page.click('.liturgy-verse-book-select')
    await page.click('.liturgy-verse-book-option:has-text("Salmos")')
    await page.fill('input[placeholder*="Capítulo"]', '23')

    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Verifica se apareceu
    await expect(page.locator('.liturgy-timeline__item').last()).toContainText('Leitura Bíblica')
    await expect(page.locator('.liturgy-timeline__item').last()).toContainText('Salmos 23')
  })

  test('edita item existente', async ({ page }) => {
    // Primeiro cria um item
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Aviso Importante')
    await page.fill('input[placeholder*="Subtítulo"]', 'Reunião de líderes às 14h')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Edita o item
    await page.click('.liturgy-timeline__item:has-text("Aviso Importante") .liturgy-timeline__edit')
    await expect(page.locator('.liturgy-item-dialog')).toBeVisible()

    await page.fill('input[placeholder*="Subtítulo"]', 'Reunião de líderes às 15h')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    await expect(page.locator('.liturgy-timeline__item:has-text("Aviso Importante")')).toContainText('15h')
  })

  test('remove item com confirmação', async ({ page }) => {
    // Cria item para remover
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Item para remover')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Remove o item
    await page.click('.liturgy-timeline__item:has-text("Item para remover") .liturgy-timeline__remove')
    await expect(page.locator('.app-confirm-dialog')).toBeVisible()
    await page.click('.app-confirm-dialog__confirm')
    await expect(page.locator('.app-confirm-dialog')).toHaveCount(0)

    // Verifica que sumiu
    await expect(page.locator('.liturgy-timeline__item:has-text("Item para remover")')).toHaveCount(0)
  })

  test('alterna dias da semana', async ({ page }) => {
    // Cria item na segunda-feira
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Segunda-feira item')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Vai para terça-feira
    await page.click('.liturgy-day-tabs__tab:has-text("Ter")')
    await expect(page.locator('.liturgy-timeline__item')).toHaveCount(0)

    // Volta para segunda
    await page.click('.liturgy-day-tabs__tab:has-text("Seg")')
    await expect(page.locator('.liturgy-timeline__item:has-text("Segunda-feira item")')).toBeVisible()
  })

  test('cria liturgia personalizada (custom)', async ({ page }) => {
    // Clica na aba Custom (última aba)
    await page.click('.liturgy-day-tabs__tab:has-text("Avulsa")')
    await expect(page.locator('.liturgy-custom-bar')).toBeVisible()

    // Cria nova liturgia custom
    await page.click('.liturgy-custom-bar__create')
    await expect(page.locator('.liturgy-custom-dialog')).toBeVisible()

    await page.fill('input[placeholder*="Nome da liturgia"]', 'Culto Jovem')
    await page.click('.liturgy-custom-dialog__create')
    await expect(page.locator('.liturgy-custom-dialog')).toHaveCount(0)

    // Verifica que a liturgia custom foi criada e selecionada
    await expect(page.locator('.liturgy-custom-bar__item')).toContainText('Culto Jovem')

    // Adiciona item na liturgia custom
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Música")')
    await page.fill('input[placeholder*="Buscar música"]', 'Sublime')
    await page.waitForTimeout(300)
    await page.click('.liturgy-music-option:has-text("Sublime Graça")')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    await expect(page.locator('.liturgy-timeline__item')).toContainText('Sublime Graça')
  })

  test('marca/desmarca item como concluído', async ({ page }) => {
    // Cria item
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Oração Inicial')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    const item = page.locator('.liturgy-timeline__item:has-text("Oração Inicial")')

    // Marca como feito
    await item.locator('.liturgy-timeline__checkbox').click()
    await expect(item).toHaveClass(/liturgy-timeline__item--done/)

    // Desmarca
    await item.locator('.liturgy-timeline__checkbox').click()
    await expect(item).not.toHaveClass(/liturgy-timeline__item--done/)
  })

  test('reordena itens via drag-and-drop', async ({ page }) => {
    // Cria dois itens
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Primeiro Item')
    await page.click('.liturgy-item-dialog__save')

    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Segundo Item')
    await page.click('.liturgy-item-dialog__save')

    // Verifica ordem inicial
    const items = page.locator('.liturgy-timeline__item')
    await expect(items.nth(0)).toContainText('Primeiro Item')
    await expect(items.nth(1)).toContainText('Segundo Item')

    // Drag and drop: move o segundo para antes do primeiro
    await items.nth(1).dragTo(items.nth(0))

    // Verifica nova ordem
    await expect(items.nth(0)).toContainText('Segundo Item')
    await expect(items.nth(1)).toContainText('Primeiro Item')
  })

  test('trava/desbloqueia exclusões', async ({ page }) => {
    // Cria item
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Item protegido')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Trava exclusões
    await page.click('.liturgy-view__lock')
    await expect(page.locator('.liturgy-view__lock')).toHaveClass(/liturgy-view__lock--active/)

    // Tenta remover — deve falhar silenciosamente (botão desabilitado)
    await page.click('.liturgy-timeline__item:has-text("Item protegido") .liturgy-timeline__remove')
    // O dialog de confirmação não deve aparecer
    await expect(page.locator('.app-confirm-dialog')).toHaveCount(0)

    // Destranca
    await page.click('.liturgy-view__lock')
    await expect(page.locator('.liturgy-view__lock')).not.toHaveClass(/liturgy-view__lock--active/)

    // Agora deve poder remover
    await page.click('.liturgy-timeline__item:has-text("Item protegido") .liturgy-timeline__remove')
    await expect(page.locator('.app-confirm-dialog')).toBeVisible()
    await page.click('.app-confirm-dialog__confirm')
    await expect(page.locator('.liturgy-timeline__item:has-text("Item protegido")')).toHaveCount(0)
  })

  test('limpa toda a liturgia do dia com confirmação', async ({ page }) => {
    // Cria alguns itens
    for (const name of ['Item 1', 'Item 2', 'Item 3']) {
      await page.click('.liturgy-view__add')
      await page.click('.liturgy-type-chip:has-text("Anotação")')
      await page.fill('input[placeholder*="Título"]', name)
      await page.click('.liturgy-item-dialog__save')
    }

    await expect(page.locator('.liturgy-timeline__item')).toHaveCount(3)

    // Limpa tudo
    await page.click('.liturgy-view__clear')
    await expect(page.locator('.app-confirm-dialog')).toBeVisible()
    await page.click('.app-confirm-dialog__confirm')
    await expect(page.locator('.app-confirm-dialog')).toHaveCount(0)

    await expect(page.locator('.liturgy-timeline__item')).toHaveCount(0)
  })

  test('define horários de início e fim da sessão', async ({ page }) => {
    // Preenche horário de início
    await page.fill('.liturgy-sidebar__start-input', '09:00')
    await expect(page.locator('.liturgy-sidebar__start-input')).toHaveValue('09:00')

    // Preenche horário de fim
    await page.fill('.liturgy-sidebar__end-input', '11:30')
    await expect(page.locator('.liturgy-sidebar__end-input')).toHaveValue('11:30')

    // Inicia contagem regressiva
    await page.click('.liturgy-sidebar__start-countdown')
    await expect(page.locator('.liturgy-sidebar__countdown')).toBeVisible()
    await expect(page.locator('.liturgy-sidebar__countdown')).toContainText(/2:30|2:29|2:28/)

    // Para contagem
    await page.click('.liturgy-sidebar__stop-countdown')
    await expect(page.locator('.liturgy-sidebar__countdown')).toHaveCount(0)
  })

  test('abre diálogo de importação .ja', async ({ page }) => {
    await page.click('.liturgy-view__toolbar button[title*="Importar .ja"]')
    await expect(page.locator('.app-confirm-dialog')).toBeVisible()
    await expect(page.locator('.app-confirm-dialog')).toContainText('Selecione o arquivo')
  })

  test('busca música no catálogo', async ({ page }) => {
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Música")')

    // Busca por "Castelo"
    await page.fill('input[placeholder*="Buscar música"]', 'Castelo')
    await page.waitForTimeout(300)
    await expect(page.locator('.liturgy-music-option')).toHaveCount(1)
    await expect(page.locator('.liturgy-music-option')).toContainText('Castelo Forte')

    // Limpa busca
    await page.fill('input[placeholder*="Buscar música"]', '')
    await page.waitForTimeout(300)
    await expect(page.locator('.liturgy-music-option')).toHaveCount(3)
  })

  test('mostra duração da música selecionada', async ({ page }) => {
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Música")')
    await page.fill('input[placeholder*="Buscar música"]', 'Grandioso')
    await page.waitForTimeout(300)
    await page.click('.liturgy-music-option:has-text("Grandioso És Tu")')

    // Verifica se a duração foi preenchida automaticamente (4min = 240000ms)
    await expect(page.locator('input[placeholder*="Duração"]')).toHaveValue('4:00')

    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Verifica na timeline
    await expect(page.locator('.liturgy-timeline__item:has-text("Grandioso És Tu")')).toContainText('4:00')
  })

  test('clona liturgia de outro dia', async ({ page }) => {
    // Cria itens na segunda-feira
    await page.click('.liturgy-day-tabs__tab:has-text("Seg")')
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Anotação")')
    await page.fill('input[placeholder*="Título"]', 'Item para clonar')
    await page.click('.liturgy-item-dialog__save')

    // Vai para terça-feira (vazia)
    await page.click('.liturgy-day-tabs__tab:has-text("Ter")')
    await expect(page.locator('.liturgy-timeline__item')).toHaveCount(0)

    // Botão clonar deve aparecer
    await expect(page.locator('.liturgy-view__toolbar button[title*="Clonar"]')).toBeVisible()
    await page.click('.liturgy-view__toolbar button[title*="Clonar"]')
    await expect(page.locator('.liturgy-clone-dialog')).toBeVisible()

    // Seleciona segunda-feira como fonte
    await page.click('.liturgy-clone-source:has-text("Segunda-feira")')
    await page.click('.liturgy-clone-dialog__confirm')
    await expect(page.locator('.liturgy-clone-dialog')).toHaveCount(0)

    // Verifica que itens foram clonados
    await expect(page.locator('.liturgy-timeline__item')).toContainText('Item para clonar')
  })
})

test.describe('Liturgia — Projeção Web', () => {
  test.beforeEach(async ({ page }) => {
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

    await page.route('**/v1/liturgy/music*', async (route) => {
      await route.fulfill({ json: mockMusicCatalog })
    })

    await page.route('**/v1/liturgy/bible-books*', async (route) => {
      await route.fulfill({ json: mockBibleBooks })
    })

    await page.route('**/v1/liturgy/**', async (route) => {
      await route.fulfill({ json: {}, status: 200 })
    })

    await page.goto('/liturgy')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
  })

  test('projeta item do tipo site (abre popup)', async ({ page }) => {
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Site")')
    await page.fill('input[placeholder*="Título"]', 'Site da Igreja')
    await page.fill('input[placeholder*="URL"]', 'https://adventistas.org')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Clica no botão de projetar do item
    await page.click('.liturgy-timeline__item:has-text("Site da Igreja") .liturgy-timeline__play-screens')

    // Verifica que o popup foi aberto (checa se runtime foi publicado)
    // O indicador visual de projeção deve aparecer
    await expect(page.locator('.liturgy-timeline__item:has-text("Site da Igreja")')).toHaveClass(/liturgy-timeline__item--projecting/)
  })

  test('projeta item de vídeo online (YouTube)', async ({ page }) => {
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Vídeo online")')
    await page.fill('input[placeholder*="Título"]', 'Vídeo de Louvor')
    await page.fill('input[placeholder*="URL"]', 'https://youtube.com/watch?v=abc123')
    await page.click('.liturgy-item-dialog__save')
    await expect(page.locator('.liturgy-item-dialog')).toHaveCount(0)

    // Projeta
    await page.click('.liturgy-timeline__item:has-text("Vídeo de Louvor") .liturgy-timeline__play-screens')
    await expect(page.locator('.liturgy-timeline__item:has-text("Vídeo de Louvor")')).toHaveClass(/liturgy-timeline__item--projecting/)
  })

  test('encerra projeção via botão limpar projeção', async ({ page }) => {
    // Cria e projeta um site
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Site")')
    await page.fill('input[placeholder*="Título"]', 'Site Teste')
    await page.fill('input[placeholder*="URL"]', 'https://example.com')
    await page.click('.liturgy-item-dialog__save')

    await page.click('.liturgy-timeline__item:has-text("Site Teste") .liturgy-timeline__play-screens')
    await expect(page.locator('.liturgy-timeline__item:has-text("Site Teste")')).toHaveClass(/liturgy-timeline__item--projecting/)

    // Clica no botão global de limpar projeção (no header/sidebar)
    await page.click('.liturgy-sidebar__clear-projection')
    await expect(page.locator('.liturgy-timeline__item:has-text("Site Teste")')).not.toHaveClass(/liturgy-timeline__item--projecting/)
  })
})

test.describe('Liturgia — Notas e Observações', () => {
  test.beforeEach(async ({ page }) => {
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

    await page.route('**/v1/liturgy/music*', async (route) => {
      await route.fulfill({ json: mockMusicCatalog })
    })

    await page.route('**/v1/liturgy/bible-books*', async (route) => {
      await route.fulfill({ json: mockBibleBooks })
    })

    await page.goto('/liturgy')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
  })

  test('edita notas do dia', async ({ page }) => {
    const notesTextarea = page.locator('.liturgy-sidebar__notes textarea')
    await notesTextarea.fill('Lembrar de avisar sobre o batismo no próximo sábado.')
    await page.click('.liturgy-view__header') // Click fora para disparar blur/save

    // Troca de dia e volta
    await page.click('.liturgy-day-tabs__tab:has-text("Ter")')
    await page.click('.liturgy-day-tabs__tab:has-text("Seg")')

    // Notas devem persistir
    await expect(notesTextarea).toHaveValue('Lembrar de avisar sobre o batismo no próximo sábado.')
  })

  test('notas são independentes por dia', async ({ page }) => {
    // Notas na segunda
    await page.click('.liturgy-day-tabs__tab:has-text("Seg")')
    await page.locator('.liturgy-sidebar__notes textarea').fill('Notas da segunda')

    // Notas na terça
    await page.click('.liturgy-day-tabs__tab:has-text("Ter")')
    await page.locator('.liturgy-sidebar__notes textarea').fill('Notas da terça')

    // Volta na segunda
    await page.click('.liturgy-day-tabs__tab:has-text("Seg")')
    await expect(page.locator('.liturgy-sidebar__notes textarea')).toHaveValue('Notas da segunda')

    // Volta na terça
    await page.click('.liturgy-day-tabs__tab:has-text("Ter")')
    await expect(page.locator('.liturgy-sidebar__notes textarea')).toHaveValue('Notas da terça')
  })
})

test.describe('Liturgia — Sem Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.route('**/v1/liturgy/**', async (route) => {
      await route.fulfill({ json: {}, status: 200 })
    })
    await page.goto('/liturgy')
    await page.waitForLoadState('networkidle')
  })

  test('view carrega mas sem dados de catálogo (modo offline)', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Liturgia')
    await expect(page.locator('.liturgy-day-tabs')).toBeVisible()

    // Tenta adicionar música — catálogo vazio deve mostrar estado vazio
    await page.click('.liturgy-view__add')
    await page.click('.liturgy-type-chip:has-text("Música")')
    await expect(page.locator('.liturgy-item-dialog')).toContainText(/catálogo vazio|nenhuma música/i)
  })
})