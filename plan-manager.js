// Runner Pulse: piano per account Google, salvato sul server e mai applicato dal Coach senza conferma.
import {getApps, initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app);
let revision=0,draftRevision=0,request=0,busy=false,draftSaving=Promise.resolve();
const approved=document.getElementById('rp-program-approved');
const parent=approved?.parentElement;
const notice=document.createElement('p');notice.id='rp-plan-save-status';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
const controls=document.createElement('div');controls.className='rp-program-actions';
const modify=document.createElement('button');modify.type='button';modify.textContent='Modifica con il Coach';
const erase=document.createElement('button');erase.type='button';erase.textContent='Elimina piano';erase.className='rp-plan-delete';
const recover=document.createElement('button');recover.type='button';recover.textContent='Recupera piano dal telefono';recover.hidden=true;
controls.append(modify,erase,recover);parent?.append(controls,notice);
const key=uid=>'runnerpulse:program:approved:'+uid;
function validSessions(data){return Array.isArray(data)&&data.length>0;}
function publish(sessions){window.rpSavedApproved=sessions;window.rpCurrentDraft=null;window.dispatchEvent(new Event('rp-plan-updated'));render(sessions);}
function render(sessions){
 if(!approved)return;
 approved.replaceChildren();
 if(!validSessions(sessions))approved.textContent='Non hai ancora un programma approvato.';
 else for(const item of sessions){const div=document.createElement('div');div.className='rp-program-session';div.textContent=[item.date,item.time,item.title,Number(item.minutes)+' min'].filter(Boolean).join(' · ');approved.appendChild(div);}
 modify.disabled=!auth.currentUser||busy||(!validSessions(sessions)&&!validSessions(window.rpCurrentDraft));
 erase.disabled=!auth.currentUser||busy||(!validSessions(sessions)&&!validSessions(window.rpCurrentDraft));
 recover.hidden=!!validSessions(sessions)||!auth.currentUser||!localBackupExists();
}
function localBackupExists(){try{const d=JSON.parse(localStorage.getItem(key('local'))||'null');return validSessions(d);}catch{return false;}}
async function api(method,payload,asDraft=false){const user=auth.currentUser;if(!user)throw Error('Accedi prima con Google.');const token=await user.getIdToken();const r=await fetch(asDraft?'/api/training-plan/draft':'/api/training-plan',{method,headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});const data=await r.json();if(!r.ok||!data.success)throw Error(data.message||'Impossibile salvare il piano');if(auth.currentUser?.uid!==user.uid)throw Error('Account cambiato durante il salvataggio.');return data;}
async function load(){
 const user=auth.currentUser,id=++request;
 revision=0;draftRevision=0;window.rpSavedApproved=[];window.rpCurrentDraft=null;
 render([]);
 if(!user){notice.textContent='Accedi con Google per conservare il tuo programma.';return;}
 notice.textContent='Caricamento programma personale…';
 try{
  const [data,storedDraft]=await Promise.all([api('GET'),api('GET',null,true)]);if(id!==request)return;
  revision=data.revision||0;
  const sessions=Array.isArray(data.sessions)?data.sessions:[];
  if(sessions.length)localStorage.setItem(key(user.uid),JSON.stringify(sessions));else localStorage.removeItem(key(user.uid));
  publish(sessions);
  draftRevision=storedDraft.revision||0;
  if(validSessions(storedDraft.sessions)){
    window.rpCurrentDraft=storedDraft.sessions;
    window.dispatchEvent(new Event('rp-plan-updated'));
    notice.textContent='Bozza del programma recuperata dal tuo account Google. Puoi approvarla dalla scheda Obiettivo.';
    const box=document.getElementById('rp-program-proposal');const list=document.getElementById('rp-program-sessions');
    if(box&&list){box.hidden=false;box.style.display='block';list.replaceChildren();for(const s of storedDraft.sessions){const div=document.createElement('div');div.className='rp-program-session';div.textContent=[s.date,s.time,s.title,s.minutes+' min'].join(' · ');list.append(div);}}
    render(sessions);
  } else notice.textContent=sessions.length?'Programma salvato nel tuo account Google.':'Nessun programma salvato sul server.';
 }catch(err){
  if(id!==request)return;
  const cached=JSON.parse(localStorage.getItem(key(user.uid))||'[]');
  window.rpSavedApproved=Array.isArray(cached)?cached:[];
  render(window.rpSavedApproved);window.dispatchEvent(new Event('rp-plan-updated'));
  notice.textContent='Impossibile verificare il salvataggio online: '+err.message+'. Non modificare il piano finché la connessione non torna.';
  modify.disabled=true;erase.disabled=true;
 }
}
window.runnerPulseSavePlan=async (raw,expectedRevision=revision)=>{
 if(busy)throw Error('Un’operazione sul piano è già in corso.');
 if(!validSessions(raw))throw Error('Nessuna seduta da salvare.');
 busy=true;render(window.rpSavedApproved);notice.textContent='Salvataggio su Firestore…';
 try{
  await draftSaving.catch(()=>{});
  const data=await api('PUT',{sessions:raw,expectedRevision});
  revision=data.revision;
  const uid=auth.currentUser.uid;
  localStorage.setItem(key(uid),JSON.stringify(data.sessions));
  publish(data.sessions);
  try{await api('DELETE',{expectedRevision:draftRevision},true);draftRevision=0;}catch(err){console.warn('Pulizia bozza piano:',err.message);}
  notice.textContent='Piano aggiornato e salvato. Rimane disponibile dopo la riapertura.';
  return data;
 }catch(err){notice.textContent='Salvataggio non riuscito: '+err.message;throw err;}
 finally{busy=false;render(window.rpSavedApproved);}
};
window.runnerPulseSaveDraft=async (raw,expectedRevision=draftRevision)=>{
 if(busy)throw Error('Un’operazione sul piano è già in corso.');
 busy=true;notice.textContent='Aggiornamento bozza…';
 try{
  await draftSaving.catch(()=>{});
  const data=await api('PUT',{sessions:raw,expectedRevision},true);
  draftRevision=data.revision;window.rpCurrentDraft=data.sessions;
  window.dispatchEvent(new Event('rp-plan-updated'));
  const list=document.getElementById('rp-program-sessions');
  if(list){list.replaceChildren();for(const s of data.sessions){const div=document.createElement('div');div.className='rp-program-session';div.textContent=[s.date,s.time,s.title,s.minutes+' min'].join(' · ');list.append(div);}}
  notice.textContent='Bozza modificata e salvata. Approvando il programma confermerai queste sedute.';
  return data;
 }catch(err){notice.textContent='Modifica bozza non riuscita: '+err.message;throw err;}
 finally{busy=false;render(window.rpSavedApproved);}
};
window.runnerPulseReloadPlan=load;
// Il vecchio generatore produce la bozza. Il clic di approvazione viene intercettato
// PRIMA del vecchio salvataggio "local", che altrimenti smarrirebbe il programma.
document.addEventListener('click',async e=>{
 const btn=e.target.closest?.('#rp-program-approve');if(!btn)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(busy)return;
 const draft=window.rpCurrentDraft;
 const result=document.getElementById('rp-program-result');
 if(!validSessions(draft)){result.textContent='Genera prima una proposta.';return;}
 try{await window.runnerPulseSavePlan(draft);result.textContent='Programma approvato e salvato nel tuo account Google.';}
 catch(err){result.textContent='Il piano NON è stato salvato: '+err.message;}
},true);
function openCoach(){
 window.rpCoachEditingPlan=true;
 document.querySelector('nav button[data-page="coach"]')?.click();
 const q=document.getElementById('rp-ai-question');
 if(q){q.placeholder='Dimmi che cosa cambiare nel piano…';q.focus();}
}
modify.addEventListener('click',openCoach);
window.runnerPulseDeletePlan=async()=>{
 if(busy||!auth.currentUser)return false;
 if(!window.confirm('Eliminare definitivamente il programma e le bozze salvate per questo account? Gli allenamenti e la cronologia del Coach non saranno cancellati.'))return false;
 busy=true;render(window.rpSavedApproved);notice.textContent='Eliminazione dal database…';
 try{
  await draftSaving.catch(()=>{});
  await api('DELETE',{expectedRevision:revision});
  await api('DELETE',{expectedRevision:draftRevision},true);
  const uid=auth.currentUser.uid;revision=0;draftRevision=0;
  localStorage.removeItem(key(uid));localStorage.removeItem(key('local'));
  const proposal=document.getElementById('rp-program-proposal');if(proposal){proposal.hidden=true;proposal.style.display='none';}
  publish([]);notice.textContent='Piano eliminato dal database. Puoi crearne uno nuovo.';
  return true;
 }catch(err){notice.textContent='Eliminazione non riuscita: '+err.message;throw err;}
 finally{busy=false;render(window.rpSavedApproved);}
};
erase.addEventListener('click',()=>{void window.runnerPulseDeletePlan().catch(()=>{});});
recover.addEventListener('click',async()=>{
 if(!window.confirm('Importare nell’account Google attuale il vecchio piano salvato solo su questo telefono?'))return;
 try{const data=JSON.parse(localStorage.getItem(key('local'))||'[]');if(!validSessions(data))throw Error('Nessun piano recuperabile');await window.runnerPulseSavePlan(data);localStorage.removeItem(key('local'));notice.textContent='Piano recuperato e salvato nell’account Google.';}
 catch(err){notice.textContent='Recupero non riuscito: '+err.message;}
});
onAuthStateChanged(auth,()=>{void load();});
window.addEventListener('rp-plan-updated',()=>render(window.rpSavedApproved));

// Una proposta appena generata rimane salvata come BOZZA, anche senza approvazione.
window.addEventListener('rp-plan-draft-created',e=>{
 const sessions=e.detail?.sessions;
 if(!auth.currentUser||!validSessions(sessions))return;
 const uid=auth.currentUser.uid;
 notice.textContent='Salvataggio della bozza nel tuo account…';
 draftSaving=draftSaving.catch(()=>{}).then(async()=>{
  const data=await api('PUT',{sessions,expectedRevision:draftRevision},true);
  if(auth.currentUser?.uid!==uid)return;
  draftRevision=data.revision;
  render(window.rpSavedApproved);
  notice.textContent='Bozza salvata nel tuo account Google. Puoi uscire e ritrovarla qui.';
 }).catch(err=>{if(auth.currentUser?.uid===uid)notice.textContent='ATTENZIONE: bozza non salvata online: '+err.message;});
});
