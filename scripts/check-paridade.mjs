#!/usr/bin/env node
/** Contratos compartilhados: adaptações de plataforma são permitidas. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'

const contracts = [
 ['src/modules/bible/types/bible.ts', { BibleBook: ['id','name','abbreviation','chapters','bookNumber','languageId'], BibleVersion: ['id','abbreviation','name','languageId'], BibleSelection: ['versionId','bookId','versionAbbreviation','bookName','chapter','verses','scripturalReference','text'] }],
 ['src/modules/settings/types/stage-settings.ts', { StageSettings: ['backgroundColor','textColor','fontSize','fontWeight','margin','textShadow','textAlign','textVerticalAlign','footerRefColor','footerRefWeight','bibleFontSize','bibleFontWeight','bibleTextColor'] }],
]
const printer = ts.createPrinter({ removeComments: true })
function fields(source, name) {
 const ast = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true)
 const declaration = ast.statements.find(n => n.name?.text === name)
 assert.ok(declaration, `Contrato ausente: ${name}`)
 const members = declaration.members ?? declaration.type?.members
 assert.ok(members, `Contrato não estrutural: ${name}`)
 return new Map(members.map(m => [m.name.getText(ast), printer.printNode(ts.EmitHint.Unspecified, m.type, ast).replace(/\s/g,'')]))
}
export function compareContracts(local, remote, specs) {
 for (const [name, keys] of Object.entries(specs)) {
  const a = fields(local,name), b = fields(remote,name)
  for (const key of keys) {
   assert.ok(a.has(key) && b.has(key), `${name}.${key}: campo ausente`)
   // A seleção vazia no web aceita null; capítulo válido mantém number.
   const normalize = value => name === 'BibleSelection' && key === 'chapter' ? value.replace(/\|null/g,'') : value
   assert.equal(normalize(a.get(key)),normalize(b.get(key)), `${name}.${key}: tipo incompatível`)
  }
 }
}
function peer(path) {
 return execFileSync('gh',['api',`repos/Piano-Louvor-JA/app/contents/${path}?ref=staging`,'-H','Accept: application/vnd.github.raw+json'], { encoding:'utf8' })
}
async function formatModule(source) {
 const js = ts.transpile(source, { module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022 })
 return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
async function main() {
 for (const [path,specs] of contracts) {
  compareContracts(readFileSync(path,'utf8'),peer(path),specs)
  console.log(`✓ ${path}: contratos comuns compatíveis`)
 }
 const path = 'src/modules/bible/services/scripture-format.ts'
 const a = await formatModule(readFileSync(path,'utf8')), b = await formatModule(peer(path))
 for (const verses of [[],[1],[1,2,3,5],[5,3,1]]) assert.equal(a.formatVerseIntervals(verses),b.formatVerseIntervals(verses))
 for (const chapter of [1,12]) assert.equal(a.formatScripturalReference({ bookName:'Salmos', chapter, verses:[1,2], versionAbbreviation:'ARA' }),b.formatScripturalReference({ bookName:'Salmos', chapter, verses:[1,2], versionAbbreviation:'ARA' }))
 const runtime = 'src/modules/bible/services/bible-runtime.ts'
 for (const name of ['BIBLE_RUNTIME_CHANNEL','BIBLE_RUNTIME_STORAGE_KEY']) {
  const value = text => text.match(new RegExp(`${name}\\s*=\\s*['"]([^'"]+)['"]`))?.[1]
  assert.ok(value(readFileSync(runtime,'utf8')))
  assert.equal(value(readFileSync(runtime,'utf8')),value(peer(runtime)))
 }
 console.log('✓ formato bíblico e canais de projeção compatíveis')
}
if (process.argv[1]?.endsWith('check-paridade.mjs')) await main()
