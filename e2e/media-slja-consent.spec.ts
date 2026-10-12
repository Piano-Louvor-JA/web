import {expect,test} from '@playwright/test'
import {zipSync,strToU8} from 'fflate'
test('recusar upload no editor salva localmente sem criar coletânea ou música',async({page})=>{
 const writes:string[]=[]
 await page.route('**/v1/custom/**',async route=>{
  if(route.request().method()==='POST') writes.push(route.request().url())
  await route.fulfill({json:[]})
 })
 await page.goto('/media/editor')
 const eula=page.locator('.eula-dialog')
 if(await eula.isVisible().catch(()=>false)){
  await page.locator('.eula-dialog__text-area').evaluate(el=>el.scrollTo(0,el.scrollHeight))
  await page.locator('.eula-dialog button:not([disabled])').last().click()
  await expect(eula).toBeHidden()
 }
 const data=zipSync({'slides.lja':strToU8('[Geral]\r\nslides=1\r\nversao=1.0\r\n[Slide:1]\r\ntipo=LETRA\r\nletra=Teste local\r\ntempo_hms=00:00:00')})
 await page.locator('input[accept=".slja"]').setInputFiles({name:'Consentimento.slja',mimeType:'application/octet-stream',buffer:Buffer.from(data)})
 await page.getByRole('button',{name:'Só neste dispositivo',exact:true}).click()
 await expect(page.getByText(/salvo neste dispositivo; disponível pela liturgia/)).toBeVisible()
 expect(writes).toEqual([])
 await page.reload()
 const count=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{
  const request=indexedDB.open('liturgy-slja-local');request.onerror=()=>reject(request.error)
  request.onsuccess=()=>{const db=request.result;const count=db.transaction('musics','readonly').objectStore('musics').count();count.onsuccess=()=>{resolve(count.result);db.close()}}
 }))
 expect(count).toBe(1)
})
