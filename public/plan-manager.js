import {fitTrainingAroundEvents} from './calendar-slot-planner.js';
// Runner Pulse — un solo gestore del Piano. Le sedute appartengono all'UID Google,
// restano visibili anche se la rete è indisponibile e NON si dichiarano salvate
// finché il server non conferma la scrittura Firestore.
import {getApps, initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app);
const $=id=>document.getElementById(id);
const form=$('rp-program-form'), approvedBox=$('rp-program-approved');
const status=$('rp-program-status');
const controls=document.createElement('div');controls.className='rp-program-actions';
const notice=document.createElement('p');notice.id='rp-plan-save-status';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
const approve=document.createElement('button');approve.type='button';approve.textContent='Approva e salva';approve.className='rp-plan-approve';approve.hidden=true;
const edit=document.createElement('button');edit.type='button';edit.className='rp-plan-edit';edit.textContent='Modifica con il Coach';
const erase=document.createElement('button');erase.type='button';erase.className='rp-plan-delete';erase.textContent='Elimina piano';
const retry=document.createElement('button');retry.type='button';retry.textContent='Riprova salvataggio';retry.hidden=true;
const restore=document.createElement('button');restore.type='button';restore.textContent='Recupera vecchio piano';restore.hidden=true;
controls.append(approve,edit,erase,retry,restore);approvedBox?.parentElement?.append(controls,notice);
const state={uid:null,approved:[],draft:[],revision:0,draftRevision:0,online:false,busy:false,draftPending:false,approvedLocalOnly:false,epoch:0};
let draftWrites=Promise.resolve();
const approvedKey=uid=>'runnerpulse:program:approved:'+uid;
const draftKey=uid=>'runnerpulse:program:draft:'+uid;
const legacyKey='runnerpulse:program:approved:local';
const pendingApprovalKey=uid=>'runnerpulse:program:approval-pending:'+uid;
const objectiveKey=uid=>'runnerpulse:program:objective:'+uid;
const valid=arr=>Array.isArray(arr)&&arr.length>0;
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function remove(key){try{localStorage.removeItem(key);}catch{}}
function getBackup(key){const item=read(key);return Array.isArray(item)?{sessions:item,pending:false}:(item&&Array.isArray(item.sessions)?item:null);}
function sameSessions(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function msg(value){notice.textContent=value;}
function noAccount(){return !state.uid||auth.currentUser?.uid!==state.uid;}
function publish(){
 window.rpSavedApproved=state.approved;
 window.rpCurrentDraft=state.draft.length?state.draft:null;
 window.dispatchEvent(new Event('rp-plan-updated'));
 render();
}
function addText(tag,text,parent,cls){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;parent.appendChild(e);return e;}
function render(){
 if(!approvedBox)return;
 approvedBox.replaceChildren();
 const showDraft=valid(state.draft);
 const visible=valid(state.approved)?state.approved:state.draft;
 if(!valid(visible))approvedBox.textContent='Non hai ancora creato un programma.';
 else{
  if(!valid(state.approved))addText('p','Programma in bozza, salvato nel tuo account. Premi “Approva e salva” per confermarlo.',approvedBox);
  for(const s of visible){const d=document.createElement('div');d.className='rp-program-session';d.textContent=[s.date,s.time,s.title,`${s.minutes} min`].filter(Boolean).join(' · ');approvedBox.appendChild(d);}
  if(valid(state.approved)&&showDraft)addText('p','Hai una nuova bozza in sospeso. Controllala nel calendario e premi “Approva e salva” per sostituire il programma.',approvedBox);
 }
 edit.disabled=noAccount()||state.busy||(!valid(state.approved)&&!showDraft);
 erase.disabled=noAccount()||state.busy||(!valid(state.approved)&&!showDraft);
 retry.hidden=!state.draftPending;
 retry.disabled=noAccount()||state.busy;
 restore.hidden=noAccount()||(!state.approvedLocalOnly && valid(state.approved)) || (!state.approvedLocalOnly&&!valid(getBackup(legacyKey)?.sessions)&&!valid(getBackup(pendingApprovalKey(state.uid))?.sessions));
 restore.disabled=noAccount()||state.busy;
 approve.hidden=!showDraft;approve.disabled=noAccount()||state.busy||!showDraft;
}
async function api(method,payload,asDraft=false){
 const user=auth.currentUser;
 if(!user||user.uid!==state.uid)throw Error('Accedi con Google per salvare il piano.');
 const token=await user.getIdToken();
 const endpoint=asDraft?'/api/training-plan/draft':'/api/training-plan';
 let response;
 try{response=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store'});}
 catch{throw Error('Connessione al server non disponibile. Il piano è conservato temporaneamente su questo dispositivo.');}
 let data;
 try{data=await response.json();}catch{throw Error('Risposta del server non valida (HTTP '+response.status+').');}
 if(!response.ok||data.success!==true)throw Error(data.message||'Salvataggio non riuscito (HTTP '+response.status+').');
 if(auth.currentUser?.uid!==user.uid)throw Error('Account Google cambiato. Ricarica il piano.');
 return data;
}
function normalizeSessions(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>80)throw Error('Il piano deve contenere da 1 a 80 sedute.');
 return rows.map((raw,i)=>{
  const date=String(raw.date||''),time=String(raw.time||''),title=String(raw.title||'').trim(),details=String(raw.details||'').trim(),minutes=Number(raw.minutes);
  const d=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Data non valida alla seduta '+(i+1));
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Orario non valido alla seduta '+(i+1));
  if(title.length<2||title.length>100||details.length>1000)throw Error('Descrizione non valida alla seduta '+(i+1));
  if(!Number.isInteger(minutes)||minutes<10||minutes>300)throw Error('Durata non valida alla seduta '+(i+1));
  return {date,time,title,details,minutes};
 });
}
async function load(){
 const uid=auth.currentUser?.uid||null, epoch=++state.epoch;
 // Recupera immediatamente una copia personale (non una copia condivisa tra account).
 state.uid=uid;state.revision=0;state.draftRevision=0;state.online=false;state.busy=false;
 state.approved=[];state.draft=[];state.draftPending=false;state.approvedLocalOnly=false;
 if(!uid){msg('Accedi con Google per vedere i tuoi programmi.');publish();return;}
 const cachedApproved=getBackup(approvedKey(uid));const cachedDraft=getBackup(draftKey(uid));
 if(valid(cachedApproved?.sessions))state.approved=cachedApproved.sessions;
 if(valid(cachedDraft?.sessions)){state.draft=cachedDraft.sessions;state.draftPending=Boolean(cachedDraft.pending);}
 publish();msg('Recupero programmi dal tuo account Google…');
 const [remoteApproved,remoteDraft]=await Promise.allSettled([api('GET'),api('GET',null,true)]);
 if(epoch!==state.epoch||state.uid!==uid)return;
 if(remoteApproved.status==='fulfilled'){
  const data=remoteApproved.value;state.revision=data.revision||0;state.online=true;
  if(valid(data.sessions)){
   state.approved=data.sessions;state.approvedLocalOnly=false;
   write(approvedKey(uid),{sessions:data.sessions,pending:false});
  }else if(valid(cachedApproved?.sessions)){
   // IMPORTANTISSIMO: non cancellare il vecchio piano locale quando la risposta Firestore è vuota!
   state.approved=cachedApproved.sessions;state.approvedLocalOnly=true;
  }else{state.approved=[];state.approvedLocalOnly=false;}
 }
 if(remoteDraft.status==='fulfilled'){
  const data=remoteDraft.value;state.draftRevision=data.revision||0;
  const remote=data.sessions||[];
  if(valid(remote)&&!state.draftPending){state.draft=remote;write(draftKey(uid),{sessions:remote,pending:false});}
  else if(valid(remote)&&state.draftPending){
   if(sameSessions(remote,state.draft)){state.draft=remote;state.draftPending=false;write(draftKey(uid),{sessions:remote,pending:false});}
   else{state.draft=remote;state.draftPending=false;write(draftKey(uid),{sessions:remote,pending:false});msg('Esiste una bozza online diversa dalla copia locale. Non è stata sovrascritta.');}
  }else if(!valid(remote)&&!state.draftPending){state.draft=[];remove(draftKey(uid));}
 }
 publish();
 if(remoteApproved.status==='rejected'||remoteDraft.status==='rejected'){
  const messages=[remoteApproved,remoteDraft].filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Errore di lettura');
  msg('Recupero online incompleto: '+messages.join(' · ')+'. La copia locale non viene eliminata.');
 }else if(state.approvedLocalOnly){msg('Il piano è presente sul telefono ma non su Firestore: premi “Recupera vecchio piano” per salvarlo online.');}
 else if(state.draftPending){msg('Bozza da sincronizzare: premi “Riprova salvataggio”.');}
 else if(valid(state.draft))msg('Bozza recuperata dal tuo account Google. Puoi modificarla o approvarla.');
 else if(valid(state.approved))msg('Programma recuperato e salvato nel tuo account Google.');
 else if(valid(getBackup(legacyKey)?.sessions)||valid(getBackup(pendingApprovalKey(uid))?.sessions))msg('Trovato un vecchio programma sul telefono: usa “Recupera vecchio piano” per salvarlo sul tuo account Google.');
 else msg('Non ci sono programmi salvati in questo account.');
 // Le richieste interrotte dalla chiusura rimangono conservate in locale.
 // Non sovrascrivere automaticamente un piano esistente di un altro dispositivo.
}
function writeDraftBackup(raw,pending=true){if(state.uid)write(draftKey(state.uid),{sessions:raw,pending});}
async function persistDraft(rows,expectedRevision=null){
 const userUid=state.uid;
 if(!userUid||noAccount())throw Error('Accedi con Google per salvare la bozza.');
 const sessions=normalizeSessions(rows);
 state.draft=sessions;state.draftPending=true;writeDraftBackup(sessions,true);publish();
 msg('Salvataggio bozza sul server in corso…');
 const job=draftWrites.catch(()=>{}).then(async()=>{
  if(state.uid!==userUid||noAccount())throw Error('Account Google cambiato durante il salvataggio.');
  const data=await api('PUT',{sessions,expectedRevision:expectedRevision??state.draftRevision},true);
  state.draftRevision=data.revision;
  // Se un'altra modifica è stata richiesta nel frattempo, non dichiarare salvata l'ultima bozza.
  if(sameSessions(state.draft,sessions)){
   state.draft=data.sessions;state.draftPending=false;writeDraftBackup(data.sessions,false);
   msg('Bozza salvata nel tuo account Google. Rimarrà anche dopo la chiusura.');
  }
  publish();return data;
 });
 draftWrites=job.catch(()=>{});
 try{return await job;}
 catch(err){if(state.uid===userUid){msg('Bozza non ancora salvata su Firestore: '+err.message+' Riprova prima di uscire.');state.draftPending=true;publish();}throw err;}
}
async function saveApproved(rows,expectedRevision=null){
 if(noAccount())throw Error('Accedi con Google per salvare.');
 if(state.busy)throw Error('Un salvataggio è già in corso.');
 const sessions=normalizeSessions(rows),uid=state.uid;
 state.busy=true;render();msg('Salvataggio del programma su Firestore…');
 write(pendingApprovalKey(uid),{sessions,pending:true});
 try{
  await draftWrites.catch(()=>{});
  const data=await api('PUT',{sessions,expectedRevision:expectedRevision??state.revision});
  state.revision=data.revision;state.approved=data.sessions;state.draft=[];state.draftRevision=0;
  state.approvedLocalOnly=false;state.draftPending=false;
  write(approvedKey(uid),{sessions:data.sessions,pending:false});
  remove(pendingApprovalKey(uid));remove(draftKey(uid));
  msg('Programma salvato e confermato su Firestore. Lo ritroverai al prossimo accesso.');
  publish();return data;
 }catch(err){msg('Il programma NON è stato confermato online: '+err.message+' La proposta resta sul telefono.');throw err;}
 finally{state.busy=false;render();}
}
window.runnerPulseSavePlan=saveApproved;
window.runnerPulseSaveDraft=persistDraft;
window.runnerPulseReloadPlan=load;
// Le singole sedute possono essere eliminate dal Calendario con lo stesso
// cestino degli impegni, ma restano intatte le corse effettivamente registrate.
window.runnerPulseRemovePlannedSession=async(session,index)=>{
 if(noAccount()||state.busy||state.draftPending)throw Error('Accedi e attendi che il piano sia aggiornato.');
 const draft=state.draft.length>0,rows=draft?state.draft:state.approved;
 if(!Array.isArray(rows)||index<0||index>=rows.length)throw Error('Seduta non trovata. Aggiorna la pagina.');
 const current=rows[index];
 if(!current||current.date!==session.date||current.time!==session.time||current.title!==session.title)
  throw Error('Il Piano è cambiato. Riapri il calendario prima di eliminare.');
 if(!window.confirm(`Eliminare dal Piano la seduta “${current.title}” del ${current.date} alle ${current.time}?${draft?' Sarà rimossa dalla bozza.':' Se già presente su Google Calendar, verrà rimossa anche da lì.'}\n\nLe corse già registrate nelle Attività rimangono intatte.`))return false;
 if(rows.length===1){
  if(!draft)return window.runnerPulseDeletePlan({skipConfirm:true});
  state.busy=true;render();msg('Elimino l’ultima seduta della bozza…');
  try{
   await draftWrites.catch(()=>{});
   await api('DELETE',{expectedRevision:state.draftRevision},true);
   const uid=state.uid;state.draft=[];state.draftRevision=0;state.draftPending=false;remove(draftKey(uid));
   publish();msg('Ultima seduta eliminata dalla bozza. Gli allenamenti registrati rimangono intatti.');return true;
  }finally{state.busy=false;render();}
 }
 const remaining=rows.filter((_,i)=>i!==index);
 if(draft){await persistDraft(remaining);msg('Seduta eliminata dalla bozza del Piano.');}
 else{
  await saveApproved(remaining);
  if(typeof window.runnerPulseSyncPlanAfterEdit==='function'){
   try{await window.runnerPulseSyncPlanAfterEdit();}
   catch(error){msg('Seduta rimossa dal Piano, ma Google Calendar non è stato aggiornato: '+error.message+' Premi “Sincronizza piano” per completare.');throw error;}
  }
  msg('Seduta eliminata dal Piano. Lo storico delle corse non è stato modificato.');
 }
 return true;
};
function openCoach(){window.rpCoachEditingPlan=true;document.querySelector('nav button[data-page="coach"]')?.click();const input=$('rp-ai-question');if(input){input.placeholder='Chiedi al Coach come modificare il programma…';input.focus();}}
edit.addEventListener('click',openCoach);
window.runnerPulseDeletePlan=async({skipConfirm=false}={})=>{
 if(noAccount()||state.busy)return false;
 if(!skipConfirm&&!window.confirm('Eliminare il piano e tutte le bozze? Verranno rimossi anche gli allenamenti del Piano sincronizzati su Google Calendar. Gare, impegni personali e attività registrate resteranno intatti.'))return false;
 state.busy=true;render();msg('Eliminazione delle sedute del Piano da Google Calendar, poi del programma…');
 try{
  await draftWrites.catch(()=>{});
  // Il server cancella entrambe le voci (programma e bozza) in un'unica transazione.
  const deleted=await api('DELETE',{expectedRevision:state.revision});
  const uid=state.uid;state.approved=[];state.draft=[];state.revision=0;state.draftRevision=0;state.draftPending=false;state.approvedLocalOnly=false;
  remove(approvedKey(uid));remove(draftKey(uid));remove(pendingApprovalKey(uid));remove(legacyKey);
  publish();
  if(window.runnerPulseReloadCalendarStatus)void window.runnerPulseReloadCalendarStatus().catch(()=>{});
  msg('Piano eliminato; '+(deleted.calendarDeleted??0)+' allenamenti del Piano rimossi da Google Calendar. Gare e appuntamenti personali conservati.');
  return true;
 }catch(err){msg('Eliminazione non completata: '+err.message+' Il piano resta salvato. Riprova dopo aver controllato Google Calendar.');throw err;}
 finally{state.busy=false;render();}
};
erase.addEventListener('click',()=>{window.runnerPulseDeletePlan().catch(()=>{});});
retry.addEventListener('click',()=>{if(valid(state.draft))void persistDraft(state.draft).catch(()=>{});});
restore.addEventListener('click',async()=>{
 const uid=state.uid;if(!uid)return;
 const legacy=getBackup(pendingApprovalKey(uid))||(state.approvedLocalOnly?getBackup(approvedKey(uid)):null)||getBackup(legacyKey);
 if(!valid(legacy?.sessions))return msg('Nessun programma locale da recuperare.');
 if(!window.confirm('Salvare su Firestore questo programma recuperato dal telefono?'))return;
 try{await saveApproved(legacy.sessions);remove(legacyKey);}catch{}
});
form?.elements.distance?.addEventListener('change',toggleFields);
form?.elements.race?.addEventListener('change',toggleFields);
function toggleFields(){if(!form)return;const d=$('rp-other-distance'),r=$('rp-race-date');if(d)d.hidden=form.elements.distance.value!=='other';if(r)r.hidden=form.elements.race.value!=='yes';}
function localDate(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function createDraft(values){
 const days=Math.max(2,Math.min(6,Number(values.days)||3));
 const sets={2:[2,0],3:[2,4,0],4:[1,3,5,0],5:[1,2,4,5,0],6:[1,2,3,4,5,0]};
 const preference=values.timePreference, time=preference==='morning'?'07:00':preference==='afternoon'?'13:00':'18:30';
 const distance=Number(values.distance==='other'?values.otherDistance:values.distance);
 const easy=values.level==='beginner'?30:values.level==='intermediate'?40:50;
 const max=Math.max(20,Math.min(240,Math.round(Number(values.weekdayMinutes)||70)));
 const output=[];
 for(let week=0;week<4;week++)for(const [i,day] of sets[days].entries()){
  const now=new Date();now.setHours(12,0,0,0);
  const delta=(day-now.getDay()+7)%7||7;now.setDate(now.getDate()+delta+week*7);
  const isLong=day===0,isQuality=i===1&&!isLong;
  const minutes=isLong?Math.min(180,Math.round((easy+20+week*7)*(distance>=21?1.5:1.1))):Math.min(max,easy+week*5+(isQuality?5:0));
  const title=isLong?'Lungo facile':isQuality?'Ritmo controllato':'Corsa facile';
  const details=isLong?'Corsa a intensità conversazionale, senza forzare':isQuality?'Riscaldamento, parte centrale a ritmo controllato, defaticamento':'Ritmo comodo e regolare';
  output.push({date:localDate(now),time:isLong?'09:00':time,title,details,minutes});
 }
 return output;
}
function validateObjective(values){
 const distance=Number(values.distance==='other'?values.otherDistance:values.distance);
 if(!Number.isFinite(distance)||distance<=0)throw Error('Indica una distanza obiettivo valida.');
 if(values.race==='yes'&&values.raceDate&&values.raceDate<localDate(new Date()))throw Error('La data della gara deve essere futura.');
}
async function generate(){
 if(noAccount())return status.textContent='Accedi con Google prima di creare un programma.';
 if(state.busy)return;
 const button=$('rp-create-proposal');button.disabled=true;
 status.textContent='Generazione e salvataggio del programma…';
 try{
  const values=Object.fromEntries(new FormData(form).entries());validateObjective(values);
  write(objectiveKey(state.uid),values);
  const sessions=createDraft(values);
  // La pianificazione funziona solo con gli appuntamenti reali scaricati
  // adesso dal proprio account. Un errore di rete NON equivale a calendario vuoto.
  if(typeof window.runnerPulseCalendarConnection!=='function')throw Error('La pagina Google Calendar non è pronta. Ricarica Runner Pulse e riprova.');
  const calendarLinked=await window.runnerPulseCalendarConnection();
  if(!calendarLinked){
   // Manteniamo la generazione anche per gli utenti che non hanno collegato Calendar.
   // Il messaggio dichiara esplicitamente che nessun conflitto è stato verificato.
   await persistDraft(sessions);
   status.textContent='Programma in bozza salvato. Google Calendar non è collegato: gli impegni non sono stati verificati. Collega Calendar per incastrare automaticamente le sedute.';
  }else{
   status.textContent='Controllo gli impegni su Google Calendar e cerco gli orari liberi…';
   const agenda=await window.runnerPulseGetCalendarAgenda({force:true});
   if(!agenda||!Array.isArray(agenda.events))throw Error('Impossibile verificare gli impegni del calendario. Riprova.');
   const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
   const today=`${parts.year}-${parts.month}-${parts.day}`;
   const placed=fitTrainingAroundEvents(sessions,agenda.events,{timePreference:values.timePreference,today,bufferMinutes:15});
   await persistDraft(placed.sessions);
   status.textContent=`Programma salvato in bozza: ${placed.sessions.length} allenamenti, ${placed.rescheduled} riposizionati negli spazi liberi. `+
    (agenda.limitedToPrimary?'Per ora sono stati controllati soltanto gli impegni del calendario principale; autorizza tutti i calendari per una pianificazione completa. ':'')+
    'Controlla le date nella scheda Calendario e premi “Approva e salva” per confermare.';
  }
 }catch(err){status.textContent='Attenzione: '+err.message;}
 finally{button.disabled=false;}
}
$('rp-create-proposal')?.addEventListener('click',()=>void generate());
form?.addEventListener('submit',e=>{e.preventDefault();void generate();});
approve.addEventListener('click',async()=>{
 if(!valid(state.draft))return msg('Genera prima un programma.');
 try{await saveApproved(state.draft);msg('Programma approvato e salvato nel tuo account Google.');}
 catch(err){msg('Programma non ancora approvato: '+err.message);}
});
// Il collegamento Google Calendar è gestito dal modulo /google-calendar.js.
onAuthStateChanged(auth,async user=>{
 // Ogni login recupera il proprio Piano. Nessun dato può migrare verso un altro UID.
 draftWrites=Promise.resolve();
 await load();
 if(!user||auth.currentUser?.uid!==user.uid)return;
 const values=read(objectiveKey(user.uid))||read(objectiveKey('local'));
 if(values&&form){for(const [name,value] of Object.entries(values)){if(form.elements[name])form.elements[name].value=value;}toggleFields();}
});
