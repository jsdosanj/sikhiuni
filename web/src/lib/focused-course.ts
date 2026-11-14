import { expandYoutubeEmbeds } from './lesson-embeds';
export function selectedLesson(hash: string, count: number, resume = 0): number {
  if (!count) return -1;
  const match = /^#lesson-(\d+)$/.exec(hash);
  const index = match ? Number(match[1]) : -1;
  return index >= 0 && index < count ? index : Math.min(count - 1, Math.max(0, Number.isInteger(resume) ? resume : 0));
}
export const lessonBookmarkKey = (id: string, user = 'device') => 'su_v1_lesson_bookmarks_' + user + '_' + id;
let courseArticles: HTMLElement[] = [];
export function courseControls(selector: string): HTMLElement[] {
  return courseArticles.flatMap(article => Array.from(article.querySelectorAll<HTMLElement>(selector)));
}
export function mountFocusedCourse(id: string, lessons: Array<{title:string; html?:string; locked?:boolean; lock_reason?:string}>, userId: string) {
  const section = document.getElementById('focused-lessons');
  if (!section || !lessons.length) return;
  const key = 'su_v1_last_lesson_' + userId + '_' + id;
  const read = (key:string, fallback:any) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const write = (key:string, value:any) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const completed = read('su_v1_done_' + id, {});
  const firstIncomplete = lessons.findIndex((_, index) => !completed[index]);
  let active = selectedLesson(location.hash, lessons.length, read(key, Math.max(0,firstIncomplete)));
  let bookmarks = read(lessonBookmarkKey(id, userId), []); if (!Array.isArray(bookmarks)) bookmarks = [];
  courseArticles = Array.from(section.querySelectorAll<HTMLElement>('article[id^="lesson-"]'));
  const articleHost = courseArticles[0]?.parentElement;
  if (!articleHost) return;
  courseArticles.forEach(article => article.remove());
  section.hidden = false;
  document.getElementById('course-tools')?.removeAttribute('hidden');
  document.querySelector('[data-learner-progress]')?.removeAttribute('hidden');
  document.getElementById('enroll-btn')?.removeAttribute('hidden');
  const begin = document.getElementById('course-begin'); if (begin) begin.setAttribute('href', '#lesson-' + active);
  const nav = document.createElement('nav'); nav.className = 'focused-navigation'; nav.setAttribute('aria-label','Lesson navigation');
  nav.innerHTML = '<a class="btn" data-previous>← Previous</a><span role="status" aria-live="polite"></span><a class="btn" data-next>Next →</a><button type="button" class="btn" data-bookmark>Bookmark</button><small data-bookmark-status role="status">Bookmarks saved on this device</small>';
  section.prepend(nav);
  const outline = document.getElementById('lesson-rail');
  if (outline && matchMedia('(max-width:1023px)').matches) {
    const fold = document.createElement('details'); const summary = document.createElement('summary'); summary.className = 'btn mb-3'; summary.textContent = 'Course outline'; fold.append(summary); outline.before(fold); fold.append(outline);
  }
  let checkingSession = false;
  window.addEventListener('focus', async () => {
    if (checkingSession) return; checkingSession = true;
    try { const response = await fetch('/api/me', {credentials:'same-origin',cache:'no-store'}); if (response.ok) { const data = await response.json(); if (!data.user || data.user.id !== userId) location.reload(); } }
    catch { /* Preserve the current lesson through temporary connection failures. */ }
    finally { checkingSession = false; }
  });
  const previous = nav.querySelector<HTMLAnchorElement>('[data-previous]')!;
  const next = nav.querySelector<HTMLAnchorElement>('[data-next]')!;
  const bookmark = nav.querySelector<HTMLButtonElement>('[data-bookmark]')!;
  let rendered = -1;
  const paint = () => {
    courseArticles.forEach((article) => {
      const index = Number(article.id.slice(7)); article.hidden = index !== active;
      if (index === active) { if (article.parentElement !== articleHost) articleHost.append(article); } else article.remove();
      const body = article.querySelector<HTMLElement>('.lesson-prose');
      if (body && rendered !== active) {
        body.replaceChildren();
        if (index === active) {
          const lesson = lessons[index];
          if (lesson.locked) { const notice = document.createElement('p'); notice.textContent = 'This lesson is locked by your teacher. ' + (lesson.lock_reason || ''); body.append(notice); }
          else body.innerHTML = expandYoutubeEmbeds(lesson.html || '');
        }
      }
      article.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>('[data-done], [data-note], [data-listen]').forEach(control => control.disabled = !!lessons[index]?.locked);
    });
    rendered = active;
    previous.hidden = active === 0; previous.href = '#lesson-' + Math.max(0, active - 1);
    next.hidden = active === lessons.length - 1; next.href = '#lesson-' + Math.min(lessons.length - 1, active + 1);
    nav.querySelector('[role="status"]')!.textContent = 'Lesson ' + (active + 1) + ' of ' + lessons.length;
    const finalLink = nav.querySelector('[data-final]'); finalLink?.remove();
    if (active === lessons.length - 1) { const final = document.createElement('a'); final.className = 'btn'; final.dataset.final = ''; final.href = document.getElementById('test') ? '#test' : '/catalog'; final.textContent = document.getElementById('test') ? 'Course test →' : 'Back to catalogue'; final.addEventListener('click', () => { const tools = document.getElementById('course-tools') as HTMLDetailsElement; if (tools) tools.open = true; }); nav.append(final); }
    bookmark.setAttribute('aria-pressed', String(bookmarks.includes(active)));
    bookmark.textContent = bookmarks.includes(active) ? 'Bookmarked' : 'Bookmark';
    document.querySelectorAll<HTMLElement>('[data-rail-row]').forEach(row => { const index = Number(row.dataset.railRow); row.setAttribute('aria-current', index === active ? 'step' : 'false'); row.toggleAttribute('data-bookmarked', bookmarks.includes(index)); });
    write(key, active);
  };
  bookmark.addEventListener('click', () => {
    const updated = bookmarks.includes(active) ? bookmarks.filter((n:number) => n !== active) : [...bookmarks,active];
    const status = nav.querySelector('[data-bookmark-status]')!;
    if (!write(lessonBookmarkKey(id,userId),updated)) { status.textContent = 'Bookmark could not be saved. Device storage is unavailable.'; return; }
    bookmarks = updated; status.textContent = 'Bookmarks saved on this device'; paint();
  });
  window.addEventListener('hashchange', () => { const next = selectedLesson(location.hash, lessons.length, active); if (next === active) return; window.speechSynthesis?.cancel(); active = next; paint(); const heading = document.querySelector<HTMLElement>('#lesson-' + active + ' h3'); heading?.setAttribute('tabindex','-1'); heading?.focus({preventScroll:true}); section.scrollIntoView({block:'start', behavior:'auto'}); });
  paint();
}
