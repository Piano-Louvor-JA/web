#!/usr/bin/env node
/**
 * Regression Gate — pianolouvorja/web
 * Baseline: suite completa + type-check + build
 * Uso:
 *   npm run test:regression -- --baseline   (salva baseline em .regression-baseline.json)
 *   npm run test:regression -- --compare    (compara execução atual c/ baseline)
 *   npm run test:regression                 (baseline + compare = CI gate)
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const BASELINE_FILE = resolve('.regression-baseline.json')
const isBaseline = process.argv.includes('--baseline')
const isCompare  = process.argv.includes('--compare')

function run(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }) }
  } catch (e) {
    return { ok: false, out: e.stdout?.toString() || '', err: e.stderr?.toString() || e.message }
  }
}

function jsonParseSafe(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

if (isBaseline) {
  console.log('📊 Salvando baseline de regressão...')
  const results = {}

  // 1) Testes unitários (Vitest) — summary JSON
  const t = run('npm run test -- --reporter=json --outputFile=.vitest-results.json 2>&1')
  if (t.ok) {
    const vr = jsonParseSafe(readFileSync('.vitest-results.json', 'utf8'), {})
    results.tests = {
      passed: vr.numPassedTests || 0,
      failed: vr.numFailedTests || 0,
      total: vr.numTotalTests || 0,
      suites: vr.numTotalTestSuites || 0
    }
  } else {
    results.tests = { passed: 0, failed: -1, total: 0, error: t.err?.slice(0,500) }
  }

  // 2) Type-check
  const tc = run('npm run type-check 2>&1')
  results.typeCheck = { ok: tc.ok, err: tc.ok ? '' : tc.err?.slice(0,500) }

  // 3) Build
  const b = run('npm run build-only 2>&1')
  results.build = { ok: b.ok, err: b.ok ? '' : b.err?.slice(0,500) }

  writeFileSync(BASELINE_FILE, JSON.stringify(results, null, 2))
  console.log('✅ Baseline salvo em', BASELINE_FILE)
  console.log('   Tests:', results.tests)
  console.log('   TypeCheck:', results.typeCheck.ok ? 'OK' : 'FAIL')
  console.log('   Build:', results.build.ok ? 'OK' : 'FAIL')
  process.exit(results.tests.failed > 0 || !results.typeCheck.ok || !results.build.ok ? 1 : 0)
}

if (isCompare || (!isBaseline && !isCompare)) {
  if (!existsSync(BASELINE_FILE)) {
    console.error('❌ Baseline não encontrado. Rode com --baseline primeiro.')
    process.exit(1)
  }
  const base = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  console.log('📊 Comparando com baseline...')

  let regressed = false
  const failures = []

  // Testes
  const t = run('npm run test -- --reporter=json --outputFile=.vitest-results.json 2>&1')
  if (t.ok) {
    const vr = jsonParseSafe(readFileSync('.vitest-results.json', 'utf8'), {})
    const cur = { passed: vr.numPassedTests || 0, failed: vr.numFailedTests || 0, total: vr.numTotalTests || 0 }
    if (cur.failed > base.tests.failed || cur.passed < base.tests.passed) {
      regressed = true
      failures.push(`TESTS: baseline passed=${base.tests.passed} failed=${base.tests.failed} → current passed=${cur.passed} failed=${cur.failed}`)
    }
  } else {
    regressed = true
    failures.push('TESTS: execução falhou')
  }

  // Type-check
  const tc = run('npm run type-check 2>&1')
  if (base.typeCheck.ok && !tc.ok) {
    regressed = true
    failures.push('TYPE-CHECK: baseline OK → current FAIL')
  }

  // Build
  const b = run('npm run build-only 2>&1')
  if (base.build.ok && !b.ok) {
    regressed = true
    failures.push('BUILD: baseline OK → current FAIL')
  }

  if (regressed) {
    console.error('❌ REGRESSÃO DETECTADA:')
    failures.forEach(f => console.error('  -', f))
    process.exit(1)
  } else {
    console.log('✅ Sem regressão detectada.')
    process.exit(0)
  }
}
