import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mutationScore, selectMutatedFiles } from '../mutation-diff.mjs'

test('respeita glob simples, recursivo, exclusões e testes', () => {
  assert.deepEqual(selectMutatedFiles([
    'src/shared/services/a.ts', 'src/shared/services/nested/a.ts',
    'src/modules/clock/composables/a.ts', 'src/modules/clock/a.test.ts',
    'src/modules/clock/excluded.ts', 'src/modules/media/a.ts',
  ], ['src/shared/services/*.ts', 'src/modules/clock/**/*.ts', '!src/modules/clock/excluded.ts']),
  ['src/shared/services/a.ts', 'src/modules/clock/composables/a.ts'])
})

test('mede bugs detectados sem contar mutantes inválidos como mortos', () => {
  const report = { files: { a: { mutants: ['Killed','Timeout','Survived','NoCoverage','CompileError','RuntimeError','Ignored'].map(status => ({status})) } } }
  assert.equal(mutationScore(report).score, 50)
  assert.equal(mutationScore(report).total, 4)
})

test('um relatório vazio ou inválido não simula score de sucesso', () => {
  assert.equal(mutationScore({files:{}}).score, null)
  assert.throws(() => mutationScore({}), /sem arquivos/)
  assert.throws(() => mutationScore({files:{a:{mutants:[{status:'Unknown'}]}}}), /desconhecido/)
})

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('executa a lista completa sem shell e rejeita medição baixa ou ausente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-diff-test-'))
  const script = fileURLToPath(new URL('../mutation-diff.mjs', import.meta.url))
  const runGit = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    mkdirSync(join(dir, 'src/shared/services'), { recursive: true })
    mkdirSync(join(dir, 'bin'))
    runGit('init', '-q')
    runGit('config', 'user.name', 'Test')
    runGit('config', 'user.email', 'test@example.invalid')
    writeFileSync(join(dir, 'baseline'), 'base')
    runGit('add', '.')
    runGit('commit', '-qm', 'base')
    runGit('branch', 'baseline')
    writeFileSync(join(dir, 'src/shared/services/first.ts'), 'export const first = 1')
    writeFileSync(join(dir, 'src/shared/services/file with spaces.ts'), 'export const second = 2')
    writeFileSync(join(dir, 'stryker.diff.config.json'), JSON.stringify({ mutate: ['src/shared/services/*.ts'], thresholds: { high: 95, low: 80, break: 50 } }))
    runGit('add', '.')
    runGit('commit', '-qm', 'change')
    writeFileSync(join(dir, 'bin/npx'), `#!/usr/bin/env node
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv.at(-1), 'utf8'));
fs.writeFileSync('selected.json', JSON.stringify(config.mutate));
fs.mkdirSync('reports/mutation', {recursive:true});
if (process.env.OMIT_REPORT !== 'yes') fs.writeFileSync(config.jsonReporter.fileName, JSON.stringify({files:{a:{mutants:[{status:process.env.MUTANT_STATUS || 'Killed'}]}}}));
`, { mode: 0o755 })
    const run = extra => spawnSync(process.execPath, [script, '--base', 'baseline'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ...extra } })
    assert.equal(run({}).status, 0)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'selected.json'))), ['src/shared/services/file with spaces.ts', 'src/shared/services/first.ts'])
    assert.equal(run({ MUTANT_STATUS: 'Survived' }).status, 1)
    assert.equal(run({ OMIT_REPORT: 'yes' }).status, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
