import { afterEach, describe, expect, it, vi } from 'vitest'

import { appConfirm } from './useAppConfirm'

/**
 * appConfirm monta AppConfirm num host próprio e resolve a Promise
 * com true (confirm) ou false (cancel). Testa via DOM real (jsdom).
 */
describe('appConfirm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('resolve true quando onConfirm dispara', async () => {
    const promise = appConfirm({
      title: 'Título',
      message: 'Mensagem',
      confirmLabel: 'OK',
    })

    // espera mount + tick
    await new Promise((r) => setTimeout(r, 10))
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('OK'),
    )
    expect(btn).toBeDefined()
    btn!.click()
    await new Promise((r) => setTimeout(r, 80))
    await expect(promise).resolves.toBe(true)
  })

  it('resolve false quando onCancel dispara', async () => {
    const promise = appConfirm({
      title: 'Título',
      message: 'Mensagem',
      confirmLabel: 'OK',
      cancelLabel: 'Não',
    })

    await new Promise((r) => setTimeout(r, 10))
    const cancel = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Não'),
    )
    expect(cancel).toBeDefined()
    cancel!.click()
    await new Promise((r) => setTimeout(r, 80))
    await expect(promise).resolves.toBe(false)
  })

  it('usa label padrão "Cancelar" quando cancelLabel ausente', async () => {
    const promise = appConfirm({
      title: 'T',
      message: 'M',
      confirmLabel: 'Sim',
    })
    await new Promise((r) => setTimeout(r, 10))
    const cancel = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Cancelar'),
    )
    expect(cancel).toBeDefined()
    cancel!.click()
    await new Promise((r) => setTimeout(r, 80))
    await expect(promise).resolves.toBe(false)
  })

  it('danger prop aplicada (botão de confirmar com classe de perigo)', async () => {
    const promise = appConfirm({
      title: 'Excluir',
      message: 'Tem certeza?',
      confirmLabel: 'Excluir',
      danger: true,
    })
    await new Promise((r) => setTimeout(r, 10))
    const dangerBtn = [...document.querySelectorAll('button')].find((b) =>
      b.className.includes('danger'),
    )
    expect(dangerBtn).toBeDefined()
    dangerBtn!.click()
    await new Promise((r) => setTimeout(r, 80))
    await expect(promise).resolves.toBe(true)
  })
})
