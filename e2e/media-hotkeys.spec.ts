import { expect, test, type Page } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

// Real browser audio, served locally by the route mock. No external requests.
function silentWav(): Buffer {
  const samples = 60 * 8000
  const wav = Buffer.alloc(44 + samples, 128)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28)
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34)
  wav.write('data', 36); wav.writeUInt32LE(samples, 40)
  return wav
}

async function unfocus(page: Page) {
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur() })
}

async function playback(page: Page) {
  return page.evaluate(() => {
    const audio = (window as Window & { hkAudio?: HTMLMediaElement }).hkAudio
    const runtime = JSON.parse(localStorage.getItem('louvorja-media-runtime-state') ?? '{}')
    return { paused: audio?.paused, time: audio?.currentTime ?? 0, slide: runtime.slideIndex, ready: audio?.readyState }
  })
}

test('HK-1: miniplayer entre rotas, sincronia do áudio, guards e ajuda', async ({ page, context }) => {
  const wav = silentWav()
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue()
    const file = url.pathname.split('/').pop()
    if (file === 'pt_bible_book') return route.fulfill({ json: [{
      id_bible_book: 1, name: 'Gênesis', abbreviation: 'Gn', chapters: 1, book_number: 1, id_language: 'pt',
    }] })
    if (file === 'pt_bible_version') return route.fulfill({ json: [{
      id_bible_version: 1, name: 'Almeida Revista e Atualizada', abbreviation: 'ARA', id_language: 'pt',
    }] })
    if (file === 'bible_1_1_1') return route.fulfill({ json: {
      '1': 'Primeiro versículo de teste.', '2': 'Segundo versículo de teste.', '3': 'Terceiro versículo de teste.',
    } })
    if (file === 'hk1.wav') {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '')
      const start = range ? Number(range[1]) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
      return route.fulfill({
        status: range ? 206 : 200,
        contentType: 'audio/wav', body: wav.subarray(start, end + 1),
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
        },
      })
    }
    if (file === 'music_901') return route.fulfill({ json: {
      id_music: 901, name: 'Hino HK-1', url_music: 'https://media.test/hk1.wav',
      lyric: [
        { order: 1, lyric: 'Primeira estrofe', show_slide: 1, time: '00:00:12' },
        { order: 2, lyric: 'Segunda estrofe', show_slide: 1, time: '00:00:30' },
      ],
    } })
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(() => {
    localStorage.setItem('eula_accepted_v1', 'true')
    localStorage.setItem('language', 'pt-BR')
    localStorage.setItem('louvorja-popup-routing-v1', JSON.stringify({ media: 'tv' }))
    localStorage.setItem('louvorja-playlists-v1', JSON.stringify([{
      id: 'hk1', name: 'Ensaio HK-1', createdAt: '', updatedAt: '',
      items: [{ musicId: 901, albumId: null, title: 'Hino HK-1' }],
    }]))
    // Observe the native element without replacing playback or store behavior.
    const nativePlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      (window as Window & { hkAudio?: HTMLMediaElement }).hkAudio = this
      return nativePlay.call(this)
    }
  })
  await page.goto('/albums')
  await page.getByRole('button', { name: /playlists/i }).first().click()
  await page.getByRole('button', { name: 'Tocar Ensaio HK-1', exact: true }).click()
  await expect(page).toHaveURL(/\/media$/)
  await expect.poll(async () => (await playback(page)).paused).toBe(false)
  await expect.poll(async () => (await playback(page)).ready).toBe(4)

  // Maximized player: arrow uses slide timing, rather than a fixed time delta.
  await unfocus(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await playback(page)).slide).toBe(1)
  const firstTime = (await playback(page)).time
  expect(firstTime).toBeGreaterThanOrEqual(12)
  expect(firstTime).toBeLessThan(15)

  await page.getByRole('button', { name: 'Minimizar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/media$/)
  const mini = page.locator('.media-chrome')
  await expect(mini).toBeVisible()
  await unfocus(page)
  await page.keyboard.press('Space')
  await expect.poll(async () => (await playback(page)).paused).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await playback(page)).slide).toBe(2)
  expect((await playback(page)).time).toBeCloseTo(30, 1)
  expect((await playback(page)).paused).toBe(true)

  // Across another route, preserve the same playback and install no extra listener.
  await page.getByRole('button', { name: 'Bíblia', exact: true }).click()
  await expect(page).toHaveURL(/\/bible$/)
  await expect(page.locator('.bible-view')).toBeVisible()
  await page.locator('#bible-book-1').click()
  await page.locator('#bible-chapter-1').click()
  const verse = page.locator('.bible-reader__verse').filter({ hasText: 'Segundo versículo de teste.' })
  await verse.click()
  await expect(verse).toHaveClass(/--active/)
  await unfocus(page)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await playback(page)).slide).toBe(1)
  expect((await playback(page)).time).toBeCloseTo(12, 1)
  await expect(verse).toHaveClass(/--active/)

  // The real page field must retain arrows and spaces while typing.
  const field = page.locator('input[type="search"], input[type="text"]').first()
  await field.fill('teste')
  await field.press('ArrowRight')
  await field.press('Space')
  expect((await playback(page)).slide).toBe(1)
  expect((await playback(page)).paused).toBe(true)

  // Inspect cancelation without opening the browser's native print dialog.
  await unfocus(page)
  const canceled = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(canceled).toBe(false)

  const help = mini.getByRole('button', { name: 'Atalhos do player' })
  await help.focus()
  await expect(page.getByRole('tooltip')).toContainText('← — Slide anterior')
  await expect(page.getByRole('tooltip')).toContainText('Espaço — Reproduzir / pausar')
  await help.hover()
  await page.getByRole('tooltip').hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.screenshot({ path: 'reports/hk1/miniplayer-tooltip.png' })
  await help.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await unfocus(page)
  await page.keyboard.press('Space')
  await expect.poll(async () => (await playback(page)).paused).toBe(false)
})
