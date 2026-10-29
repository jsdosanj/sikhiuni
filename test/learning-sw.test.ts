import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function runtime(){const events:any={},keys=vi.fn(async()=>['su-web-v27-old','su-packs-v1']),del=vi.fn(async()=>true),fetch=vi.fn(async()=>new Response('network'));const context:any={URL,Request,Response,location:{origin:'https://sikhiuni.com'},fetch,caches:{keys,delete:del},self:{location:{hostname:'sikhiuni.com'},clients:{claim:async()=>{}},addEventListener:(name:string,fn:any)=>events[name]=fn}};runInNewContext(readFileSync('web/public/sw.js','utf8'),context);return {events,del,fetch};}
describe('lesson service worker privacy',()=>{
 it('purges legacy offline lesson packs during activation',async()=>{const r=runtime();let p;r.events.activate({waitUntil:(promise:any)=>p=promise});await p;expect(r.del).toHaveBeenCalledWith('su-packs-v1');});
 it.each(['/api/course-content?courseId=one','/media/audio/a.mp3','/data/institute/lessons/a.json','/assets/gurbani/sggs/1.json','/technology/lesson/a/b'])('always uses no-store network for %s',async path=>{const r=runtime();let p;r.events.fetch({request:new Request('https://sikhiuni.com'+path),respondWith:(promise:any)=>p=promise});await p;expect(r.fetch.mock.calls[0][0].cache).toBe('no-store');});
});
