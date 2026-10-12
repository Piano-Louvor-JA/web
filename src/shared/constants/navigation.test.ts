import { describe, expect, it } from 'vitest'

import { mainNavRoutes } from './navigation'

describe('constants/navigation', () => {
  it('mainNavRoutes tem as 7 entradas principais', () => {
    expect(mainNavRoutes).toHaveLength(7)
  })

  it('todas as rotas têm key/labelKey/icon/to preenchidos', () => {
    for (const r of mainNavRoutes) {
      expect(r.key, `key de ${r}`).toBeTruthy()
      expect(r.labelKey).toMatch(/^nav\./)
      expect(r.icon).toMatch(/^ti-/)
      expect(r.to.startsWith('/')).toBe(true)
    }
  })

  it('keys são únicas', () => {
    const keys = mainNavRoutes.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('home é a primeira e aponta pra /', () => {
    expect(mainNavRoutes[0].key).toBe('home')
    expect(mainNavRoutes[0].to).toBe('/')
  })

  it('settings aponta pro primeiro tab de settings', () => {
    const settings = mainNavRoutes.find((r) => r.key === 'settings')
    expect(settings?.to).toBe('/settings/appearance')
  })
})
