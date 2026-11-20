// @vitest-environment node
// Decisão de produto vigente (20/11/2026): "Minhas Coletâneas" fica oculta na
// Central até o recurso ficar pronto (vai para a aba Comunidade).
// TODO(minhas-coletaneas): rever quando a seção voltar.
import { describe, expect, it } from 'vitest'
import { SHOW_CUSTOM_COLLECTIONS } from '../constants'

describe('albums/constants', () => {
  it('SHOW_CUSTOM_COLLECTIONS está desligada (decisão 20/11/2026)', () => {
    expect(SHOW_CUSTOM_COLLECTIONS).toBe(false)
  })
})
