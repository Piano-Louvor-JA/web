import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import globalSetup from '../../global-setup'
import { APP_ENV_KEYS_FOR_TEST } from './probe-env-keys'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'web-e2e-env-'))
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  for (const key of [...APP_ENV_KEYS_FOR_TEST, 'VITE_API_FALLBACK_URLS']) vi.stubEnv(key, undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })

test('aborta com produção em .env, sem tocar os arquivos do projeto', () => {
  writeFileSync(join(root, '.env'), 'VITE_PALCO_API_URL=https://api.pianolouvorja.com.br\n')
  expect(() => globalSetup()).toThrow(/PRODUÇÃO/)
})
test('permite staging em .env.local', () => {
  writeFileSync(join(root, '.env.local'), 'VITE_PALCO_API_URL=https://api-stg.pianolouvorja.com.br\n')
  expect(() => globalSetup()).not.toThrow()
})
test('aborta com produção no arquivo específico de modo e variável expandida', () => {
  writeFileSync(join(root, '.env.development.local'), 'API_HOST=https://api.pianolouvorja.com.br\nVITE_PALCO_API_URL=${API_HOST}\n')
  expect(() => globalSetup()).toThrow(/PRODUÇÃO/)
})
