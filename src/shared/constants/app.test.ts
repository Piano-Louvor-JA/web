import { describe, expect, it } from 'vitest'

import { APP_PRODUCT_NAME, APP_VERSION } from './app'

/**
 * __APP_VERSION__ é injetado pelo Vite a partir do package.json; no vitest
 * (herdando resolve do vite.config) a constante já existe como string.
 */
describe('constants/app', () => {
  it('APP_VERSION começa com v e reflete a versão do package.json', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+/)
  })

  it('APP_PRODUCT_NAME é o nome do produto LouvorJA - PIANO', () => {
    expect(APP_PRODUCT_NAME).toBe('LouvorJA - PIANO')
  })
})
