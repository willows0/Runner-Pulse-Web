import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const auth=getAuth(initializeApp(config));
const state=new URLSearchParams(location.search).get('state');
const button=document.getElementById('login'),status=document.getElementById('status');
if(!/^[A-Za-z0-9_-]{32,128}$/.test(state||'')){button.disabled=true;status.textContent='Richiesta non valida. Torna all’app.';}
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Accesso in corso…';
 try{
  const result=await signInWithPopup(auth,new GoogleAuthProvider());
  const idToken=await result.user.getIdToken();
  const response=await fetch('/api/mobile-auth/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,idToken})});
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Accesso non riuscito');
  status.textContent='Accesso riuscito. Ritorno a Runner Pulse…';
  location.href='runnerpulseauth://callback?state='+encodeURIComponent(state)+'&code='+encodeURIComponent(data.code);
 }catch(e){status.textContent=e.message||'Accesso non riuscito';button.disabled=false;}
});
