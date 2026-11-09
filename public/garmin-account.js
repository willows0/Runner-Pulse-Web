import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const firebaseConfig={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(firebaseConfig);
const status=document.getElementById('rp-garmin-account-status');
let generation=0;
onAuthStateChanged(getAuth(app),async user=>{
 const id=++generation;
 if(!status)return;
 if(!user){status.textContent='Accedi con Google per vedere lo stato del tuo Garmin.';return;}
 status.textContent='Verifica connessione Garmin personale…';
 try{
  const token=await user.getIdToken();
  const response=await fetch('/api/garmin/account-status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json();
  if(id!==generation)return;
  status.textContent=response.ok?data.message:(data.message||'Impossibile verificare lo stato Garmin.');
 }catch{if(id===generation)status.textContent='Verifica non disponibile. Riprova più tardi.';}
});
