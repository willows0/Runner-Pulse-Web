import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const button=document.getElementById('rp-enable-weekly-push');
const status=document.getElementById('rp-weekly-push-status');
function say(message){if(status)status.textContent=message;}
const activeLabel='Disattiva notifiche Coach';
const inactiveLabel='Attiva notifiche Coach';
let enabled=false;
let busy=false;
function updateButton(active){enabled=active;if(button){button.textContent=active?activeLabel:inactiveLabel;button.setAttribute('aria-pressed',String(active));}}
async function authenticatedUser(){
 const user=getAuth(app).currentUser;
 if(!user)throw new Error('Accedi prima con il tuo account Google.');
 return user;
}
async function registrationForPush(){
 const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{updateViaCache:'none'});
 await reg.update();return reg;
}
async function currentToken(reg){
 const vapidKey=window.RUNNER_PULSE_VAPID_KEY;
 if(!vapidKey)throw new Error('Chiave pubblica Web Push non configurata.');
 return await getToken(getMessaging(app),{vapidKey,serviceWorkerRegistration:reg});
}
async function refreshPushState(){
 try{
  if(!('Notification' in window)||Notification.permission!=='granted'||!await isSupported()){updateButton(false);return;}
  const user=await authenticatedUser();
  const reg=await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if(!reg){updateButton(false);return;}
  const token=await currentToken(reg);
  if(!token){updateButton(false);return;}
  const response=await fetch('/api/push/status?token='+encodeURIComponent(token),{headers:{Authorization:'Bearer '+await user.getIdToken()}});
  if(!response.ok)return;
  const data=await response.json();updateButton(data.enabled===true);
  if(enabled)say('Notifiche attivate');
 }catch(error){console.warn('Stato notifiche:',error.message);}
}
if(button)button.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;button.disabled=true;
 try{
  if(!('serviceWorker' in navigator)||!('Notification' in window)||!await isSupported())throw new Error('Questo browser non supporta le notifiche push. Apri Runner Pulse in Chrome su Android.');
  const user=await authenticatedUser();
  if(enabled){
   const reg=await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
   if(!reg)throw new Error('Registrazione notifiche non trovata.');
   const token=await currentToken(reg);
   if(!token)throw new Error('Token notifiche non disponibile.');
   const response=await fetch('/api/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({token})});
   const result=await response.json();
   if(!response.ok||!result.success)throw new Error(result.message||'Disattivazione non riuscita.');
   await deleteToken(getMessaging(app)).catch(()=>{});
   updateButton(false);say('Notifiche Coach disattivate');
  }else{
   if(Notification.permission==='denied')throw new Error('Notifiche bloccate: abilita le notifiche di Runner Pulse nelle impostazioni di Chrome.');
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error('Devi consentire le notifiche per attivarle.');
   const reg=await registrationForPush();
   const token=await currentToken(reg);
   if(!token)throw new Error('Chrome non ha generato un token per le notifiche.');
   const response=await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({token})});
   const result=await response.json();
   if(!response.ok||!result.success)throw new Error(result.message||'Registrazione non riuscita.');
   updateButton(true);say('Notifiche attivate');
  }
 }catch(error){say(error.message||'Impossibile aggiornare le notifiche.');}
 finally{busy=false;button.disabled=false;}
});
window.addEventListener('runnerpulse:auth-user',()=>setTimeout(refreshPushState,250));
setTimeout(refreshPushState,1200);

function openWeeklyCoach(){
 if(new URLSearchParams(location.search).get('weeklyCoach')!=='1')return;
 const show=()=>{const coach=document.querySelector('nav button[data-page="coach"]');if(!coach)return false;coach.click();const question=document.getElementById('rp-ai-question');if(question&&!question.value.trim())question.value='Prepara il resoconto della mia ultima settimana di allenamenti utilizzando soltanto i dati Garmin e gli allenamenti realmente registrati. Analizza carico, progressi, recupero e suggerisci la prossima settimana; indica i dati mancanti.';history.replaceState(null,'',location.pathname);return true;};
 if(!show()){window.addEventListener('runnerpulse:auth-user',()=>setTimeout(show,250),{once:true});}
}
openWeeklyCoach();

// Diagnostica: messaggi in primo piano non sono mostrati automaticamente da FCM.
if (await isSupported()) {
 onMessage(getMessaging(app), async payload => {
  try {
   const data=payload.data||{};
   const reg=await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
   if(Notification.permission==='granted' && reg){
    await reg.showNotification(data.title||'Runner Pulse · Coach AI',{
     body:data.body||'Messaggio ricevuto dal Coach',icon:'/coach-notification.png',
     badge:'/coach-notification.png',tag:data.tag||'runnerpulse-foreground',
     data:{url:data.url||'/index.html?weeklyCoach=1'}
    });
    say('Messaggio Firebase ricevuto da Chrome e notifica visualizzata.');
   }else say('Messaggio Firebase ricevuto, ma notifiche o service worker non disponibili.');
  }catch(error){say('Messaggio Firebase ricevuto, ma visualizzazione fallita: '+error.message);}
 });
}
