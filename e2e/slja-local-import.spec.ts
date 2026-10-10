import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'

// web#174: importar .slja SEM login → grava local (IndexedDB, id 900M+) →
// título do item recebe o nome da música → toca no player (blob: URL).

const fixtureDirs: string[] = []
test.afterEach(() => { for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function makeSlja(): string {
  const ini = [
    '[Geral]',
    'slides=2',
    'versao=1.0',
    'audio=1',
    'url_musica=audio/probe.mp3',
    '[Slide:1]',
    'tipo=CAPA',
    'letra=Hino de Probe E2E',
    'tempo_hms=00:00:00',
    '[Slide:2]',
    'tipo=LETRA',
    'letra=Segunda estrofe do probe',
    'tempo_hms=00:00:02',
  ].join('\r\n')
  const audio = readFileSync(new URL('../public/assets/alerts/5minutos_escsb.mp3', import.meta.url))
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030005fe02fea72d4c5b0000000049454e44ae426082',
    'hex',
  )
  const zipped = zipSync(
    {
      'audio/probe.mp3': audio,
      'imagens/fundo.png': png,
      'slides.lja': strToU8(ini),
    },
    { level: 0 },
  )
  const dir = mkdtempSync(join(tmpdir(), 'slja-e2e-'))
  fixtureDirs.push(dir)
  const path = join(dir, 'Hino Probe E2E.slja')
  writeFileSync(path, zipped)
  return path
}

test('importa .slja sem login, preenche título e toca no player', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/liturgy')

  // EULA: botão só habilita após rolar até o fim
  const eula = page.locator('.eula-dialog')
  if (await eula.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const area = page.locator('.eula-dialog__text-area')
    await area.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(300)
    await page.locator('.eula-dialog button:not([disabled])').last().click()
    await expect(eula).toBeHidden({ timeout: 5_000 })
  }

  // categoria (horas obrigatórias)
  await page.locator('button.liturgy-view__add').first().click()
  await page.getByRole('textbox', { name: /Nome do momento/i }).fill('Momento Probe')
  await page.locator('.moment-dialog input[type=time]').first().fill('05:00')
  await page.locator('.moment-dialog input[type=time]').nth(1).fill('06:00')
  await page.locator('.moment-dialog button[type=submit]').click()
  await expect(page.locator('.moment-dialog')).toBeHidden({ timeout: 5_000 })

  // sub item do tipo Música
  await page.locator('button[title="Adicionar sub item"]').first().click()
  await expect(page.locator('.moment-dialog')).toBeVisible()
  await page.locator('.moment-dialog__chip', { hasText: 'Música' }).first().click()
  await expect(page.locator('[data-testid="slja-file-input"]')).toBeAttached({ timeout: 5_000 })

  // importa o .slja
  await page.locator('input[data-testid="slja-file-input"]').setInputFiles(makeSlja())
  await expect(page.locator('.moment-dialog__slja-message')).toContainText(/importada/i, { timeout: 30_000 })

  // título do item = nome da música importada
  const nameInput = page.locator('.moment-dialog input[id="moment-name"]')
  await expect(nameInput).toHaveValue(/Hino Probe E2E/i, { timeout: 5_000 })

  // salvar
  await page.locator('.moment-dialog button[type=submit]').click()

  await page.reload()

  // tocar após recarregar: comprova persistência dos metadados e mídia local.
  // botão "Cantado" do item
  const row = page.locator('.liturgy-item', { hasText: /Hino Probe E2E/i }).first()
  await expect(row).toBeVisible({ timeout: 5_000 })
  await row.getByRole('button', { name: 'Cantado' }).click()

  // player tocando (sem "Não foi possível iniciar")
  await expect(page.locator('.media-player-pill__play')).toHaveAttribute('aria-label', /pausar/i, { timeout: 10_000 })
  const body = await page.locator('body').innerText()
  expect(body).not.toContain('Não foi possível iniciar')
  await expect(page.locator('body')).toContainText(/Hino Probe E2E/i)
})
