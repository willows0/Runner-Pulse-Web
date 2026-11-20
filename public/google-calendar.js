// Collega Google Calendar senza dati demo: usa OAuth 2 del server Runner Pulse.
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app),$=id=>document.getElementById(id);
const connect=$('rp-calendar-connect'),sync=$('rp-calendar-sync'),disconnect=$('rp-calendar-disconnect'),status=$('rp-calendar-status');
const agendaBtn=$('rp-calendar-agenda-refresh'),reauthorize=$('rp-calendar-consent-all'),agendaStatus=$('rp-calendar-agenda-status');
const completedBtn=$('rp-calendar-completed-sync');
 const newEventBtn=$('rp-calendar-new');
if(connect&&sync&&disconnect&&status){
 let current=null,busy=false,loading=false,loadedAt=0;
 let agenda=null,agendaUid=null,agendaFetchedAt=0,agendaRequest=null;
 const query=new URLSearchParams(window.location.search);
 const result=query.get('calendar');
 // Quando il callback ritorna dall'OAuth, conserviamo il risultato in memoria.
 // Il precedente codice lo nascondeva al primo refresh dello stato Firebase.
 if(result){
  const clean=new URL(window.location.href);
  clean.searchParams.delete('calendar');
  window.history.replaceState({},'',clean.pathname+clean.search+clean.hash);
 }
 const callbackErrors={
  invalid_state:'Il ritorno da Google non contiene un codice di verifica valido. Riprova dal pulsante Collega.',
  expired_state:'L’autorizzazione è scaduta o è stata già utilizzata. Premi nuovamente Collega.',
  state_storage:'Il server non ha potuto recuperare la richiesta di collegamento. Controlla Firestore e i log Render.',
  consent_denied:'Il permesso Google Calendar non è stato concesso. Riprova e premi Continua.',
  missing_code:'Google non ha restituito il codice di autorizzazione. Riprova in Chrome.',
  missing_refresh:'Google non ha fornito il permesso persistente. Riprova il collegamento e concedi l’accesso.',
  invalid_client:'Google ha rifiutato il client OAuth. Controlla Client ID e Client secret attivo su Render.',
  invalid_grant:'Google ha rifiutato il codice OAuth. Controlla l’URI di reindirizzamento e riprova.',
  callback_error:'Il server non ha completato il collegamento. Controlla i log di Render (Calendar OAuth callback).',
  token_missing:'Google non ha restituito un token utilizzabile. Riprova.',
  failed:'Collegamento non completato. Controlla i log di Render.'
 };
 function msg(value){status.textContent=value;}
 function paint(){
  const signed=Boolean(auth.currentUser),linked=Boolean(current?.connected),ready=Boolean(current?.configured);
  connect.hidden=linked;sync.hidden=!linked;disconnect.hidden=!linked;
  connect.disabled=busy||!signed||!ready;sync.disabled=busy||!signed;disconnect.disabled=busy||!signed;
  if(agendaBtn){agendaBtn.hidden=!linked;agendaBtn.disabled=busy||!signed;}
  if(completedBtn){completedBtn.hidden=!linked;completedBtn.disabled=busy||!signed;}
  if(newEventBtn){newEventBtn.hidden=!linked;newEventBtn.disabled=busy||!signed;}
  if(reauthorize){reauthorize.hidden=!linked||!agenda?.limitedToPrimary;reauthorize.disabled=busy||!signed;}
 }
 async function call(path,method='GET',body={}){
  const user=auth.currentUser;
  if(!user)throw Error('Accedi con Google prima di collegare Calendar.');
  const token=await user.getIdToken();
  const response=await fetch('/api/calendar/'+path,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.success)throw Error(payload.message||'Operazione Google Calendar non riuscita (HTTP '+response.status+').');
  if(auth.currentUser?.uid!==user.uid)throw Error('L’account è cambiato. Riprova.');
  return payload;
 }
 function todayInRome(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
 }
 function clearAgenda(){
  agenda=null;agendaUid=null;agendaFetchedAt=0;agendaRequest=null;
  window.rpCalendarAgenda=null;
  window.dispatchEvent(new Event('rp-calendar-agenda-updated'));
  if(agendaStatus)agendaStatus.textContent='';
 }
 async function refreshAgenda({force=false}={}){
  const uid=auth.currentUser?.uid;
  if(!uid||!current?.connected)throw Error('Collega prima Google Calendar per vedere gli impegni.');
  if(!force&&agendaUid===uid&&agenda&&Date.now()-agendaFetchedAt<45000)return agenda;
  if(agendaRequest&&agendaUid===uid)return agendaRequest;
  agendaUid=uid;
  if(agendaStatus)agendaStatus.textContent='Recupero impegni reali da Google Calendar…';
  const request=call('agenda?start='+encodeURIComponent(todayInRome())+'&days=42').then(data=>{
   if(auth.currentUser?.uid!==uid)throw Error('Account cambiato durante la lettura degli impegni.');
   agenda=data;agendaFetchedAt=Date.now();window.rpCalendarAgenda=agenda;
   window.dispatchEvent(new Event('rp-calendar-agenda-updated'));
   if(agendaStatus)agendaStatus.textContent=`${data.events.length} impegni letti da ${data.calendars.length} calendario/i. `+
     (data.limitedToPrimary?'Per vedere anche gli altri calendari premi “Autorizza tutti i calendari”.':'Allenamenti e impegni sono visibili nella scheda Calendario.');
   paint();return data;
  }).catch(error=>{
   if(auth.currentUser?.uid===uid){agenda=null;window.rpCalendarAgenda=null;window.dispatchEvent(new Event('rp-calendar-agenda-updated'));if(agendaStatus)agendaStatus.textContent='Impegni non aggiornati: '+error.message;}
   throw error;
  }).finally(()=>{if(agendaRequest===request)agendaRequest=null;});
  agendaRequest=request;return request;
 }
 // Sia il modulo manuale sia la dettatura del Coach usano la stessa conferma.
 const modal=$('rp-commitment-modal'),form=$('rp-commitment-form'),feedback=$('rp-commitment-message');
 const save=$('rp-commitment-save'),cancel=$('rp-commitment-cancel');
 if(modal)document.body.append(modal); // fuori dalla pagina Piano, anche quando si parla col Coach
 let requestId=null,modalBusy=false;
 function closeModal(){if(modalBusy)return;modal.hidden=true;document.body.style.overflow='';}
 function showModal(proposal=null){
  const data=proposal||{};
  if(!current?.connected){msg('Collega Google Calendar prima di aggiungere impegni.');document.querySelector('nav button[data-page="plan"]')?.click();return false;}
  requestId=(globalThis.crypto?.randomUUID?.()||'request-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const fields=form.elements;
  fields.title.value=data.title||'';
  fields.category.value=data.category||'other';
  fields.date.value=data.date??(proposal===null?todayInRome():'');
  fields.allDay.checked=data.allDay===true;
  fields.startTime.value=data.startTime||'';
  fields.endTime.value=data.endTime||'';
  fields.description.value=data.description||'';
  const times=form.querySelector('.rp-commitment-times');times.hidden=fields.allDay.checked;
  fields.startTime.required=fields.endTime.required=!fields.allDay.checked;
  feedback.textContent='Verifica data, orari e descrizione prima di salvare.';
  modal.hidden=false;document.body.style.overflow='hidden';fields.title.focus();return true;
 }
 form?.elements.allDay?.addEventListener('change',()=>{
  const all=form.elements.allDay.checked;
  form.querySelector('.rp-commitment-times').hidden=all;
  form.elements.startTime.required=form.elements.endTime.required=!all;
 });
 window.runnerPulseOpenCommitment=showModal;
 window.runnerPulseProposeCalendarCommitment=async message=>{
  if(!current?.connected)throw Error('Collega prima Google Calendar nella scheda Piano.');
  const data=await call('interpret-and-create','POST',{message});
  if(data.created){
   await refreshAgenda({force:true}).catch(()=>{});
   return {created:true,...data.event,alreadyExists:data.alreadyExists};
  }
  // Non aprire la schermata Nuovo impegno durante una conversazione col Coach.
  // Dati incompleti: sarà il Coach a chiedere la singola informazione mancante.
  return {created:false,...data.proposal,missing:data.missing||[],message:data.message||'Dimmi i dati mancanti per completare l’appuntamento.'};
 };
 window.runnerPulseImportCalendarScreenshot=async(file)=>{
  if(!current?.connected)throw Error('Collega prima Google Calendar nella scheda Piano.');
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2_250_000)throw Error('Usa uno screenshot JPG, PNG o WebP di massimo 2,2 MB.');
  const imageBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Impossibile leggere lo screenshot.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(file);});
  const data=await call('screenshot','POST',{mimeType:file.type,imageBase64});
  await refreshAgenda({force:true}).catch(()=>{});
  return data;
 };
 newEventBtn?.addEventListener('click',()=>showModal());
 cancel?.addEventListener('click',closeModal);
 modal?.addEventListener('click',e=>{if(e.target===modal)closeModal();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden){e.preventDefault();closeModal();}});
 form?.addEventListener('submit',async e=>{
  e.preventDefault();if(modalBusy)return;
  if(!current?.connected)return feedback.textContent='Collega Google Calendar prima di salvare.';
  const fields=form.elements;
  const payload={title:fields.title.value.trim(),category:fields.category.value||'other',date:fields.date.value,allDay:fields.allDay.checked,
    startTime:fields.startTime.value,endTime:fields.endTime.value,description:fields.description.value.trim(),requestId};
  if(!payload.title||!payload.date||(!payload.allDay&&(!payload.startTime||!payload.endTime)))return feedback.textContent='Completa titolo, tipo, data e orari.';
  if(!payload.allDay&&payload.endTime<=payload.startTime)return feedback.textContent='L’orario di fine deve essere successivo all’inizio.';
  // Il pulsante Salva è già il consenso esplicito: nessuna seconda finestra di conferma.
  modalBusy=true;save.disabled=true;cancel.disabled=true;feedback.textContent='Salvataggio dell’impegno su Google Calendar…';
  try{
   const data=await call('commitment','POST',payload);
   feedback.textContent=data.alreadyExists?'Impegno già presente.':'Impegno salvato su Google Calendar.';
   await refreshAgenda({force:true}).catch(error=>{msg('Impegno salvato; aggiorna il calendario per visualizzarlo. '+error.message);});
   requestId=null;modal.hidden=true;document.body.style.overflow='';
   msg('Impegno personale salvato su Google Calendar. Il Coach lo considererà quando genera il piano.');
  }catch(error){feedback.textContent='Non salvato: '+error.message+' Puoi correggere e riprovare.';}
  finally{modalBusy=false;save.disabled=false;cancel.disabled=false;}
 });
 // Elimina un evento selezionato dall'utente: mai sul solo gesto.
 // La richiesta usa il calendario originale e il server ricontrolla i permessi.
 let deletingEvent=false;
 window.runnerPulseDeleteCalendarCommitment=async(event)=>{
  if(deletingEvent)return false;
  if(!current?.connected)throw Error('Collega prima Google Calendar.');
  if(!event?.id||!event?.calendarId||event.calendarWritable!==true)
   throw Error('Questo impegno non può essere eliminato da Runner Pulse.');
  const when=event.allDay?'tutto il giorno':event.startLocal?.slice(11,16)||'';
  const completed=event.eventKind==='completed-workout';
  const reason=completed?'Scomparirà soltanto dal calendario: la corsa e i relativi dettagli rimarranno nelle Attività e non verrà ricreata automaticamente.':`L’eliminazione riguarda questo evento${event.allDay?'':' o questa occorrenza'} e non il piano di allenamento.`;
  if(!window.confirm(`Eliminare da Google Calendar “${event.title}” (${event.startLocal?.slice(0,10)||''}, ${when})?\n\n${reason}`))return false;
  deletingEvent=true;
  if(agendaStatus)agendaStatus.textContent='Eliminazione impegno da Google Calendar…';
  try{
   const result=await call('delete-event','POST',{eventId:event.id,calendarId:event.calendarId});
   msg(result.calendarOnly?'Corsa rimossa dal calendario. La registrazione originale rimane nelle Attività.':'Impegno eliminato da Google Calendar.');
   try{await refreshAgenda({force:true});}catch(error){
    if(agendaStatus)agendaStatus.textContent='Impegno eliminato, ma la lista non si è aggiornata: '+error.message;
   }
   return Boolean(result.deleted);
  }catch(error){
   if(agendaStatus)agendaStatus.textContent='Impegno non eliminato: '+error.message;
   throw error;
  }finally{deletingEvent=false;}
 };
 // La generazione del piano forza sempre una lettura recente degli impegni.
 // Non si salva una bozza fingendo che Google Calendar sia vuoto.
 window.runnerPulseGetCalendarAgenda=refreshAgenda;
 window.runnerPulseCalendarConnection=async()=>{if(!auth.currentUser)throw Error('Accedi prima con Google.');if(current)return Boolean(current.connected);current=await call('status');return Boolean(current.connected);};
 async function load(){
  if(loading)return;
  if(!auth.currentUser){current=null;clearAgenda();msg('Accedi con Google per collegare Calendar.');paint();return;}
  loading=true;
  try{
   current=await call('status');
   if(!current.configured)msg('Collegamento non ancora configurato su Render: servono le credenziali OAuth.');
   else if(current.connected){
    msg('Google Calendar collegato. '+(current.lastSyncedAt?'Ultima sincronizzazione: '+new Date(current.lastSyncedAt).toLocaleString('it-IT')+'. ':'')+'Eventi collegati: '+current.count+'.');
    void refreshAgenda().catch(()=>{});
   }else{
    clearAgenda();
    const reason=current.oauthError||((result&&result!=='connected')?result:null);
    if(reason)msg(callbackErrors[reason]||callbackErrors.failed);
    else if(result==='connected')msg('Google ha ricevuto il consenso, ma questo account Runner Pulse non risulta collegato. Assicurati di usare lo stesso account Google, poi riprova.');
    else msg('Non collegato. Premi «Collega Google Calendar» per autorizzare l’accesso.');
   }
  }catch(e){msg(e.message);current=null;}
  finally{loadedAt=Date.now();loading=false;paint();}
 }
 async function startConnection(){
  busy=true;paint();msg('Richiesta autorizzazione Google in corso…');
  try{
   const inAndroidApp=/RunnerPulseAndroidWebView\/1/.test(navigator.userAgent);
   const data=await call('connect','POST',inAndroidApp?{returnToApp:true}:{});
   if(inAndroidApp){
    // Android apre Chrome Custom Tabs con il consenso Google. Nessun token passa nel deep link.
    window.location.assign('runnerpulsecalendar://start?url='+encodeURIComponent(data.authorizationUrl));
   }else window.location.assign(data.authorizationUrl);
  }
  catch(e){msg(e.message);busy=false;paint();}
 }
 connect.addEventListener('click',startConnection);
 reauthorize?.addEventListener('click',startConnection);
 agendaBtn?.addEventListener('click',()=>{void refreshAgenda({force:true}).catch(()=>{});});
 completedBtn?.addEventListener('click',async()=>{
  if(!current?.connected||busy)return;
  busy=true;paint();msg('Aggiorno i resoconti degli allenamenti completati…');
  try{
   const data=await call('completed-sync','POST');
   msg(`Allenamenti eseguiti: ${data.created} nuovi, ${data.updated} aggiornati, ${data.unchanged} già corretti, ${data.skipped} senza dati recenti, ${data.failed} non sincronizzati.`);
   await refreshAgenda({force:true}).catch(()=>{});
  }catch(e){msg('Resoconti non aggiornati: '+e.message);}
  finally{busy=false;paint();}
 });
 // Quando si elimina una singola seduta già sincronizzata, aggiornare anche
 // Calendar. Un piano mai sincronizzato resta invece non sincronizzato.
 window.runnerPulseSyncPlanAfterEdit=async({ensureCreated=false}={})=>{
  if(!current?.connected||(!current.count&&!ensureCreated))return {skipped:true};
  if(busy)throw Error('Google Calendar sta completando un’altra operazione.');
  busy=true;paint();msg('Aggiorno gli allenamenti programmati su Google Calendar…');
  try{
   const result=await call('sync','POST');
   current={...current,count:result.count,lastSyncedAt:Date.now(),lastSyncedRevision:result.revision};
   msg(`Piano aggiornato su Google Calendar: ${result.deleted} eventi eliminati, ${result.updated} aggiornati.`);
   await refreshAgenda({force:true}).catch(()=>{});
   return result;
  }catch(error){msg('Piano modificato, ma Google Calendar non è aggiornato: '+error.message);throw error;}
  finally{busy=false;paint();}
 };
 sync.addEventListener('click',async()=>{
  if(!current?.connected)return;
  const approved=Array.isArray(window.rpSavedApproved)?window.rpSavedApproved:[];
  if(!approved.length&&!current.count)return msg('Approva prima un programma nella scheda Piano.');
  const question=approved.length?`Sincronizzare ${approved.length} allenamenti approvati su Google Calendar? Gli eventi Runner Pulse esistenti saranno aggiornati.`:'Hai eliminato il piano. Vuoi rimuovere da Google Calendar soltanto gli eventi creati da Runner Pulse?';
  if(!window.confirm(question))return;
  try{await window.runnerPulseSyncPlanAfterEdit();}
  catch{/* Il messaggio è già mostrato dal gestore. */}
 });
 disconnect.addEventListener('click',async()=>{
  if(!window.confirm('Scollegare Google Calendar? Gli allenamenti già inseriti resteranno su Google Calendar.'))return;
  busy=true;paint();
  try{await call('disconnect','POST');clearAgenda();current=null;await load();msg('Google Calendar scollegato. Gli allenamenti già inseriti rimangono su Calendar.');}
  catch(e){msg(e.message);}finally{busy=false;paint();}
 });
 onAuthStateChanged(auth,user=>{if(!user||agendaUid!==user.uid)clearAgenda();current=null;void load();});
 // Se OAuth si apre in Chrome o una Custom Tab e l'utente torna all'app,
 // aggiornare lo stato senza richiedere chiusura/riavvio dell'APK.
 function reloadAfterOAuth(){
  if(document.visibilityState==='hidden')return;
  busy=false;
  paint();
  if(Date.now()-loadedAt>1200)void load();
 }
 window.addEventListener('runnerpulse:calendar-callback',event=>{
  // Il risultato dell'APK è soltanto un suggerimento grafico: il collegamento
  // effettivo viene controllato tramite /api/calendar/status con Firebase Auth.
  const allowed=['connected','invalid_client','invalid_grant','callback_error','missing_refresh',
   'token_missing','consent_denied','missing_code','expired_state','state_storage','invalid_state'];
  const state=String(event.detail?.result||'');
  if(!allowed.includes(state))return;
  document.querySelector('body > nav button[data-page="plan"]')?.click();
  if(state!=='connected')msg(callbackErrors[state]||callbackErrors.failed);
  busy=false;current=null;paint();
  void load();
 });
 window.addEventListener('pageshow',reloadAfterOAuth);
 window.addEventListener('focus',reloadAfterOAuth);
 document.addEventListener('visibilitychange',reloadAfterOAuth);
 window.addEventListener('rp-plan-updated',()=>{if(!busy&&current?.connected){/* Le modifiche al piano richiedono Sync esplicito. */}});
}
