import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId===config.projectId)||initializeApp(config);
const auth=getAuth(app),value=document.getElementById('rp-vo2-official-value'),note=document.getElementById('rp-vo2-official-note');
let requestId=0,lastVitals='';
const honorSelected=()=>{const uid=auth.currentUser?.uid;if(!uid)return false;try{return localStorage.getItem('runnerpulse-active-source:'+uid)==='honor';}catch{return false;}};
const romeDay=time=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayRome=()=>romeDay(Date.now());
const parsedTime=time=>{const t=Number(time);if(!Number.isFinite(t)||t<=0)return null;const ms=t<1e11?t*1000:t;return ms<=Date.now()+86400000&&ms>=Date.UTC(2000,0,1)?ms:null;};
const isToday=time=>{const t=parsedTime(time);return t!==null&&romeDay(t)===todayRome();};
const formattedDate=time=>{const t=parsedTime(time);return t===null?null:new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'numeric',month:'long',year:'numeric'}).format(new Date(t));};
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
  const when=source==='honor'?data.vo2ObservedAt:data.receivedAt;
  const date=formattedDate(when);
  // Il VO₂ max non e' una metrica quotidiana: mostrare l'ultimo dato
  // effettivamente ricevuto, con data e provenienza esplicite.
  if(typeof v==='number'&&Number.isFinite(v)&&v>=10&&v<=95){
   value.textContent=v.toLocaleString('it-IT',{maximumFractionDigits:1});
   if(source==='honor')note.textContent=date?'Ultima misurazione Health Connect · '+date:'Ultima misurazione Health Connect · data non disponibile';
   else note.textContent=date?'Ultimo valore ufficiale Garmin · ricevuto il '+date:'Ultimo valore ufficiale Garmin · data di ricezione non disponibile';
  }else note.textContent=source==='honor'?'Nessun VO₂ max disponibile da Health Connect':'Nessun VO₂ max ricevuto da Garmin';
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
