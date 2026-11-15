import { expect, test } from '@playwright/test'

test('bundle de 8 MiB persiste em IndexedDB e sobrevive ao reload', async ({ page }) => {
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname
    return host === 'localhost' || host === '127.0.0.1' ? route.continue() : route.fulfill({ json: [] })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/shared/services/bundle-cache.ts'
    const cache = await import(modulePath)
    const payload = 'x'.repeat(8 * 1024 * 1024)
    let quotaExceeded = false
    try { localStorage.setItem('oversized', payload) }
    catch (error) { quotaExceeded = error instanceof DOMException && error.name === 'QuotaExceededError' }
    await cache.writeBundleSnapshot('e2e-large-bundle', { chapter: payload })
    return { quotaExceeded, length: (await cache.readBundleSnapshot('e2e-large-bundle')).chapter.length }
  })
  expect(result).toEqual({ quotaExceeded: true, length: 8 * 1024 * 1024 })
  await page.reload()
  expect(await page.evaluate(async () => {
    const modulePath = '/src/shared/services/bundle-cache.ts'
    const cache = await import(modulePath)
    return (await cache.readBundleSnapshot('e2e-large-bundle')).chapter.length
  })).toBe(8 * 1024 * 1024)
})
