import { describe, it } from 'vitest'
import { parseSlja } from '@shared/services/slja'
import { readFileSync } from 'node:fs'

describe('probe .slja real', () => {
  it('parse MISSÃO PARA TODOS', async () => {
    const buf = readFileSync('/tmp/missao.slja')
    try {
      const archive = await parseSlja(new Uint8Array(buf).buffer as ArrayBuffer)
      console.log('OK title:', archive.title)
      console.log('slides:', archive.slides.length)
      console.log('audio:', archive.audio?.name)
      console.log('assets:', archive.assets?.length)
    } catch (e) {
      console.log('PARSE ERROR:', (e as Error).message)
      console.log((e as Error).stack?.split('\n').slice(1, 4).join('\n'))
    }
  })
})
