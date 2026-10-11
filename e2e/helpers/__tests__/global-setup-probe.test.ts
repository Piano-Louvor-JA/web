// Teste de integração do globalSetup (P1-1): valida env layers reais do repo.
// NOTA: o setup do vitest pode carregar .env.local para process.env; por isso
// este teste zera as envs de API do processo para exercitar as camadas de arquivo.
import { rmSync, writeFileSync, cpSync } from 'node:fs'
import { expect, test } from 'vitest'
import globalSetup from '../../global-setup'
import { APP_ENV_KEYS_FOR_TEST } from './probe-env-keys'

const API_KEYS = APP_ENV_KEYS_FOR_TEST

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {}
  for (const k of [...API_KEYS, 'VITE_API_FALLBACK_URLS']) snap[k] = process.env[k]
  return snap
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

test('globalSetup ABORTA com .env apontando para produção (P1-1)', () => {
  const snap = snapshotEnv()
  cpSync('.env.local', '/tmp/envlocal-bak-probe')
  rmSync('.env.local')
  writeFileSync('.env', 'VITE_URL_DATABASE=https://api.pianolouvorja.com.br/json_db\n')
  try {
    for (const k of [...API_KEYS, 'VITE_API_FALLBACK_URLS']) delete process.env[k]
    expect(() => globalSetup()).toThrowError(/PRODUÇÃO \(api\.pianolouvorja\.com\.br em \.env/)
  } finally {
    restoreEnv(snap)
    rmSync('.env')
    cpSync('/tmp/envlocal-bak-probe', '.env.local')
    rmSync('/tmp/envlocal-bak-probe')
  }
})

test('globalSetup PASSA com staging em .env.local (sem falso positivo)', () => {
  const snap = snapshotEnv()
  cpSync('.env.local', '/tmp/envlocal-bak-probe2')
  rmSync('.env.local')
  writeFileSync('.env.local', 'VITE_URL_DATABASE=https://api-stg.pianolouvorja.com.br/json_db\n')
  try {
    for (const k of [...API_KEYS, 'VITE_API_FALLBACK_URLS']) delete process.env[k]
    expect(() => globalSetup()).not.toThrow()
  } finally {
    restoreEnv(snap)
    rmSync('.env.local')
    cpSync('/tmp/envlocal-bak-probe2', '.env.local')
    rmSync('/tmp/envlocal-bak-probe2')
  }
})

test('globalSetup ABORTA quando .env.local (camada mais alta de arquivo) aponta para produção', () => {
  const snap = snapshotEnv()
  cpSync('.env.local', '/tmp/envlocal-bak-probe3')
  writeFileSync(
    '.env.local',
    'VITE_PALCO_API_URL=https://api.pianolouvorja.com.br\nVITE_URL_DATABASE=https://api-stg.pianolouvorja.com.br/json_db\n',
  )
  try {
    for (const k of [...API_KEYS, 'VITE_API_FALLBACK_URLS']) delete process.env[k]
    // staging no VITE_URL_DATABASE não salva o VITE_PALCO_API_URL de prod no mesmo arquivo
    expect(() => globalSetup()).toThrowError(/PRODUÇÃO \(api\.pianolouvorja\.com\.br em \.env\.local/)
  } finally {
    restoreEnv(snap)
    cpSync('/tmp/envlocal-bak-probe3', '.env.local')
    rmSync('/tmp/envlocal-bak-probe3')
  }
})
