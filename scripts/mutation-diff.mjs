#!/usr/bin/env node
// Mede somente os arquivos alterados da PR; o CI mantém a fase de aviso opcional.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { matchesGlob, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function selectMutatedFiles(files, patterns) {
  const includes = patterns.filter(pattern => !pattern.startsWith('!'))
  const excludes = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  return files.filter(file => file.startsWith('src/') && file.endsWith('.ts') && !file.endsWith('.test.ts')
    && includes.some(pattern => matchesGlob(file, pattern))
    && !excludes.some(pattern => matchesGlob(file, pattern)))
}

export function mutationScore(report) {
  if (!report.files || typeof report.files !== 'object') throw new Error('Relatório sem arquivos')
  const counts = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 }
  for (const file of Object.values(report.files)) {
    if (!Array.isArray(file.mutants)) throw new Error('Relatório sem lista de mutantes')
    for (const mutant of file.mutants) {
      if (!(mutant.status in counts)) throw new Error(`Status desconhecido: ${mutant.status}`)
      counts[mutant.status]++
    }
  }
  // Erros de compilação/runtime e mutantes ignorados não são testes que detectaram bugs.
  const total = counts.Killed + counts.Timeout + counts.Survived + counts.NoCoverage
  return { counts, total, score: total ? (counts.Killed + counts.Timeout) / total * 100 : null }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} falhou (${result.status ?? result.signal}): ${result.stderr ?? ''}`)
  return result.stdout
}

export function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--base' || !args[1] || args[1].startsWith('-'))) {
    throw new Error('Uso: mutation-diff.mjs [--base ref]')
  }
  const base = args[1] ?? 'origin/staging'
  const diff = run('git', ['diff', '--name-only', '--diff-filter=ACM', '-z', `${base}...HEAD`, '--']).split('\0').filter(Boolean)
  const config = JSON.parse(readFileSync('stryker.diff.config.json', 'utf8'))
  const files = selectMutatedFiles(diff, config.mutate)
  if (!files.length) {
    console.log('::notice::mutation-score: nenhum arquivo do escopo no diff — skip')
    return 0
  }
  console.log(`::notice::mutation-score: analisando ${files.length} arquivo(s): ${files.join(', ')}`)
  const reportPath = 'reports/mutation/mutation-diff.json'
  const configPath = resolve(`.mutation-diff-${process.pid}.json`)
  // Uma lista em JSON evita shell injection e a ambiguidade de múltiplos --mutate.
  const literalGlobs = files.map(file => file.replace(/[?*\[\]{}()!+@]/g, '\\$&'))
  writeFileSync(configPath, JSON.stringify({ ...config, mutate: literalGlobs,
    thresholds: { ...config.thresholds, break: 0 }, reporters: ['json', 'clear-text'],
    jsonReporter: { fileName: reportPath } }))
  rmSync(reportPath, { force: true })
  try {
    run('npx', ['--no-install', 'stryker', 'run', configPath], { stdio: 'inherit' })
    if (!existsSync(reportPath)) throw new Error('Stryker não gerou relatório novo')
    const { counts, total, score } = mutationScore(JSON.parse(readFileSync(reportPath, 'utf8')))
    if (!total) throw new Error('Nenhum mutante válido gerado nos arquivos selecionados')
    console.log(`mutation score (diff): ${score.toFixed(2)}% — ${JSON.stringify(counts)}`)
    if (score < 50) { console.log('::error::mutation score do diff <50%'); return 1 }
    if (score < 80) console.log('::warning::mutation score do diff <80%')
    else console.log('::notice::mutation score do diff >=80%')
    return 0
  } finally {
    rmSync(configPath, { force: true })
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = main() }
  catch (error) { console.error(`::error::mutation-score: ${error.message}`); process.exitCode = 1 }
}
