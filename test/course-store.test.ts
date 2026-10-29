import { describe,expect,it,vi,afterEach } from 'vitest';
import { courseOutline,storedCourse } from '../functions/api/_course-store.js';
afterEach(()=>vi.useRealTimers());
const outline={courses:Array.from({length:10},(_,i)=>({id:i===0?'one':String(i),status:'published',lessons:[{title:'Outline'}]}))};
describe('bounded private course store',()=>{
 it('uses per-course objects and coalesces simultaneous authenticated loads',async()=>{
  const get=vi.fn(async(key:string)=>({etag:'one',json:async()=>key==='courses-outline.json'?outline:{id:'one',lessons:[{html:'private'}]}}));const bucket={get};
  const [a,b]=await Promise.all([storedCourse(bucket,'one'),storedCourse(bucket,'one')]);expect(a).toEqual(b);expect(get).toHaveBeenCalledTimes(2);expect(get).toHaveBeenCalledWith('course-content/v1/one.json');
 });
 it('bounds selected-course cache to eight entries',async()=>{
  const get=vi.fn(async(key:string)=>({json:async()=>key==='courses-outline.json'?outline:{id:key.split('/').pop()!.replace('.json','')}}));const bucket={get};
  for(let i=1;i<10;i++)await storedCourse(bucket,String(i));await storedCourse(bucket,'1');expect(get).toHaveBeenCalledTimes(11);
 });
 it('caches only sanitized public metadata and refreshes its ETag before rereading',async()=>{
  vi.useFakeTimers();const get=vi.fn(async()=>({etag:'v1',json:async()=>({courses:[{id:'one',nQuiz:2,lessons:[{title:'Outline',html:'private'}]}]})}));const head=vi.fn(async()=>({etag:'v1'}));const bucket={get,head};
  const a=await courseOutline(bucket);expect(JSON.stringify(a)).not.toContain('private');expect(a.courses[0].nQuiz).toBe(2);
  await courseOutline(bucket);expect(get).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(300001);await courseOutline(bucket);expect(head).toHaveBeenCalledTimes(1);expect(get).toHaveBeenCalledTimes(1);
 });
 it('fails closed when split objects are missing, never reading the legacy monolith',async()=>{
  const get=vi.fn(async(key:string)=>key==='courses-outline.json'?{json:async()=>outline}:null);
  await expect(storedCourse({get},'one')).rejects.toThrow('must be uploaded');expect(get).not.toHaveBeenCalledWith('courses.json');
 });
 it('returns unknown course IDs without reading or caching private course objects',async()=>{
  const get=vi.fn(async()=>({json:async()=>outline}));expect(await storedCourse({get},'unknown')).toBeNull();expect(get).toHaveBeenCalledTimes(1);
 });
});
