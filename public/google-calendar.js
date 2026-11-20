// Collega Google Calendar senza dati demo: usa OAuth 2 del server Runner Pulse.
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app),$=id=>document.getElementById(id);
const connect=$('rp-calendar-connect'),sync=$('rp-calendar-sync'),disconnect=$('rp-calendar-disconnect'),status=$('rp-calendar-status');
if(connect&&sync&&disconnect&&status){
 let current=null,busy=false,loading=false,loadedAt=0;
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
 }
 async function call(path,method='GET'){
  const user=auth.currentUser;
  if(!user)throw Error('Accedi con Google prima di collegare Calendar.');
  const token=await user.getIdToken();
  const response=await fetch('/api/calendar/'+path,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.success)throw Error(payload.message||'Operazione Google Calendar non riuscita (HTTP '+response.status+').');
  if(auth.currentUser?.uid!==user.uid)throw Error('L’account è cambiato. Riprova.');
  return payload;
 }
 async function load(){
  if(loading)return;
  if(!auth.currentUser){current=null;msg('Accedi con Google per collegare Calendar.');paint();return;}
  loading=true;
  try{
   current=await call('status');
   if(!current.configured)msg('Collegamento non ancora configurato su Render: servono le credenziali OAuth.');
   else if(current.connected){
    msg('Google Calendar collegato. '+(current.lastSyncedAt?'Ultima sincronizzazione: '+new Date(current.lastSyncedAt).toLocaleString('it-IT')+'. ':'')+'Eventi collegati: '+current.count+'.');
   }else{
    const reason=current.oauthError||((result&&result!=='connected')?result:null);
    if(reason)msg(callbackErrors[reason]||callbackErrors.failed);
    else if(result==='connected')msg('Google ha ricevuto il consenso, ma questo account Runner Pulse non risulta collegato. Assicurati di usare lo stesso account Google, poi riprova.');
    else msg('Non collegato. Premi «Collega Google Calendar» per autorizzare l’accesso.');
   }
  }catch(e){msg(e.message);current=null;}
  finally{loadedAt=Date.now();loading=false;paint();}
 }
 connect.addEventListener('click',async()=>{
  busy=true;paint();msg('Richiesta autorizzazione Google in corso…');
  try{const data=await call('connect','POST');window.location.assign(data.authorizationUrl);}
  catch(e){msg(e.message);busy=false;paint();}
 });
 sync.addEventListener('click',async()=>{
  if(!current?.connected)return;
  const approved=Array.isArray(window.rpSavedApproved)?window.rpSavedApproved:[];
  if(!approved.length&&!current.count)return msg('Approva prima un programma nella scheda Piano.');
  const question=approved.length?`Sincronizzare ${approved.length} allenamenti approvati su Google Calendar? Gli eventi Runner Pulse esistenti saranno aggiornati.`:'Hai eliminato il piano. Vuoi rimuovere da Google Calendar soltanto gli eventi creati da Runner Pulse?';
  if(!window.confirm(question))return;
  busy=true;paint();msg('Aggiornamento Google Calendar in corso…');
  try{
   const result=await call('sync','POST');
   current={...current,count:result.count,lastSyncedAt:Date.now(),lastSyncedRevision:result.revision};
   msg(`Google Calendar aggiornato: ${result.created} aggiunti, ${result.updated} modificati, ${result.deleted} rimossi. Eventi totali: ${result.count}.`);
  }catch(e){msg('Sincronizzazione incompleta: '+e.message+' Puoi riprovare senza creare duplicati.');}
  finally{busy=false;paint();}
 });
 disconnect.addEventListener('click',async()=>{
  if(!window.confirm('Scollegare Google Calendar? Gli allenamenti già inseriti resteranno su Google Calendar.'))return;
  busy=true;paint();
  try{await call('disconnect','POST');await load();msg('Google Calendar scollegato. Gli allenamenti già inseriti rimangono su Calendar.');}
  catch(e){msg(e.message);}finally{busy=false;paint();}
 });
 onAuthStateChanged(auth,()=>{current=null;void load();});
 // Se OAuth si apre in Chrome o una Custom Tab e l'utente torna all'app,
 // aggiornare lo stato senza richiedere chiusura/riavvio dell'APK.
 function reloadAfterOAuth(){
  if(document.visibilityState==='hidden')return;
  busy=false;
  paint();
  if(Date.now()-loadedAt>1200)void load();
 }
 window.addEventListener('pageshow',reloadAfterOAuth);
 window.addEventListener('focus',reloadAfterOAuth);
 document.addEventListener('visibilitychange',reloadAfterOAuth);
 window.addEventListener('rp-plan-updated',()=>{if(!busy&&current?.connected){/* Le modifiche al piano richiedono Sync esplicito. */}});
}
