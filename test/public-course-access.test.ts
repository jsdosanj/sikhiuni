import { describe, expect, it, vi } from 'vitest';
import worker from '../worker.js';
import { onRequestGet } from '../functions/api/course-content.js';
const catalogue = { topics: [{ id: 'history' }], courses: [{ id: 'free-one', status: 'published', title: 'Public outline', terms: [{t:'secret term',m:'private definition'}], lessons: [{title:'Lesson one',summary:'Outline',html:'PRIVATE LESSON BODY'}], quiz:[{q:'PRIVATE QUESTION',options:['A'],answer:0}] }] };
const DB=(user:any=null)=>({prepare:()=>({bind(){return this;},first:async()=>user,all:async()=>({results:[]})})});
const media=()=>({get:vi.fn(async(key:string)=>key.startsWith('course-content/')?({json:async()=>structuredClone(catalogue.courses[0])}):({json:async()=>structuredClone(catalogue),body:JSON.stringify(catalogue),writeHttpMetadata(){}}))});
describe('public course outlines and private lessons',()=>{
 it('keeps catalogue metadata public without lesson bodies, quiz or term definitions',async()=>{
  const res=await worker.fetch(new Request('https://sikhiuni.com/assets/data/courses.json'),{MEDIA:media(),DB:DB()});
  const data=await res.json();expect(data.courses[0].lessons).toEqual([{title:'Lesson one',summary:'Outline'}]);
  expect(JSON.stringify(data)).not.toMatch(/PRIVATE|private definition|"answer"/);
 });
 it('does not fetch lesson source for anonymous course-content requests',async()=>{
  const MEDIA=media();const res=await onRequestGet({request:new Request('https://sikhiuni.com/api/course-content?courseId=free-one'),env:{MEDIA,DB:DB()}});
  expect(res.status).toBe(401);expect(MEDIA.get).not.toHaveBeenCalled();expect(res.headers.get('cache-control')).toContain('no-store');
 });
 it('returns published free lessons only after a verified session, without quiz answers',async()=>{
  const res=await onRequestGet({request:new Request('https://sikhiuni.com/api/course-content?courseId=free-one',{headers:{cookie:'su_session=real-session'}}),env:{MEDIA:media(),DB:DB({id:'u',role:'student',mfa_ok:1})}});
  expect(res.status).toBe(200);const body=await res.text();expect(body).toContain('PRIVATE LESSON BODY');expect(body).not.toContain('"answer"');expect(res.headers.get('cache-control')).toContain('no-store');
 });
 it.each(['/media/audio/a.mp3','/technology/lesson/track/example.html','/data/exam/test.json','/data/institute/lessons/test.json'])('requires a session before serving %s',async path=>{
  const ASSETS={fetch:vi.fn(async()=>new Response('PRIVATE CONTENT'))};const MEDIA=media();
  const res=await worker.fetch(new Request('https://sikhiuni.com'+path),{ASSETS,MEDIA,DB:DB()});
  expect([302,401]).toContain(res.status);expect(ASSETS.fetch).not.toHaveBeenCalled();expect(MEDIA.get).not.toHaveBeenCalled();
 });
});

it('requires enrolled MFA completion before delivering free course lessons',async()=>{
 const MEDIA=media();const res=await onRequestGet({request:new Request('https://sikhiuni.com/api/course-content?courseId=free-one',{headers:{cookie:'su_session=pending'}}),env:{MEDIA,DB:DB({id:'u',mfa_ok:0})}});
 expect(res.status).toBe(403);expect(MEDIA.get).not.toHaveBeenCalled();
});

it('checks MFA enrolment for legacy sessions without an mfa_ok value',async()=>{
 const DB={prepare:(sql:string)=>({bind(){return this;},first:async()=>sql.includes('user_mfa')?{enabled_at:123}:{id:'legacy'}})};
 const MEDIA=media();const res=await onRequestGet({request:new Request('https://sikhiuni.com/api/course-content?courseId=free-one',{headers:{cookie:'su_session=legacy'}}),env:{MEDIA,DB}});
 expect(res.status).toBe(403);expect(MEDIA.get).not.toHaveBeenCalled();
});

it('returns no-store 503 when private R2 split objects have not been uploaded',async()=>{
 const MEDIA={get:vi.fn(async()=>null)};const res=await onRequestGet({request:new Request('https://sikhiuni.com/api/course-content?courseId=free-one',{headers:{cookie:'su_session=real-session'}}),env:{MEDIA,DB:DB({id:'u',role:'student',mfa_ok:1})}});
 expect(res.status).toBe(503);expect(res.headers.get('cache-control')).toContain('no-store');expect(MEDIA.get).not.toHaveBeenCalledWith('courses.json');
});

it('serves authenticated lesson HTML privately without changing public course outline routes',async()=>{
 const ASSETS={fetch:vi.fn(async()=>new Response('lesson page',{headers:{'content-type':'text/html'}}))};
 const res=await worker.fetch(new Request('https://sikhiuni.com/technology/lesson/track/one',{headers:{cookie:'su_session=real-session'}}),{ASSETS,DB:DB({id:'u',mfa_ok:1})});
 expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');expect(ASSETS.fetch).toHaveBeenCalledTimes(1);
});
