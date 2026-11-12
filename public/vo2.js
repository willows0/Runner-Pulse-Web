import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId===config.projectId)||initializeApp(config);
const auth=getAuth(app),value=document.getElementById('rp-vo2-official-value'),note=document.getElementById('rp-vo2-official-note');
let requestId=0;
async function load(){
 const id=++requestId,user=auth.currentUser;
 if(!value||!note)return;
 value.textContent='—';note.textContent=user?'Caricamento dati Garmin…':'Accedi per visualizzare il valore Garmin';
 if(!user)return;
 try{
  const token=await user.getIdToken();
  const response=await fetch('/api/garmin/vo2-latest',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw new Error('lettura non riuscita');
  const data=await response.json();
  if(id!==requestId||auth.currentUser?.uid!==user.uid)return;
  if(typeof data.value==='number'&&Number.isFinite(data.value)){
   value.textContent=data.value.toLocaleString('it-IT',{maximumFractionDigits:1});
   note.textContent='Valore ufficiale Garmin';
  }else note.textContent='VO₂ max non ancora ricevuto da Garmin';
 }catch{if(id===requestId)note.textContent='Valore Garmin temporaneamente non disponibile';}
}
onAuthStateChanged(auth,load);
window.addEventListener('runnerpulse:garmin-connection',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
