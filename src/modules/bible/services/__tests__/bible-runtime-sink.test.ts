import {it,expect,vi} from 'vitest'
import {registerBibleRuntimeSink,publishBibleRuntime,publishBibleRuntimeOff} from '../bible-runtime'
it('publica no sink uma vez e propaga desligamento mesmo com outro sink falhando',()=>{
 const send=vi.fn();registerBibleRuntimeSink(()=>{throw new Error('falha isolada')});registerBibleRuntimeSink(send);registerBibleRuntimeSink(send)
 publishBibleRuntime({active:true,projecting:true,text:'Versículo',reference:'Gn 1:1'})
 expect(send).toHaveBeenCalledTimes(1);expect(send).toHaveBeenLastCalledWith(expect.objectContaining({text:'Versículo',projecting:true}))
 publishBibleRuntimeOff();expect(send).toHaveBeenLastCalledWith(expect.objectContaining({active:false,projecting:false}))
})
