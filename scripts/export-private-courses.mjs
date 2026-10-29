/** Local export by default. --upload explicitly writes private R2 objects sequentially. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { publicCourseCatalogue } from '../functions/api/_course-access.js';
const source=JSON.parse(readFileSync('site/assets/data/courses.json','utf8'));
const out='.course-content-export';mkdirSync(out,{recursive:true});
const objects=[];
function emit(key,data){const bytes=JSON.stringify(data),file=`${out}/${objects.length}.json`;writeFileSync(file,bytes);objects.push({key,file,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')});}
emit('courses-outline.json',publicCourseCatalogue(source));
for(const c of source.courses.filter(c=>c.status==='published'&&!c.gated)) {
 const course={...c,quiz:(c.quiz||[]).map(({answer,...question})=>question)};
 emit('course-content/v1/'+encodeURIComponent(c.id)+'.json',course);
}
writeFileSync(`${out}/manifest.json`,JSON.stringify({version:1,objects},null,2)+'\n');
console.log(`Exported ${objects.length} private R2 objects locally (${Math.round(objects.reduce((n,o)=>n+o.bytes,0)/1024/1024)} MiB). No uploads unless --upload is passed.`);
if(process.argv.includes('--upload')) {
 for(const object of objects){
  const result=spawnSync('npx',['wrangler','r2','object','put','sikh-university-media/'+object.key,'--file',object.file,'--content-type','application/json','--remote','--config','wrangler.toml'],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
 }
}
