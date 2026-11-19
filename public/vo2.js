import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId===config.projectId)||initializeApp(config);
const auth=getAuth(app),value=document.getElementById('rp-vo2-official-value'),note=document.getElementById('rp-vo2-official-note');
let requestId=0,lastVitals='';
const honorSelected=()=>{const uid=auth.currentUser?.uid;if(!uid)return false;try{return localStorage.getItem('runnerpulse-active-source:'+uid)==='honor';}catch{return false;}};
const todayRome=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isToday=time=>{const t=Number(time);return Number.isFinite(t)&&t>0&&new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t))===todayRome();};
const activeSource=()=>honorSelected()?(window.runnerPulseConnectedService==='honor'?'honor':null):(window.runnerPulseConnectedService==='garmin'?'garmin':null);

window.addEventListener('runnerpulse:health-vitals',async e=>{
 const user=auth.currentUser;
 if(!user||activeSource()!=='honor'||!e.detail||e.detail.error)return;
 const data=e.detail;
 const key=user.uid+':'+JSON.stringify(data);
 if(key===lastVitals)return;
 try{
  const token=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)return;
  const response=await fetch('/api/health-connect/vitals-sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!response.ok)throw Error('HTTP '+response.status);
  lastVitals=key;void load();
 }catch(error){console.warn('Vitali Health Connect:',error.message);}
});

async function load(){
 const id=++requestId,user=auth.currentUser,source=activeSource();
 if(!value||!note)return;
 value.textContent='—';note.textContent=user?'Caricamento dati dispositivo…':'Accedi per visualizzare il VO₂ max';
 if(!user||!source){const panel=document.getElementById('rp-health-resting-panel');if(panel)panel.hidden=true;note.textContent=user?'Seleziona e autorizza un dispositivo nel Profilo.':'Accedi per visualizzare il VO₂ max';return;}
 if(honorSelected()&&!window.RunnerPulseHealthNative?.requestHomeHealth&&window.RunnerPulseHealthNative?.requestVitals)try{window.RunnerPulseHealthNative.requestVitals();}catch{}
 try{
  const token=await user.getIdToken();
  const response=await fetch(honorSelected()?'/api/health-connect/vitals':'/api/garmin/vo2-latest',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw new Error('lettura non riuscita');
  const data=await response.json();
  if(id!==requestId||auth.currentUser?.uid!==user.uid||activeSource()!==source)return;
  const v=source==='honor'?data.vo2max:data.value;
  const measuredToday=isToday(source==='honor'?data.vo2ObservedAt:data.receivedAt);
  if(measuredToday&&typeof v==='number'&&Number.isFinite(v)){
   value.textContent=v.toLocaleString('it-IT',{maximumFractionDigits:1});
   note.textContent=honorSelected()?'Valore da Health Connect':'Valore ufficiale Garmin';
  }else note.textContent='VO₂ max non misurato oggi';
  const hr=document.getElementById('rp-health-resting-hr');
  const hrNote=document.getElementById('rp-health-resting-hr-note');
  const hrPanel=document.getElementById('rp-health-resting-panel');
  if(hrPanel)hrPanel.hidden=source!=='honor';
  if(hr)hr.textContent=source==='honor'&&isToday(data.heartObservedAt)&&Number.isInteger(data.restingHeartRate)?String(data.restingHeartRate):'—';
  if(hrNote)hrNote.textContent=source==='honor'&&isToday(data.heartObservedAt)&&Number.isInteger(data.restingHeartRate)?'Da Health Connect · oggi':'Frequenza cardiaca a riposo non misurata oggi';
 }catch{if(id===requestId&&activeSource()===source)note.textContent='Valore del dispositivo temporaneamente non disponibile';}
}
onAuthStateChanged(auth,()=>{lastVitals='';load();});
window.addEventListener('runnerpulse:garmin-connection',load);window.addEventListener('runnerpulse:device-status',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
