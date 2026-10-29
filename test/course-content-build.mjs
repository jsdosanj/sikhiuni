// Post-build guard: public outline pages and catalogue copies cannot contain lesson payloads.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../web/dist/',import.meta.url);
const catalogue=JSON.parse(readFileSync(new URL('assets/data/courses.json',root),'utf8'));
for(const course of catalogue.courses){
 assert.ok(!course.quiz&&!course.terms&&!course.sourceText&&!course.granthRef,`private fields in public catalogue ${course.id}`);
 for(const lesson of course.lessons||[])assert.ok(!('html'in lesson),`lesson body in public catalogue ${course.id}`);
 if(course.status!=='published')continue;
 const html=readFileSync(new URL(`course/${course.id}.html`,root),'utf8');
 assert.ok(html.includes('id="gated-teaser"')||html.includes('id="free-course-access"'),`missing sign-in gateway ${course.id}`);
 assert.ok(!/set:html=|"html":/.test(html),`raw lesson payload in ${course.id}`);
}
const source=JSON.parse(readFileSync(new URL('../site/assets/data/courses.json',import.meta.url),'utf8'));
const sample=source.courses.filter(c=>c.status==='published'&&!c.gated).flatMap(c=>(c.lessons||[]).map(l=>l.html)).filter(Boolean).slice(0,100);
for(const name of readdirSync(new URL('_astro/',root)).filter(n=>n.endsWith('.js'))){const js=readFileSync(new URL('_astro/'+name,root),'utf8');for(const body of sample)assert.ok(!js.includes(body.slice(0,200)),`lesson payload bundled in ${name}`);}
console.log(`course-content-build: ${catalogue.courses.length} public outlines; no lesson bodies, definitions or quiz payloads; 100 lesson source samples absent from client JS.`);
