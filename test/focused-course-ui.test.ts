import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { mountFocusedCourse, courseControls, lessonBookmarkKey } from '../web/src/lib/focused-course';
let browser: Window;
const lessons = [
 {title:'First', html:'<p>First body</p><iframe title="Lesson video" src="about:blank"></iframe>'},
 {title:'Second', html:'<p>Second body</p>'},
 {title:'Locked', html:'<p>SECRET LOCKED BODY</p>', locked:true, lock_reason:'Available next week'},
];
beforeEach(() => {
 browser = new Window({url:'https://sikhiuni.com/course/example'});
 for (const [key, value] of Object.entries({window:browser, document:browser.document, location:browser.location, localStorage:browser.localStorage, matchMedia:()=>({matches:false})})) vi.stubGlobal(key,value);
 browser.HTMLElement.prototype.scrollIntoView = vi.fn();
 browser.document.body.innerHTML = `<a id="course-begin"></a><aside id="lesson-rail">${lessons.map((_, i)=>`<a data-rail-row="${i}"><span class="rail-title"></span></a>`).join('')}</aside><section id="focused-lessons" hidden><div>${lessons.map((_,i)=>`<article id="lesson-${i}" hidden><h3>${i}</h3><div class="lesson-prose"></div><button data-done="${i}">Complete</button><textarea data-note="${i}"></textarea><button data-listen="${i}">Listen</button></article>`).join('')}</div></section><details id="course-tools" hidden><section id="test"></section></details>`;
});
afterEach(() => { browser.happyDOM.abort(); vi.unstubAllGlobals(); });
function navigate(hash:string) { browser.location.hash=hash; browser.dispatchEvent(new browser.Event('hashchange')); }
describe('focused course mounted reader', () => {
 it('mounts exactly one lesson and follows hash/back/forward selection without completing it', () => {
  mountFocusedCourse('example',lessons,'user-a');
  expect(browser.document.querySelectorAll('article')).toHaveLength(1);
  expect(browser.document.querySelector('article')?.id).toBe('lesson-0');
  const complete=vi.fn(); courseControls('[data-done]').forEach(button=>button.addEventListener('click',complete));
  navigate('#lesson-1');
  expect(browser.document.querySelectorAll('article')).toHaveLength(1);
  expect(browser.document.querySelector('article')?.textContent).toContain('Second body');
  navigate('#lesson-0');
  expect(browser.document.querySelector('article')?.id).toBe('lesson-0');
  expect(complete).not.toHaveBeenCalled();
  browser.document.querySelector<HTMLButtonElement>('[data-done]')!.click();
  expect(complete).toHaveBeenCalledOnce();
 });
 it('bookmarks without replacing active body/media and restores account-scoped state', () => {
  mountFocusedCourse('example',lessons,'user-a');
  const iframe=browser.document.querySelector('iframe');
  browser.document.querySelector<HTMLButtonElement>('[data-bookmark]')!.click();
  expect(browser.document.querySelector('iframe')).toBe(iframe);
  expect(JSON.parse(browser.localStorage.getItem(lessonBookmarkKey('example','user-a'))!)).toEqual([0]);
  expect(browser.localStorage.getItem(lessonBookmarkKey('example','user-b'))).toBeNull();
  expect(browser.document.querySelector('[data-bookmark]')?.getAttribute('aria-pressed')).toBe('true');
  browser.document.querySelector<HTMLButtonElement>('[data-bookmark]')!.click();
  expect(JSON.parse(browser.localStorage.getItem(lessonBookmarkKey('example','user-a'))!)).toEqual([]);
 });
 it('withholds locked body and disables lesson controls, with valid final action', () => {
  browser.location.hash='#lesson-2';
  mountFocusedCourse('example',lessons,'user-a');
  expect(browser.document.querySelector('article')?.textContent).toContain('Available next week');
  expect(browser.document.body.textContent).not.toContain('SECRET LOCKED BODY');
  for (const button of browser.document.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>('article button,article textarea')) expect(button.disabled).toBe(true);
  expect(browser.document.querySelector<HTMLAnchorElement>('[data-next]')!.hidden).toBe(true);
  expect(browser.document.querySelector<HTMLAnchorElement>('[data-final]')!.getAttribute('href')).toBe('#test');
 });
 it('resumes a remembered lesson and lets an explicit link override it', () => {
  browser.localStorage.setItem('su_v1_last_lesson_user-a_example','1');
  browser.location.hash='#lesson-0'; mountFocusedCourse('example',lessons,'user-a');
  expect(browser.document.querySelector('article')?.id).toBe('lesson-0');
 });
 it('remains usable when device storage rejects writes', () => {
  vi.spyOn(browser.localStorage,'setItem').mockImplementation(()=>{throw new Error('blocked')});
  expect(()=>mountFocusedCourse('example',lessons,'user-a')).not.toThrow();
  expect(()=>browser.document.querySelector<HTMLButtonElement>('[data-bookmark]')!.click()).not.toThrow();
  expect(browser.document.querySelector('[data-bookmark-status]')?.textContent).toContain('could not be saved');
  expect(browser.document.querySelector('[data-bookmark]')?.getAttribute('aria-pressed')).toBe('false');
  navigate('#lesson-1'); expect(browser.document.querySelector('article')?.id).toBe('lesson-1');
 });
 it('does not mount empty content or learner navigation', () => {
  mountFocusedCourse('example',[],'user-a');
  expect(browser.document.querySelector('#focused-lessons')?.hasAttribute('hidden')).toBe(true);
  expect(browser.document.querySelector('.focused-navigation')).toBeNull();
 });
});
