import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const auth=getAuth(app),todayEl=document.getElementById('rp-steps-today'),todayNote=document.getElementById('rp-steps-today-note'),bars=document.getElementById('rp-steps-bars'),note=document.getElementById('rp-steps-note');
const fmt=new Intl.NumberFormat('it-IT');let generation=0;
let nativeSteps=null;
let lastSyncKey='';
let garminAvailable=false;
async function syncStepsForCoach(days){
 const user=auth.currentUser;
 if(!user||!Array.isArray(days)||days.length!==7)return;
 const key=user.uid+':'+JSON.stringify(days);
 if(key===lastSyncKey)return;
 try{
  const token=await user.getIdToken();
  if(auth.currentUser?.uid!==user.uid)return;
  const response=await fetch('/api/health-connect/steps-sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({days})});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(auth.currentUser?.uid===user.uid)lastSyncKey=key;
 }catch(error){console.warn('Coach passi Health Connect non sincronizzati:',error.message);}
}

function showNative(data){
 if(!auth.currentUser || !Array.isArray(data?.days) || data.days.length!==7)return false;
 const days=data.days;
 if(!days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)&& (d.steps===null || (Number.isSafeInteger(d.steps)&&d.steps>=0))))return false;
 nativeSteps=data;
 void syncStepsForCoach(days);
 if(garminAvailable)return true;
 const today=days[6].steps;
 todayEl.textContent=Number.isInteger(today)?fmt.format(today):'—';
 todayNote.textContent=Number.isInteger(today)?'Passi letti da Health Connect':'Nessun dato oggi in Health Connect';
 bars.replaceChildren();const max=Math.max(1,...days.map(d=>d.steps||0));
 for(const day of days){
  const cell=document.createElement('div');cell.className='rp-steps-day';
  const bar=document.createElement('div');bar.className='rp-steps-bar'+(Number.isInteger(day.steps)?'':' missing');
  bar.style.height=Number.isInteger(day.steps)?Math.max(3,Math.round(day.steps/max*104))+'px':'3px';
  bar.title=day.date+': '+(Number.isInteger(day.steps)?fmt.format(day.steps)+' passi':'dati non disponibili');
  const label=document.createElement('span');label.textContent=new Intl.DateTimeFormat('it-IT',{weekday:'short',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z'));
  cell.append(bar,label);bars.append(cell);
 }
 const available=days.filter(d=>Number.isInteger(d.steps)).length;
 note.textContent=available?`Health Connect: ${available} giorni con dati su 7. Conteggi aggregati, senza sommare le origini.`:'Nessun passo disponibile in Health Connect negli ultimi 7 giorni.';
 return true;
}
window.addEventListener('runnerpulse:health-steps',event=>{
 if(event.detail?.error){console.warn('Health Connect:',event.detail.error);return;}
 showNative(event.detail);
 void load();
});
function requestNativeSteps(){
 if(!auth.currentUser || !window.RunnerPulseHealthNative?.requestSteps)return;
 try{window.RunnerPulseHealthNative.requestSteps();}catch(e){console.warn('Health Connect steps:',e);}
}

function empty(message){todayEl.textContent='—';todayNote.textContent='Dati non disponibili';bars.replaceChildren();note.textContent=message;}
async function load(){const current=++generation,user=auth.currentUser;if(!user){nativeSteps=null;empty('Accedi per visualizzare i passi.');return;}
 requestNativeSteps();
 try{const token=await user.getIdToken();const response=await fetch('/api/steps/week',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(current!==generation||auth.currentUser?.uid!==user.uid)return;
 const days=Array.isArray(data.days)?data.days:[];garminAvailable=days.some(d=>Number.isSafeInteger(d.steps)&&d.steps>=0);if(!garminAvailable&&nativeSteps){showNative(nativeSteps);return;}const today=days.at(-1)?.steps;todayEl.textContent=Number.isInteger(today)?fmt.format(today):'—';todayNote.textContent=Number.isInteger(today)?'Passi registrati oggi':'Dati non disponibili oggi';bars.replaceChildren();const max=Math.max(1,...days.map(d=>Number.isInteger(d.steps)?d.steps:0));
 for(const day of days){const cell=document.createElement('div');cell.className='rp-steps-day';const bar=document.createElement('div');bar.className='rp-steps-bar'+(Number.isInteger(day.steps)?'':' missing');bar.style.height=Number.isInteger(day.steps)?Math.max(3,Math.round(day.steps/max*104))+'px':'3px';bar.title=day.date+': '+(Number.isInteger(day.steps)?fmt.format(day.steps)+' passi':'dati non disponibili');const label=document.createElement('span');label.textContent=new Intl.DateTimeFormat('it-IT',{weekday:'short',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z'));cell.append(bar,label);bars.append(cell);}
 const available=days.filter(d=>Number.isInteger(d.steps)).length;note.textContent=available?`Dati Garmin disponibili per ${available} giorni su 7.`:(data.diagnostics?.newestStoredDate?`Nessun dato negli ultimi 7 giorni. Ultimo riepilogo presente: ${data.diagnostics.newestStoredDate}.`:'Nessun riepilogo passi disponibile per gli ultimi 7 giorni.');
 }catch(error){if(current===generation){garminAvailable=false;if(nativeSteps)showNative(nativeSteps);else empty('Impossibile leggere i passi dal server ('+error.message+').');}}}
onAuthStateChanged(auth,()=>{nativeSteps=null;garminAvailable=false;lastSyncKey='';load();});window.addEventListener('runnerpulse:garmin-connection',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
