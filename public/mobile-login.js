import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithRedirect,getRedirectResult,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const auth=getAuth(initializeApp(config));
const params=new URLSearchParams(location.search);
const state=params.get('state');
const key='runnerPulseMobileAuthState';
const button=document.getElementById('login'),status=document.getElementById('status');
const valid=s=>/^[A-Za-z0-9_-]{32,128}$/.test(s||'');
if(valid(state))sessionStorage.setItem(key,state);
const pending=valid(state)?state:sessionStorage.getItem(key);
if(!valid(pending)){button.disabled=true;status.textContent='Richiesta non valida. Torna all’app.';}
let finishing=false;
async function finish(user){
 if(!user||!valid(pending)||finishing)return;
 finishing=true;button.disabled=true;status.textContent='Accesso in corso…';
 try{
  const idToken=await user.getIdToken();
  const response=await fetch('/api/mobile-auth/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:pending,idToken})});
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Accesso non riuscito');
  sessionStorage.removeItem(key);
  status.textContent='Accesso riuscito. Ritorno a Runner Pulse…';
  location.href='runnerpulseauth://callback?state='+encodeURIComponent(pending)+'&code='+encodeURIComponent(data.code);
 }catch(e){finishing=false;button.disabled=false;status.textContent=e.message||'Accesso non riuscito';}
}
// Il redirect evita le finestre popup che si chiudono nelle schede personalizzate Android.
getRedirectResult(auth).then(result=>{if(result?.user)void finish(result.user);}).catch(e=>{status.textContent=e.message||'Accesso non riuscito';button.disabled=false;});
onAuthStateChanged(auth,user=>{if(user&&valid(pending))void finish(user);});
button.addEventListener('click',async()=>{
 if(!valid(pending))return;
 button.disabled=true;status.textContent='Apertura accesso Google…';
 try{await signInWithRedirect(auth,new GoogleAuthProvider());}
 catch(e){button.disabled=false;status.textContent=e.message||'Accesso non riuscito';}
});
