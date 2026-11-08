// Chat Runner Pulse: cronologia personale Firestore, nessun messaggio fittizio.
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const auth=getAuth();
const coach=document.getElementById('coach');
if(coach){
 const history=coach.querySelector('#rp-ai-history');
 const form=coach.querySelector('#rp-ai-form');
 const question=coach.querySelector('#rp-ai-question');
 const status=coach.querySelector('#rp-ai-status');
 const send=coach.querySelector('#rp-ai-send');
 const quick=coach.querySelector('#rp-coach-quick');
 const suggestions=coach.querySelector('#rp-coach-suggestions');
 const mic=coach.querySelector('#rp-coach-mic');
 // Cancella esclusivamente i messaggi Coach dell'utente autenticato.
 const resetCoach=document.createElement('button');
 resetCoach.type='button';
 resetCoach.textContent='Azzera memoria Coach';
 resetCoach.setAttribute('aria-label','Cancella tutte le conversazioni salvate con il Coach');
 resetCoach.style.cssText='display:block;margin:10px 12px 8px auto;padding:8px 12px;border:1px solid #e1a17c;border-radius:12px;background:#fff8f2;color:#9c3d10;font:inherit;font-size:12px;cursor:pointer';
 history.parentNode.insertBefore(resetCoach,history);

 let version=0, busy=false;
 function scrollToLatest(){requestAnimationFrame(()=>{history.scrollTop=history.scrollHeight;setTimeout(()=>{history.scrollTop=history.scrollHeight;},120);});}
 // Anche quando la scheda viene riaperta, mostra la fine della conversazione.
 document.querySelectorAll('nav button[data-page="coach"]').forEach(button=>button.addEventListener('click',()=>{scrollToLatest();setTimeout(scrollToLatest,80);}));
 async function api(payload){const user=auth.currentUser;if(!user)throw new Error('Accedi con Google per parlare con il Coach.');const token=await user.getIdToken();const r=await fetch('/api/coach/chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok||!data.success)throw new Error(data.message||`Errore HTTP ${r.status}`);return data;}
 function bubble(role,message){const user=role==='user';const row=document.createElement('div');row.className='rp-chat-row '+(user?'rp-chat-user':'rp-chat-assistant');if(!user){const avatar=document.createElement('img');avatar.src='/coach-robot.png';avatar.alt='';avatar.className='rp-chat-avatar';row.append(avatar);}const wrap=document.createElement('div');wrap.className='rp-chat-bubble';const p=document.createElement('p');p.textContent=message;wrap.append(p);row.append(wrap);history.append(row);scrollToLatest();}
 async function loadHistory(){const current=++version;status.textContent='Caricamento conversazione…';try{const data=await api({action:'history'});if(current!==version)return;history.replaceChildren();for(const m of data.messages||[])bubble(m.role,m.text);status.textContent='';scrollToLatest();}catch(e){if(current===version)status.textContent=e.message;}}
 onAuthStateChanged(auth,user=>{if(user)void loadHistory();else{version++;history.replaceChildren();status.textContent='Accedi con Google per utilizzare il Coach.';}});
 resetCoach.addEventListener('click',async()=>{
   if(busy)return;
   if(!auth.currentUser){status.textContent='Accedi con Google prima di azzerare la memoria.';return;}
   if(!window.confirm('Cancellare definitivamente tutte le conversazioni del Coach di questo account? Gli allenamenti Garmin non verranno toccati.'))return;
   busy=true;resetCoach.disabled=true;send.disabled=true;status.textContent='Cancellazione memoria Coach in corso…';
   try{await api({action:'clear'});version++;history.replaceChildren();status.textContent='Memoria Coach azzerata. Puoi iniziare una nuova conversazione.';}
   catch(e){status.textContent='Cancellazione non riuscita: '+e.message;}
   finally{busy=false;resetCoach.disabled=false;send.disabled=false;}
 });
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const message=question.value.trim();if(!message)return;busy=true;send.disabled=true;status.textContent='Il Coach sta rispondendo…';suggestions.hidden=true;try{const data=await api({action:'chat',message});bubble('user',message);bubble('assistant',data.answer);question.value='';status.textContent='';}catch(err){status.textContent=err.message;}finally{busy=false;send.disabled=false;question.focus();}});
 question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
 quick.addEventListener('click',()=>{suggestions.hidden=!suggestions.hidden;});
 suggestions.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{question.value=b.dataset.prompt;suggestions.hidden=true;question.focus();}));
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(SpeechRecognition){const recognizer=new SpeechRecognition();recognizer.lang='it-IT';recognizer.interimResults=false;recognizer.addEventListener('result',e=>{const t=e.results?.[0]?.[0]?.transcript;if(t)question.value=[question.value.trim(),t].filter(Boolean).join(' ');question.focus();});recognizer.addEventListener('error',()=>{status.textContent='Dettatura non disponibile. Puoi scrivere il messaggio.';});mic.addEventListener('click',()=>{try{recognizer.start();status.textContent='Ti ascolto…';}catch{status.textContent='Dettatura non disponibile.';}});}else{mic.addEventListener('click',()=>{status.textContent='La dettatura non è supportata da questo browser. Usa il microfono della tastiera.';question.focus();});}
}
