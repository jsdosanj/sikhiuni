import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { publicCourseCatalogue } from '../../functions/api/_course-access.js';
mkdirSync('public/assets/data',{recursive:true});
const source=JSON.parse(readFileSync('../site/assets/data/courses.json','utf8'));
writeFileSync('public/assets/data/courses.json',JSON.stringify(publicCourseCatalogue(source)));
copyFileSync('../site/assets/data/professors.json','public/assets/data/professors.json');
console.log('Synced public course outlines; lesson bodies remain server-only.');
