import { describe,expect,it } from 'vitest';
import { safeReturnPath } from '../web/src/lib/return-path';
describe('course login return paths',()=>{
 it('preserves a local lesson anchor',()=>expect(safeReturnPath('/course/history?x=1#lesson-2')).toBe('/course/history?x=1#lesson-2'));
 it.each(['//evil.test','/\\evil.test','/\t/evil.test','https://evil.test','javascript:alert(1)',null])('rejects off-site redirect %s',path=>expect(safeReturnPath(path)).toBe('/dashboard'));
});
