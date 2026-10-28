import { describe, expect, it } from 'vitest'

import { parseVerseFilter } from '../scripture-format'

describe('parseVerseFilter — listas e intervalos mistos (paridade app R4+)', () => {
  it('aceita intervalo simples', () => {
    expect(parseVerseFilter('1-4')).toEqual([1, 2, 3, 4])
  })

  it('aceita lista com intervalo e extra: "1-4, 6"', () => {
    expect(parseVerseFilter('1-4, 6')).toEqual([1, 2, 3, 4, 6])
  })

  it('dedup e ordena', () => {
    expect(parseVerseFilter('6, 2, 4-4, 2')).toEqual([2, 4, 6])
  })

  it('normaliza travessão tipográfico (en dash U+2013)', () => {
    expect(parseVerseFilter('1\u20134, 6')).toEqual([1, 2, 3, 4, 6])
  })

  it('normaliza travessão eme (em dash U+2014)', () => {
    expect(parseVerseFilter('1\u20144')).toEqual([1, 2, 3, 4])
  })

  it('rejeita torta: qualquer parte inválida anula tudo (paridade app)', () => {
    expect(parseVerseFilter('1-4, abc')).toEqual([])
    expect(parseVerseFilter('0')).toEqual([])
    expect(parseVerseFilter('')).toEqual([])
  })
})
