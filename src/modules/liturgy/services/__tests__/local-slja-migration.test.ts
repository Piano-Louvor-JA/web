import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ session:vi.fn(), collection:vi.fn(), music:vi.fn(), lyric:vi.fn(), upload:vi.fn(), update:vi.fn(), asset:vi.fn() }))
vi.mock('@modules/auth/services/auth-client',()=>({getAuthSession:m.session}))
vi.mock('@modules/media/services/custom-catalog',()=>({listCustomCollections:async()=>[{id:1,name:'Importações .slja'}],createCustomCollection:m.collection,createCustomMusic:m.music,createCustomLyric:m.lyric,uploadCustomFile:m.upload,updateCustomMusic:m.update}))
vi.mock('../local-slja-store',()=>({listLocalMusics:async()=>[],getLocalAsset:m.asset}))
vi.mock('@plugins/i18n',()=>({default:{global:{t:(s:string)=>s}}}))
vi.mock('@shared/composables/useAppConfirm',()=>({appConfirm:async()=>false}))
import { runSljaMigration } from '../local-slja-migration'
const item = {id:900000001,name:'Hino',createdAt:1,audioAssetId:2,slideCount:1,slides:[{lyric:'Letra',timeMs:5000,imageAssetId:3}]}
beforeEach(()=>{
 vi.resetAllMocks();localStorage.clear();m.session.mockReturnValue({token:'a',user:{id_user:7}})
 m.music.mockResolvedValue({id:11});m.asset.mockResolvedValue({bytes:new Uint8Array([1,2]).buffer,mime:'x'});m.upload.mockResolvedValue({idFile:20});m.update.mockResolvedValue(true);m.lyric.mockResolvedValue({id:30})
})
describe('migração consentida',()=>{
 it('recusa não faz escrita nem consulta de mídia',async()=>{expect(await runSljaMigration([item],{confirm:false})).toEqual({uploaded:0,failed:0});expect(m.music).not.toHaveBeenCalled();expect(m.asset).not.toHaveBeenCalled()})
 it('preserva áudio e imagem e não repete upload confirmado',async()=>{expect(await runSljaMigration([item],{confirm:true})).toEqual({uploaded:1,failed:0});expect(m.upload).toHaveBeenCalledTimes(2);expect(m.lyric).toHaveBeenCalledWith(11,expect.objectContaining({id_file_image:20,time:'00:00:05'}));await runSljaMigration([item],{confirm:true});expect(m.music).toHaveBeenCalledTimes(1)})
 it('falha de letra nunca marca sucesso',async()=>{m.lyric.mockResolvedValue(null);expect(await runSljaMigration([item],{confirm:true})).toEqual({uploaded:0,failed:1});expect(localStorage.length).toBe(0)})
 it('registro existente sem confirmação de completude não é sucesso',async()=>{m.music.mockResolvedValue({id:11,existed:true});expect(await runSljaMigration([item],{confirm:true})).toEqual({uploaded:0,failed:1});expect(m.upload).not.toHaveBeenCalled()})
 it('troca de sessão interrompe novas escritas',async()=>{m.upload.mockImplementation(async()=>{m.session.mockReturnValue({token:'b',user:{id_user:8}});return {idFile:20}});expect(await runSljaMigration([item],{confirm:true})).toEqual({uploaded:0,failed:1});expect(m.update).not.toHaveBeenCalled();expect(m.lyric).not.toHaveBeenCalled()})
})
