// Runner Pulse: nuova chat con cronologia persistente su Firestore via server autenticato.
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const auth=getAuth();
const coach=document.getElementById('coach');
if(coach){
  const old=[...coach.querySelectorAll('.card')].find(c=>c.querySelector('h3')?.textContent?.includes('Allenatore AI'));
  const card=old||document.createElement('div');
  card.className='card rp-ai-card';
  card.innerHTML=`<h3>🧡 Allenatore AI</h3><p class="muted">Parliamo dei tuoi allenamenti. Ricordo le conversazioni salvate nel tuo account.</p><div id="rp-ai-history" role="log" aria-live="polite" style="display:grid;gap:10px;margin:14px 0;max-height:460px;overflow-y:auto"></div><form id="rp-ai-form"><label for="rp-ai-question">La tua domanda</label><textarea id="rp-ai-question" rows="3" maxlength="1500" required placeholder="Scrivimi…" style="width:100%;box-sizing:border-box;border:1px solid #e5d3c7;border-radius:12px;padding:12px;font:inherit"></textarea><p class="note">L’allenatore usa soltanto gli allenamenti disponibili nel tuo profilo; Garmin è attualmente riservato al proprietario.</p><button id="rp-ai-send" type="submit">Invia messaggio</button><p id="rp-ai-status" role="status" class="note"></p></form><button id="rp-ai-clear" type="button" style="margin-top:10px;background:transparent;color:#9b3e00;border:1px solid #f3d4bf;border-radius:12px;padding:10px">Cancella tutta la conversazione</button><p class="note">La cronologia è salvata su Firebase Firestore. Le domande e il contesto pertinente vengono inviati a Google Gemini. L'AI può sbagliare.</p>`;
  if(!old)coach.append(card);
  const history=card.querySelector('#rp-ai-history'),form=card.querySelector('#rp-ai-form'),question=card.querySelector('#rp-ai-question'),status=card.querySelector('#rp-ai-status'),send=card.querySelector('#rp-ai-send'),clear=card.querySelector('#rp-ai-clear');
  async function api(payload){const user=auth.currentUser;if(!user)throw new Error('Accedi con Google.');const token=await user.getIdToken();const r=await fetch('/api/coach/chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok||!data.success)throw new Error(data.message||`Errore HTTP ${r.status}`);return data;}
  function bubble(role,text){const div=document.createElement('div');div.style.cssText=`padding:12px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:${role==='user'?'#fff1e5':'#f7f7f7'}`;const strong=document.createElement('strong');strong.textContent=role==='user'?'Tu':'Allenatore AI';const p=document.createElement('p');p.textContent=text;p.style.margin='6px 0 0';div.append(strong,p);history.append(div);history.scrollTop=history.scrollHeight;}
  let version=0;
  async function loadHistory(){const current=++version;status.textContent='Caricamento conversazione…';try{const data=await api({action:'history'});if(current!==version)return;history.replaceChildren();data.messages.forEach(m=>bubble(m.role,m.text));status.textContent=data.messages.length?'Conversazione recuperata da Firestore.':'Inizia la conversazione: la memoria è pronta.';}catch(e){if(current===version)status.textContent=e.message;}}
  onAuthStateChanged(auth,user=>{if(user)void loadHistory();else{version++;history.replaceChildren();status.textContent='Accedi con Google per recuperare la memoria.';}});
  form.addEventListener('submit',async e=>{e.preventDefault();const message=question.value.trim();if(!message)return;
    send.disabled=true;clear.disabled=true;status.textContent='Sto rispondendo…';
    try{const data=await api({action:'chat',message});bubble('user',message);bubble('assistant',data.answer);question.value='';status.textContent='Conversazione salvata su Firestore.';}catch(e){status.textContent=e.message;}finally{send.disabled=false;clear.disabled=false;}
  });
  clear.addEventListener('click',async()=>{if(!confirm('Cancellare definitivamente TUTTA la cronologia dell’allenatore?'))return;clear.disabled=true;send.disabled=true;try{await api({action:'clear'});version++;history.replaceChildren();status.textContent='Cronologia cancellata.';}catch(e){status.textContent=e.message;}finally{clear.disabled=false;send.disabled=false;}});
}
