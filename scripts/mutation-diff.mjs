#!/usr/bin/env node
// mutation-diff.mjs — roda Stryker só nos arquivos do diff do PR (base staging).
// <80% = warning (exit 0 + ::warning::), <50% = fail (exit 1).
// Uso: node scripts/mutation-diff.mjs [--base origin/staging]
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'origin/staging'

// Arquivos TS alterados no diff que caem nos globos `mutate` do stryker.config.json
const diff = execSync(`git diff --name-only --diff-filter=ACM ${BASE}...HEAD`, { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f.startsWith('src/'))

if (diff.length === 0) {
  console.log('::notice::mutation-score: nenhum arquivo mutável no diff — skip')
  process.exit(0)
}

const config = JSON.parse(readFileSync('stryker.config.json', 'utf8'))
const globbers = config.mutate.map((g) => g.replace(/\*/g, ''))
const mutated = diff.filter((f) => globbers.some((g) => f.includes(g)))

if (mutated.length === 0) {
  console.log('::notice::mutation-score: diff não toca arquivos do escopo `mutate` — skip')
  process.exit(0)
}

console.log(`::notice::mutation-score: rodando Stryker em ${mutated.length} arquivo(s):`)
mutated.forEach((f) => console.log(`  - ${f}`))

// --mutate override: roda Stryker SÓ nesses arquivos (não full tree).
// Baseline incremental existente acelera; sem ele, roda cold só no diff (aceitável em CI).
const args = [
  'npx stryker run',
  ...mutated.flatMap((f) => ['--mutate', f]),
  '--reporters', 'json,clear-text',
  '--jsonReporter.fileName', 'reports/mutation/mutation-diff.json',
]
execSync(args.join(' '), { stdio: 'inherit' })

const result = JSON.parse(readFileSync('reports/mutation/mutation-diff.json', 'utf8'))
let killed = 0, survived = 0, timeout = 0, noCover = 0, compileError = 0
for (const file of Object.values(result.files)) {
  for (const m of file.mutants) {
    if (m.status === 'Killed') killed++
    else if (m.status === 'Survived') survived++
    else if (m.status === 'Timeout') timeout++
    else if (m.status === 'NoCoverage') noCover++
    else if (m.status === 'CompileError') compileError++
  }
}
const total = killed + survived + timeout + noCover + compileError
if (total === 0) {
  console.log('::warning::mutation-score: nenhum mutante gerado no diff')
  process.exit(0)
}
const score = ((killed + timeout + compileError) / total) * 100
console.log(`mutation score (diff): ${score.toFixed(2)}%  [killed=${killed} survived=${survived} timeout=${timeout} noCover=${noCover} compileError=${compileError}]`)

if (score < 50) {
  console.log(`::error::mutation score do diff ${score.toFixed(2)}% < 50% — FAIL (gate bloqueante)`)
  process.exit(1)
}
if (score < 80) {
  console.log(`::warning::mutation score do diff ${score.toFixed(2)}% < 80% — WARNING (não bloqueante)`)
} else {
  console.log(`::notice::mutation score do diff ${score.toFixed(2)}% >= 80% — OK`)
}
process.exit(0)
