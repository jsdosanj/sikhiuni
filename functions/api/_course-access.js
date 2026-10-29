// Shared server policy: public catalogue/outline metadata, private lesson bodies.
const COURSE_FIELDS = ['id','title','topic','level','professor','source','aiCreated','status','summary','outcomes','references','gated'];
export function publicCourseCatalogue(data) {
 return {
  topics: data.topics || [], paths: data.paths || [],
  courses: (data.courses || []).map(c => ({
   ...Object.fromEntries(COURSE_FIELDS.filter(k=>c[k]!==undefined).map(k=>[k,c[k]])),
   lessons: (c.lessons || []).map(l=>({title:l.title,...(l.summary?{summary:l.summary}:{})})),
   nQuiz: c.nQuiz ?? (c.quiz || []).length,
  })),
 };
}
export const PRIVATE_COURSE_HEADERS = {'cache-control':'private, no-store','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','vary':'Cookie'};
export function protectedLearningPath(pathname) {
 let path;
 try { path=decodeURIComponent(pathname).replace(/\\/g,'/'); } catch { return true; }
 path=new URL(path,'https://sikhiuni.com').pathname.replace(/\.html$/,'').replace(/\/$/,'');
 return /^\/assets\/(?:gurbani|audio)(?:\/|$)/.test(path) || path.startsWith('/media/') || /^\/data\/(?:exam\/|institute\/(?:lessons|exam|dojo)\/)/.test(path)
  || /^\/(?:technology|institute)\/(?:lesson|dojo|capstone|exam|guide)(?:\/|$)/.test(path)
  || /^\/departments\/martial-arts\/workshop(?:\/|$)/.test(path)
  || ['/read','/santhiya','/muharni','/baal-updesh'].includes(path);
}
