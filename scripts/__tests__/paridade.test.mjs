import { test } from 'node:test'
import assert from 'node:assert/strict'
import {compareContracts} from '../check-paridade.mjs'
test('permite extensões sem aceitar quebra de contrato',()=>{
 const specs={Selection:['name','id']}
 const base='export interface Selection {name:string;id:number}'
 assert.doesNotThrow(()=>compareContracts(base+'', 'export interface Selection {name:string;id:number;extra?:boolean}',specs))
 assert.throws(()=>compareContracts(base,'export interface Selection {name:string;id:string}',specs))
 assert.throws(()=>compareContracts(base,'export interface Selection {name:string}',specs))
})
