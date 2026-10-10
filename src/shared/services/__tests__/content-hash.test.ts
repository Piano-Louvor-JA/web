import {describe,it,expect} from 'vitest'
import {sha256Hex,sha256ToUuid} from '../content-hash'
describe('identidade SHA-256 de arquivos',()=>{
 it('corresponde ao vetor SHA-256 conhecido de abc',async()=>{
  const hash=await sha256Hex(new TextEncoder().encode('abc'))
  expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  expect(sha256ToUuid(hash)).toBe('ba7816bf-8f01-cfea-4141-40de5dae2223')
 })
 it('mantém zeros e não usa concatenação ambígua',async()=>{
  expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  expect(sha256ToUuid('0000000000000000000000000000000011111111111111111111111111111111')).toBe('00000000-0000-0000-0000-000000000000')
 })
})
