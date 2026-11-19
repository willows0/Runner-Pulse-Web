import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId===config.projectId)||initializeApp(config);
const auth=getAuth(app),value=document.getElementById('rp-vo2-official-value'),note=document.getElementById('rp-vo2-official-note');
let requestId=0,lastVitals='';
const honorSelected=()=>{const uid=auth.currentUser?.uid;if(!uid)return false;try{return localStorage.getItem('runnerpulse-active-source:'+uid)==='honor';}catch{return false;}};
window.addEventListener('runnerpulse:health-vitals',async e=>{
 const user=auth.currentUser;
 if(!user||!honorSelected()||!e.detail||e.detail.error)return;
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
 const id=++requestId,user=auth.currentUser;
 if(!value||!note)return;
 value.textContent='—';note.textContent=user?'Caricamento dati dispositivo…':'Accedi per visualizzare il VO₂ max';
 if(!user){const panel=document.getElementById('rp-health-resting-panel');if(panel)panel.hidden=true;return;}
 if(honorSelected()&&!window.RunnerPulseHealthNative?.requestHomeHealth&&window.RunnerPulseHealthNative?.requestVitals)try{window.RunnerPulseHealthNative.requestVitals();}catch{}
 try{
  const token=await user.getIdToken();
  const response=await fetch(honorSelected()?'/api/health-connect/vitals':'/api/garmin/vo2-latest',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw new Error('lettura non riuscita');
  const data=await response.json();
  if(id!==requestId||auth.currentUser?.uid!==user.uid)return;
  const v=honorSelected()?data.vo2max:data.value;
  if(typeof v==='number'&&Number.isFinite(v)){
   value.textContent=v.toLocaleString('it-IT',{maximumFractionDigits:1});
   note.textContent=honorSelected()?'Valore da Health Connect':'Valore ufficiale Garmin';
  }else note.textContent=honorSelected()?'VO₂ max non disponibile in Health Connect':'VO₂ max non ancora ricevuto da Garmin';
  const hr=document.getElementById('rp-health-resting-hr');
  const hrNote=document.getElementById('rp-health-resting-hr-note');
  const hrPanel=document.getElementById('rp-health-resting-panel');
  if(hrPanel)hrPanel.hidden=!honorSelected();
  if(hr)hr.textContent=honorSelected()&&Number.isInteger(data.restingHeartRate)?String(data.restingHeartRate):'—';
  if(hrNote)hrNote.textContent=honorSelected()&&Number.isInteger(data.restingHeartRate)?'Da Health Connect':'Non disponibile in Health Connect';
 }catch{if(id===requestId)note.textContent='Valore del dispositivo temporaneamente non disponibile';}
}
onAuthStateChanged(auth,()=>{lastVitals='';load();});
window.addEventListener('runnerpulse:garmin-connection',load);window.addEventListener('runnerpulse:device-status',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
