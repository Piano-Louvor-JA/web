import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LITURGY_ITEM_DRAFT,
  type LiturgyItemDraft,
} from '../types/liturgy'
import { isLiturgyItemDraftValid } from '../services/liturgy-item-helpers'

function draftWith(partial: Partial<LiturgyItemDraft>): LiturgyItemDraft {
  return { ...DEFAULT_LITURGY_ITEM_DRAFT, ...partial }
}

describe('isLiturgyItemDraftValid — categoria opcional', () => {
  it('item de leitura SEM categoria é válido (categoria virou opcional)', () => {
    const draft = draftWith({ type: 'reading', name: 'Leitura Bíblica' })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })

  it('item com tipo interno (áudio) SEM categoria é válido', () => {
    const draft = draftWith({
      type: 'audio',
      name: 'Áudio especial',
      filePath: '/tmp/audio.mp3',
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })

  it('item COM categoria continua válido', () => {
    const draft = draftWith({
      type: 'reading',
      name: 'Leitura',
      categoryId: 'cat-1',
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })

  it('categoria NÃO substitui as demais validações: sem nome segue inválido', () => {
    const draft = draftWith({ type: 'reading', name: '   ' })
    expect(isLiturgyItemDraftValid(draft)).toBe(false)
  })

  it('música sem música selecionada segue inválido (categoria opcional não libera isso)', () => {
    const draft = draftWith({ type: 'music', name: 'Música', musicId: null })
    expect(isLiturgyItemDraftValid(draft)).toBe(false)
  })

  it('categoria (type category) sem pai continua válida', () => {
    const draft = draftWith({
      type: 'category',
      name: 'Momento',
      startTime: '10:00',
      endTime: '10:15',
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })
})
