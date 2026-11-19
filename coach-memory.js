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
 function scrollToLatest(){requestAnimationFrame(()=>{history.scrollTop=history.scrollHeight;});}
 function showAnswerStart(row){requestAnimationFrame(()=>{history.scrollTop=Math.max(0,row.offsetTop-history.offsetTop-10);});}
 // Ricalcola la posizione quando cambia l'altezza del campo o della chat.
 // Non spostare la risposta mentre cambia l'altezza della chat o si apre la tastiera.
 // Anche quando la scheda viene riaperta, mostra la fine della conversazione.
 document.querySelectorAll('nav button[data-page="coach"]').forEach(button=>button.addEventListener('click',()=>{scrollToLatest();setTimeout(scrollToLatest,80);}));
 async function api(payload){const user=auth.currentUser;if(!user)throw new Error('Accedi con Google per parlare con il Coach.');const token=await user.getIdToken();const r=await fetch('/api/coach/chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok||!data.success)throw new Error(data.message||`Errore HTTP ${r.status}`);return data;}
 function bubble(role,message,{scroll=true}={}){const user=role==='user';const row=document.createElement('div');row.className='rp-chat-row '+(user?'rp-chat-user':'rp-chat-assistant');if(!user){const avatar=document.createElement('img');avatar.src='/coach-robot.png';avatar.alt='';avatar.className='rp-chat-avatar';row.append(avatar);}const wrap=document.createElement('div');wrap.className='rp-chat-bubble';const p=document.createElement('p');p.textContent=message;wrap.append(p);row.append(wrap);history.append(row);if(scroll){if(user)scrollToLatest();else showAnswerStart(row);}return row;}
 async function loadHistory(){const current=++version;status.textContent='Caricamento conversazione…';try{const data=await api({action:'history'});if(current!==version)return;history.replaceChildren();for(const m of data.messages||[])bubble(m.role,m.text,{scroll:false});status.textContent='';scrollToLatest();}catch(e){if(current===version)status.textContent=e.message;}}
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
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const message=question.value.trim();if(!message)return;busy=true;send.disabled=true;status.textContent='Il Coach sta rispondendo…';suggestions.hidden=true;try{const simplified=message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const deletePlan=/(?:elimin|cancell|rimuov|azzer)/.test(simplified)&&/\b(piano|programma)\b/.test(simplified)&&!/\b(?:seduta|allenamento)\s+(?:di|del|per)\s+(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)/.test(simplified);
   if(deletePlan){
     bubble('user',message,{scroll:false});question.value='';question.blur();
     const row=bubble('assistant','Vuoi eliminare il piano di allenamento salvato? Le attività registrate rimarranno intatte. La cancellazione richiede la tua conferma.');
     const button=document.createElement('button');button.type='button';button.textContent='Conferma eliminazione piano';button.className='rp-plan-chat-delete';
     row.querySelector('.rp-chat-bubble')?.appendChild(button);
     button.addEventListener('click',async()=>{button.disabled=true;try{if(!window.runnerPulseDeletePlan)throw Error('Funzione Piano non disponibile.');const ok=await window.runnerPulseDeletePlan();if(ok){button.textContent='Piano eliminato ✓';window.rpCoachEditingPlan=false;status.textContent='Piano cancellato dal tuo account.';}else button.disabled=false;}catch(err){button.disabled=false;status.textContent=err.message;}});
     status.textContent='Il piano non è stato ancora eliminato.';
   }else{
   const planIntent=Boolean(window.rpCoachEditingPlan)||(/\b(piano|programma|sedut[ae]|allenament[oi])\b/.test(simplified)&&/modific|spost|anticip|posticip|riduc|aument|cambi|sostituisc|aggiung|tog|elimin|riposo|data|orari|giorn|recuper/.test(simplified));
   const data=await api({action:planIntent?'plan-edit':'chat',message});
   bubble('user',message,{scroll:false});question.value='';question.blur();
   if(planIntent){
     const row=bubble('assistant',data.summary+'\n\nQuesta è una proposta. Il piano NON cambia finché non premi “Approva modifica”.');
     const button=document.createElement('button');button.type='button';button.textContent='Approva modifica del piano';button.className='rp-plan-chat-approve';
     row.querySelector('.rp-chat-bubble')?.appendChild(button);
     button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Salvataggio piano…';try{if(data.draft){if(!window.runnerPulseSaveDraft)throw Error('Apri Piano e riprova.');await window.runnerPulseSaveDraft(data.sessions,data.revision);button.textContent='Bozza modificata ✓';status.textContent='Bozza aggiornata. Puoi approvarla dalla scheda Piano.';}else{if(!window.runnerPulseSavePlan)throw Error('Apri Piano e riprova.');await window.runnerPulseSavePlan(data.sessions,data.revision);button.textContent='Modifica salvata ✓';status.textContent='Piano aggiornato nel tuo account Google.';}window.rpCoachEditingPlan=false;}catch(err){button.disabled=false;status.textContent='Modifica non salvata: '+err.message;}});
     status.textContent='Verifica la proposta e premi Approva modifica se sei soddisfatto.';
   } else {bubble('assistant',data.answer);status.textContent='';}
   }
 }catch(err){status.textContent=err.message;}finally{busy=false;send.disabled=false;}});
 question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
 quick.addEventListener('click',()=>{suggestions.hidden=!suggestions.hidden;});
 suggestions.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{question.value=b.dataset.prompt;suggestions.hidden=true;question.focus();}));
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(SpeechRecognition){const recognizer=new SpeechRecognition();recognizer.lang='it-IT';recognizer.interimResults=false;recognizer.addEventListener('result',e=>{const t=e.results?.[0]?.[0]?.transcript;if(t)question.value=[question.value.trim(),t].filter(Boolean).join(' ');question.focus();});recognizer.addEventListener('error',()=>{status.textContent='Dettatura non disponibile. Puoi scrivere il messaggio.';});mic.addEventListener('click',()=>{try{recognizer.start();status.textContent='Ti ascolto…';}catch{status.textContent='Dettatura non disponibile.';}});}else{mic.addEventListener('click',()=>{status.textContent='La dettatura non è supportata da questo browser. Usa il microfono della tastiera.';question.focus();});}
}
