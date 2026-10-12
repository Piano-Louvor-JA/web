import { beforeEach, describe, expect, it } from 'vitest'

import {
  getBrowserItem,
  removeBrowserItem,
  removeBrowserItemsByPrefix,
  setBrowserItem,
} from './browser-storage'

describe('browser-storage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('setBrowserItem serializa objeto; get devolve objeto', () => {
    setBrowserItem('k1', { a: 1 })
    expect(localStorage.getItem('k1')).toBe('{"a":1}')
    expect(getBrowserItem<{ a: number }>('k1')).toEqual({ a: 1 })
  })

  it('setBrowserItem grava primitivo como string; get parseia quando possível', () => {
    setBrowserItem('num', 42)
    expect(localStorage.getItem('num')).toBe('42')
    expect(getBrowserItem('num')).toBe(42)
    setBrowserItem('txt', 'olá')
    expect(getBrowserItem('txt')).toBe('olá')
    setBrowserItem('flag', true)
    expect(getBrowserItem('flag')).toBe(true)
  })

  it('getBrowserItem: chave ausente → fallback', () => {
    expect(getBrowserItem('nada')).toBeNull()
    expect(getBrowserItem('nada', 'padrao')).toBe('padrao')
    expect(getBrowserItem<number>('nada', 7)).toBe(7)
  })

  it('getBrowserItem: JSON inválido → devolve raw string (nunca crasha)', () => {
    localStorage.setItem('quebrado', '{não é json')
    expect(getBrowserItem('quebrado')).toBe('{não é json')
  })

  it('kind session usa sessionStorage', () => {
    setBrowserItem('sk', { s: 1 }, 'session')
    expect(sessionStorage.getItem('sk')).toBe('{"s":1}')
    expect(localStorage.getItem('sk')).toBeNull()
    expect(getBrowserItem('sk', null, 'session')).toEqual({ s: 1 })
  })

  it('removeBrowserItem remove no storage certo', () => {
    setBrowserItem('r1', 1)
    setBrowserItem('r2', 2, 'session')
    removeBrowserItem('r1')
    removeBrowserItem('r2', 'session')
    expect(localStorage.getItem('r1')).toBeNull()
    expect(sessionStorage.getItem('r2')).toBeNull()
  })

  it('removeBrowserItemsByPrefix remove só chaves com o prefixo', () => {
    setBrowserItem('pre:a', 1)
    setBrowserItem('pre:b', 2)
    setBrowserItem('outra', 3)
    setBrowserItem('prefixado', 4) // começa com 'pre' mas não com 'pre:'
    removeBrowserItemsByPrefix('pre:')
    expect(localStorage.getItem('pre:a')).toBeNull()
    expect(localStorage.getItem('pre:b')).toBeNull()
    expect(localStorage.getItem('outra')).toBe('3')
    expect(localStorage.getItem('prefixado')).toBe('4')
  })

  it('removeBrowserItemsByPrefix funciona em session e respeita ordem reversa', () => {
    setBrowserItem('p:1', 1, 'session')
    setBrowserItem('p:2', 2, 'session')
    setBrowserItem('p:3', 3, 'session')
    removeBrowserItemsByPrefix('p:', 'session')
    expect(sessionStorage.length).toBe(0)
  })
})
