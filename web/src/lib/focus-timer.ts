export function initFocusTimer() {
 const duration=document.getElementById('focus-duration') as HTMLSelectElement;
 const course=document.getElementById('focus-course') as HTMLSelectElement;
 if(!duration||!course)return;
 const clock=document.getElementById('focus-clock')!,toggle=document.getElementById('focus-toggle')!,status=document.getElementById('focus-status')!;
 const key='su_studio_focus';
 type Session={id:string,minutes:number,course:string,remaining:number,deadline:number,running:boolean};
 const fresh=():Session=>({id:crypto.randomUUID(),minutes:Number(duration.value),course:course.value,remaining:Number(duration.value)*60,deadline:0,running:false});
 let state=fresh();
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.id==='string'&&[5,15,25].includes(saved.minutes)&&Number.isFinite(saved.remaining)&&Number.isFinite(saved.deadline)&&typeof saved.course==='string')state=saved;}catch{}
 duration.value=String(state.minutes);course.value=state.course;
 function save(){try{localStorage.setItem(key,JSON.stringify(state));return true;}catch{status.textContent='Storage is unavailable. This session will not survive a reload.';return false;}}
 function draw(){clock.textContent=Math.floor(state.remaining/60).toString().padStart(2,'0')+':'+(state.remaining%60).toString().padStart(2,'0');toggle.textContent=state.running?'Pause':state.remaining===0?'Start again':state.remaining<state.minutes*60?'Continue':'Start focus';duration.disabled=course.disabled=state.running||state.remaining<state.minutes*60&&state.remaining>0;}
 function complete(){state.running=false;state.remaining=0;try{const parsed=JSON.parse(localStorage.getItem('su_studio_sessions')||'[]');const log=Array.isArray(parsed)?parsed:[];if(!log.some(s=>s.id===state.id)){log.unshift({id:state.id,course:state.course,minutes:state.minutes,date:new Date(state.deadline).toISOString()});localStorage.setItem('su_studio_sessions',JSON.stringify(log.slice(0,100)));}status.textContent='Session complete and logged. Take a breath before your next step.';}catch{status.textContent='Session complete. Storage is unavailable, so the session could not be logged.';}save();}
 function tick(){if(state.running){state.remaining=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));if(!state.remaining)complete();}draw();}
 function reset(){state=fresh();status.textContent='Ready. Choose your course and session length.';save();draw();}
 toggle.addEventListener('click',()=>{tick();if(!state.remaining)state=fresh();state.running=!state.running;if(state.running){state.course=course.value;state.deadline=Date.now()+state.remaining*1000;}status.textContent=state.running?'Focus time is running. You can open a lesson and return here.':'Paused and saved. Continue whenever you are ready.';save();draw();});
 duration.addEventListener('change',reset);course.addEventListener('change',reset);document.getElementById('focus-reset')!.addEventListener('click',reset);
 tick();if(state.running)status.textContent='Your saved focus session is running.';
 setInterval(tick,1000);
 window.addEventListener('storage',event=>{if(event.key===key){try{const next=JSON.parse(event.newValue||'null');if(next&&typeof next.id==='string'&&Number.isFinite(next.remaining)&&Number.isFinite(next.deadline)){state=next;duration.value=String(state.minutes);course.value=state.course;tick();}}catch{}}});
}
