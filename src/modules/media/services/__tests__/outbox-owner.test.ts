import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { saveSession } from '../../../auth/services/auth-client'
import { clearOutbox, enqueue, flushOutbox, listPending } from '../outbox'
beforeEach(async () => { localStorage.clear(); await clearOutbox(); vi.unstubAllGlobals() })
const session = (email: string) => saveSession({token:email,user:{id_user:1,email,displayName:email}})
it('retains account A operations when B logs in, and sends only after A reconnects', async () => {
 await enqueue({entity:'collection',client_uuid:'collection-A',action:'upsert',payload:{name:'A',updated_at:1},updated_at:1,owner_email:'A'})
 session('B'); const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({applied:{created:1,updated:0},conflicts:[]})});vi.stubGlobal('fetch',fetcher)
 await flushOutbox('/v1/custom');expect(fetcher).not.toHaveBeenCalled();expect(await listPending()).toHaveLength(1)
 session('A');await flushOutbox('/v1/custom');expect(fetcher).toHaveBeenCalledOnce();expect(await listPending()).toHaveLength(0)
})
it('retains the queue on server rejection and if account changes during a request', async () => {
 await enqueue({entity:'collection',client_uuid:'collection-A',action:'upsert',payload:{name:'A',updated_at:1},updated_at:1,owner_email:'A'});session('A')
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401}));expect((await flushOutbox('/v1/custom')).ok).toBe(false);expect(await listPending()).toHaveLength(1)
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>{session('B');return {ok:true,status:200,json:async()=>({applied:{created:1,updated:0},conflicts:[]})}}));expect((await flushOutbox('/v1/custom')).ok).toBe(false);expect(await listPending()).toHaveLength(1)
})
