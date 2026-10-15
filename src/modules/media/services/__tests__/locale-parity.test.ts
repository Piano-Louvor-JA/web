import { describe, expect, it } from 'vitest'

import en from '../../locales/en'
import es from '../../locales/es'
import ptBR from '../../locales/pt-BR'

type Tree = Record<string, unknown>

function keys(value: Tree, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? keys(child as Tree, path)
      : [path]
  })
}

describe('media locales', () => {
  it('mantém as mesmas chaves em pt-BR, en e es', () => {
    const expected = keys(ptBR.media as Tree).sort()
    expect(keys(en.media as Tree).sort()).toEqual(expected)
    expect(keys(es.media as Tree).sort()).toEqual(expected)
  })
})
