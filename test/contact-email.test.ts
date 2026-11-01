import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('../functions/api/_lib.js',()=>({json:(body:any,status=200)=>Response.json(body,{status}),getUser:async()=>null,newId:()=> 'feedback-id',logEvent:async()=>{}}));
import {onRequestPost} from '../functions/api/feedback.js';
afterEach(()=>vi.unstubAllGlobals());
const makeEnv=()=>{const run=vi.fn(async()=>({success:true}));const stmt={run,bind:()=>({run})};return {DB:{prepare:()=>stmt},CONTACT_RESEND_API_KEY:'mock'};};
const request=()=>new Request('https://sikhiuni.com/api/feedback',{method:'POST',body:JSON.stringify({email:'reader@example.com',message:'A course correction',category:'course'})});
describe('feedback notification',()=>{
 it('saves feedback and delivers it to the shared inbox with visitor reply-to',async()=>{const send=vi.fn(async()=>new Response('{}',{status:200}));vi.stubGlobal('fetch',send);const result=await onRequestPost({request:request(),env:makeEnv()});expect(await result.json()).toEqual({ok:true,notified:true});const body=JSON.parse(send.mock.calls[0][1].body);expect(body.to).toEqual(['akaal@sikhi.io']);expect(body.reply_to).toBe('reader@example.com');});
 it('retains feedback and reports an undelivered notification on provider failure',async()=>{vi.stubGlobal('fetch',async()=>new Response('{}',{status:403}));const response=await onRequestPost({request:request(),env:makeEnv()});expect(await response.json()).toEqual({ok:true,notified:false});});
});
