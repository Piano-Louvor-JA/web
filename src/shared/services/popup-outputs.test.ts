import { beforeEach, describe, expect, it } from 'vitest'

import {
  displayLabel,
  getOutputLabel,
  setOutputLabel,
} from './popup-outputs'

describe('popup-outputs (output registry)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('label padrão vazio quando slot nunca nomeado', () => {
    expect(getOutputLabel(1)).toBe('')
  })

  it('setOutputLabel persiste e getOutputLabel lê de volta', () => {
    setOutputLabel(1, 'TV Sala')
    expect(getOutputLabel(1)).toBe('TV Sala')
    // persistido em localStorage
    const raw = localStorage.getItem('louvorja-popup-output-labels-v1')
    expect(raw).toContain('TV Sala')
  })

  it('displayLabel: persistido tem prioridade; fallback "Tela N"', () => {
    expect(displayLabel(2)).toBe('Tela 2')
    setOutputLabel(2, 'Projetor')
    expect(displayLabel(2)).toBe('Projetor')
  })

  it('localStorage corrompido → labels vazios (não crasha)', () => {
    localStorage.setItem('louvorja-popup-output-labels-v1', '{quebrado')
    expect(getOutputLabel(3)).toBe('')
    expect(displayLabel(3)).toBe('Tela 3')
  })

  it('setOutputLabel sobre label localStorage inválido não crasha e salva', () => {
    localStorage.setItem('louvorja-popup-output-labels-v1', 'não-json')
    setOutputLabel(4, 'Nova')
    expect(getOutputLabel(4)).toBe('Nova')
  })
})
