import { describe, it, expect } from 'vitest'
import { sha256Hex, sha256ToUuid } from './content-hash'

describe('sha256Hex', () => {
  it('hash estável e em hex (64 chars)', async () => {
    const bytes = new TextEncoder().encode('arquivo.slja')
    const h1 = await sha256Hex(bytes)
    const h2 = await sha256Hex(new TextEncoder().encode('arquivo.slja'))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('conteúdo diferente → hash diferente', async () => {
    const a = await sha256Hex(new TextEncoder().encode('a'))
    const b = await sha256Hex(new TextEncoder().encode('b'))
    expect(a).not.toBe(b)
  })
})

describe('sha256ToUuid', () => {
  it('formato uuid 8-4-4-4-12 determinístico', () => {
    const hex = 'a'.repeat(64)
    const u1 = sha256ToUuid(hex)
    const u2 = sha256ToUuid(hex)
    expect(u1).toBe(u2)
    expect(u1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('mesmo hash do app → mesmo uuid (paridade de dedup: import no app e no web não duplicam entre si)', () => {
    // vetor do app: sha256ToUuid('00112233445566778899aabbccddeeff' + '0'.repeat(32))
    expect(sha256ToUuid('00112233445566778899aabbccddeeff')).toBe(
      '00112233-4455-6677-8899-aabbccddeeff',
    )
  })

  it('hex com hífens é normalizado', () => {
    expect(sha256ToUuid('00-11-22-33')).toBe(sha256ToUuid('00112233'))
  })
})
