import { getUser } from './_lib.js';
// Current sessions carry mfa_ok; older sessions must still respect any enrolled
// second factor, matching requireMfa's semantics without imposing a role gate.
export async function getLearningUser(env,request) {
 const user=await getUser(env,request);
 if(!user)return {user:null,needsMfa:false};
 if(user.mfa_ok===0)return {user,needsMfa:true};
 if(user.mfa_ok!==1){
  const row=await env.DB.prepare('SELECT enabled_at FROM user_mfa WHERE user_id=?').bind(user.id).first();
  if(row?.enabled_at)return {user,needsMfa:true};
 }
 return {user,needsMfa:false};
}
