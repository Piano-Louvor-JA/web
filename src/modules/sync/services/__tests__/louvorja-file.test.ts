import { expect, it, vi } from 'vitest'
import { importLouvorjaFile } from '../louvorja-file'

it('resolve o cancelamento do seletor de arquivo sem bloquear novas importações', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
    this.dispatchEvent(new Event('cancel'))
  })
  try { await expect(importLouvorjaFile()).resolves.toBeNull() } finally { click.mockRestore() }
})
