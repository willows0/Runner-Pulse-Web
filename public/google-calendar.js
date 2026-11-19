// Collega Google Calendar senza dati demo: usa OAuth 2 del server Runner Pulse.
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app),$=id=>document.getElementById(id);
const connect=$('rp-calendar-connect'),sync=$('rp-calendar-sync'),disconnect=$('rp-calendar-disconnect'),status=$('rp-calendar-status');
if(connect&&sync&&disconnect&&status){
 let current=null,busy=false;
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
  if(!auth.currentUser){current=null;msg('Accedi con Google per collegare Calendar.');paint();return;}
  try{
   current=await call('status');
   if(!current.configured)msg('Collegamento non ancora configurato su Render: servono le credenziali OAuth di Google Calendar.');
   else if(current.connected)msg('Google Calendar collegato. '+(current.lastSyncedAt?'Ultima sincronizzazione: '+new Date(current.lastSyncedAt).toLocaleString('it-IT')+'. ':'')+'Eventi collegati: '+current.count+'.');
   else msg('Non collegato. Premi «Collega Google Calendar» per autorizzare l’accesso.');
  }catch(e){msg(e.message);current=null;}
  paint();
 }
 connect.addEventListener('click',async()=>{
  busy=true;paint();msg('Richiesta autorizzazione Google in corso…');
  try{const data=await call('connect','POST');
   // Google impedisce OAuth nei browser integrati di alcune app Android.
   // Per il primo collegamento aprire Runner Pulse in Chrome se necessario.
   window.location.assign(data.authorizationUrl);
  }catch(e){msg(e.message);busy=false;paint();}
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
 const query=new URLSearchParams(window.location.search),result=query.get('calendar');
 if(result){
  const updated=new URL(window.location.href);updated.searchParams.delete('calendar');window.history.replaceState({},'',updated.pathname+updated.search+updated.hash);
  window.addEventListener('load',()=>{
   if(result!=='connected')msg(result==='missing_refresh'?'Google non ha fornito il permesso persistente. Riprova il collegamento.':'Collegamento non completato. Riprova.');
   else void load();
  });
 }
 window.addEventListener('rp-plan-updated',()=>{if(!busy&&current?.connected){/* Le modifiche al piano richiedono Sync esplicito. */}});
}
