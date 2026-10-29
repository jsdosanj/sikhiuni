import { publicCourseCatalogue } from './_course-access.js';
const stores=new WeakMap();
const TTL=300000;
function state(bucket){if(!stores.has(bucket))stores.set(bucket,{courses:new Map(),pending:new Map()});return stores.get(bucket);}
async function read(object){return object.json ? object.json() : JSON.parse(await new Response(object.body).text());}
export async function courseOutline(bucket){
 const s=state(bucket);
 if(s.outline && s.outline.until>Date.now())return s.outline.data;
 if(!s.pending.has('outline'))s.pending.set('outline',(async()=>{
  if(s.outline?.etag && bucket.head){const meta=await bucket.head('courses-outline.json');if(meta?.etag===s.outline.etag){s.outline.until=Date.now()+TTL;return s.outline.data;}}
  const object=await bucket.get('courses-outline.json');
  if(!object)throw Error('Course outline objects must be uploaded before this release.');
  const data=publicCourseCatalogue(await read(object));
  s.outline={data,etag:object?.etag,until:Date.now()+TTL};return data;
 })().finally(()=>s.pending.delete('outline')));
 return s.pending.get('outline');
}
export async function storedCourse(bucket,id){
 const outline=(await courseOutline(bucket)).courses.find(c=>c.id===id);
 if(!outline || outline.status!=='published')return null;
 if(outline.gated)return outline;
 const s=state(bucket),key='course-content/v1/'+encodeURIComponent(id)+'.json';
 const cached=s.courses.get(key);
 if(cached?.until>Date.now()){s.courses.delete(key);s.courses.set(key,cached);return cached.data;}
 if(!s.pending.has(key))s.pending.set(key,(async()=>{
  if(cached?.etag && bucket.head){const meta=await bucket.head(key);if(meta?.etag===cached.etag){cached.until=Date.now()+TTL;return cached.data;}}
  const object=await bucket.get(key);
  if(!object)throw Error('Course content objects must be uploaded before this release.');
  const data=await read(object);
  if(data && data.id!==id)throw Error('Course identity mismatch');
  s.courses.delete(key);
  // At most eight entries, each <=512 KiB serialized UTF-8 payload. JS object
  // overhead is additional; the full catalogue is never loaded or retained.
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength<=512*1024)s.courses.set(key,{data,etag:object?.etag,until:Date.now()+TTL});
  while(s.courses.size>8)s.courses.delete(s.courses.keys().next().value);
  return data;
 })().finally(()=>s.pending.delete(key)));
 return s.pending.get(key);
}
