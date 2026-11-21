import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const auth=getAuth(initializeApp(config));
const params=new URLSearchParams(location.search);
const state=params.get('state');
const key='runnerPulseMobileAuthState';
const button=document.getElementById('login');
const status=document.getElementById('status');
const valid=s=>/^[A-Za-z0-9_-]{32,128}$/.test(s||'');
if(valid(state))sessionStorage.setItem(key,state);
const pending=valid(state)?state:sessionStorage.getItem(key);

// Solo un logout VOLONTARIO dal Profilo produce lo stato choose_...
// Non chiedere la selezione account alle normali aperture dell'app Android.
const chooseAfterLogout=Boolean(valid(pending)&&pending.startsWith('choose_'));
let finishing=false;
let chooserReady=!chooseAfterLogout;

function showError(error){
 const code=String(error?.code||'');
 if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment'||code==='auth/popup-closed-by-user'){
  status.textContent=code==='auth/popup-closed-by-user'
   ? 'Accesso Google annullato. Premi Accedi con Google per riprovare.'
   : 'Il browser ha bloccato la finestra Google. Dal menu ⋮ in alto scegli “Apri in Chrome”, poi riprova.';
 }else{
  status.textContent=error?.message||'Accesso Google non riuscito. Riprova.';
 }
 button.disabled=!valid(pending)||!chooserReady;
}

async function finish(user){
 if(!user||!valid(pending)||finishing)return;
 finishing=true;
 button.disabled=true;
 status.textContent='Accesso in corso…';
 try{
  const idToken=await user.getIdToken();
  const response=await fetch('/api/mobile-auth/approve',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({state:pending,idToken})
  });
  const data=await response.json();
  if(!response.ok||!data.success)throw new Error(data.message||'Accesso non riuscito');
  sessionStorage.removeItem(key);
  status.textContent='Accesso riuscito. Ritorno a Runner Pulse…';
  location.href='runnerpulseauth://callback?state='+encodeURIComponent(pending)+'&code='+encodeURIComponent(data.code);
 }catch(error){finishing=false;showError(error);}
}

if(!valid(pending)){
 button.disabled=true;
 status.textContent='Richiesta scaduta o non valida. Chiudi questa pagina e torna all’app.';
}else if(chooseAfterLogout){
 // Il browser Chrome può conservare l'utente precedente anche se la WebView
 // dell'app ha effettuato logout. Scollegalo PRIMA che l'utente tocchi il tasto.
 // Evita qualsiasi await prima di signInWithPopup, altrimenti Chrome può
 // considerare la finestra popup non associata al gesto dell'utente.
 button.disabled=true;
 status.textContent='Preparazione della scelta account Google…';
 signOut(auth).then(()=>{
  chooserReady=true;
  button.disabled=false;
  button.textContent='Scegli account Google';
  status.textContent='Seleziona l’account Google con cui vuoi entrare.';
 }).catch(showError);
}

// Compatibilità con accessi avviati da versioni precedenti. Il vecchio
// reindirizzamento non deve più essere usato per iniziare nuove sessioni:
// su Render (dominio diverso da firebaseapp.com) può tornare senza utente.
getRedirectResult(auth).then(result=>{
 if(!chooseAfterLogout&&result?.user)void finish(result.user);
}).catch(error=>{
 if(!chooseAfterLogout)showError(error);
});

onAuthStateChanged(auth,user=>{
 // Dopo il logout NON approvare mai l'account Chrome memorizzato. Il nuovo
 // account deve provenire dal risultato esplicito del popup Google.
 if(!chooseAfterLogout&&user&&valid(pending))void finish(user);
});

button.addEventListener('click',()=>{
 if(!valid(pending)||finishing||!chooserReady)return;
 button.disabled=true;
 status.textContent='Apertura accesso Google…';
 const googleProvider=new GoogleAuthProvider();
 if(chooseAfterLogout)googleProvider.setCustomParameters({prompt:'select_account'});
 // Il popup viene aperto IMMEDIATAMENTE dal click, senza await intermedi.
 // Questo evita il loop del precedente signInWithRedirect su Render.
 signInWithPopup(auth,googleProvider)
  .then(result=>finish(result.user))
  .catch(showError);
});
