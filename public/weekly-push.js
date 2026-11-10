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
let refreshSequence=0;
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
 const seq=++refreshSequence;
 if(busy)return;
 if(button){button.disabled=true;button.textContent='Verifica notifiche…';}
 try{
  if(!('Notification' in window)||Notification.permission!=='granted'||!await isSupported()){
   if(seq===refreshSequence){updateButton(false);say(Notification.permission==='denied'?'Notifiche bloccate nelle impostazioni del browser.':'');}
   return false;
  }
  const user=await authenticatedUser();
  // getRegistration('/') restituisce la registrazione anche quando lo scope
  // del service worker è '/', anziché il percorso del suo file.
  const reg=await navigator.serviceWorker.getRegistration('/');
  if(!reg){if(seq===refreshSequence){updateButton(false);say('Notifiche non configurate su questo browser.');}return false;}
  const token=await currentToken(reg);
  if(!token){if(seq===refreshSequence){updateButton(false);say('Token notifiche non disponibile.');}return false;}
  const response=await fetch('/api/push/status?token='+encodeURIComponent(token),{headers:{Authorization:'Bearer '+await user.getIdToken()},cache:'no-store'});
  if(!response.ok)throw new Error('Verifica notifiche non riuscita ('+response.status+').');
  const data=await response.json();
  if(seq===refreshSequence){updateButton(data.enabled===true);say(data.enabled===true?'Notifiche attivate':'Notifiche Coach non attive su questo dispositivo.');}
  return data.enabled===true;
 }catch(error){
  console.warn('Stato notifiche:',error.message);
  if(seq===refreshSequence)say('Impossibile verificare le notifiche: '+error.message);
  return false;
 }finally{if(seq===refreshSequence && button){button.disabled=false;if(button.textContent==='Verifica notifiche…')button.textContent=enabled?activeLabel:inactiveLabel;}}
}
// Ricontrolla la sottoscrizione effettiva dopo il login e quando si riapre il sito.
window.addEventListener('runnerpulse:auth-user',event=>{
 if(event.detail)refreshPushState();
 else{++refreshSequence;updateButton(false);say('');}
});
window.addEventListener('pageshow',()=>{if(getAuth(app).currentUser)refreshPushState();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&getAuth(app).currentUser)refreshPushState();});
setTimeout(()=>{if(getAuth(app).currentUser)refreshPushState();},1500);
if(button)button.addEventListener('click',async()=>{
 if(busy)return;
 ++refreshSequence;busy=true;button.disabled=true;
 try{
  if(!('serviceWorker' in navigator)||!('Notification' in window)||!await isSupported())throw new Error('Questo browser non supporta le notifiche push. Apri Runner Pulse in Chrome su Android.');
  const user=await authenticatedUser();
  if(enabled){
   const reg=await navigator.serviceWorker.getRegistration('/');
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
// Richiesta di consenso dopo il login Google: la richiesta browser avviene SOLO
// quando l'utente tocca esplicitamente "Attiva notifiche".
let promptTimer=null;
let promptOpen=false;
async function offerNotificationsAfterLogin(){
 if(promptOpen || !getAuth(app).currentUser || !button)return;
 const uid=getAuth(app).currentUser.uid;
 const seenKey='runnerPulsePushOfferV3:'+uid;
 // Memorizza la scelta in modo persistente, non soltanto per la sessione.
 try{if(localStorage.getItem(seenKey)==='1')return;}catch{}
 if(!('Notification' in window)||!('serviceWorker' in navigator)||!await isSupported())return;
 const isActive=await refreshPushState();
 if(isActive||enabled)return;
 // Non ripetere l'offerta dopo il primo accesso, anche chiudendo Chrome.
 // La scelta è distinta per account Google e modificabile dal Profilo.
 if(document.getElementById('rp-push-consent-dialog'))return;
 try{localStorage.setItem(seenKey,'1');}catch{}
 promptOpen=true;
 const overlay=document.createElement('div');
 overlay.id='rp-push-consent-dialog';
 overlay.setAttribute('role','presentation');
 overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="rp-push-consent-title" style="width:min(92vw,410px);background:#142b48;color:white;border:2px solid #ff7900;border-radius:24px;padding:25px 20px;text-align:center;box-shadow:0 18px 60px #0008;box-sizing:border-box"><img src="/coach-notification.png" alt="Coach Runner Pulse" style="width:76px;height:76px;object-fit:contain;border-radius:16px"><h2 id="rp-push-consent-title" style="font-size:23px;line-height:1.25;margin:12px 0">Vuoi ricevere le notifiche del Coach?</h2><p style="font-size:16px;line-height:1.5;margin:12px 0 20px">Ogni domenica alle 20:00 riceverai il resoconto settimanale, anche con Chrome chiuso.</p><button id="rp-push-consent-yes" type="button" style="display:block;width:100%;border:0;border-radius:14px;background:#fa7900;color:white;font-weight:700;padding:14px;font-size:16px">Attiva notifiche</button><button id="rp-push-consent-later" type="button" style="display:block;width:100%;border:1px solid #a9bbcf;border-radius:14px;background:transparent;color:white;margin-top:10px;padding:12px;font-size:16px">Non ora</button></section>`;
 Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'99999',background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
 document.body.appendChild(overlay);
 const close=()=>{overlay.remove();promptOpen=false;};
 overlay.querySelector('#rp-push-consent-later').addEventListener('click',close);
 overlay.querySelector('#rp-push-consent-yes').addEventListener('click',()=>{
  close();
  // Usa esattamente la stessa procedura del pulsante Profilo.
  button.click();
 });
}
window.addEventListener('runnerpulse:auth-user',(event)=>{
 clearTimeout(promptTimer);
 if(!event.detail){document.getElementById('rp-push-consent-dialog')?.remove();promptOpen=false;return;}
 promptTimer=setTimeout(offerNotificationsAfterLogin,1200);
});
setTimeout(()=>{if(getAuth(app).currentUser)offerNotificationsAfterLogin();},2200);

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
   const reg=await navigator.serviceWorker.getRegistration('/');
   if(Notification.permission==='granted' && reg){
    await reg.showNotification(data.title||'Runner Pulse · Coach AI',{
     body:data.body||'Messaggio ricevuto dal Coach',icon:'/runner-pulse-icon-192.png',image:'/runner-pulse-icon-512.png',
     badge:'/runner-pulse-notification-badge.png',tag:data.tag||'runnerpulse-foreground',
     data:{url:data.url||'/index.html?weeklyCoach=1'}
    });
    say('Messaggio Firebase ricevuto da Chrome e notifica visualizzata.');
   }else say('Messaggio Firebase ricevuto, ma notifiche o service worker non disponibili.');
  }catch(error){say('Messaggio Firebase ricevuto, ma visualizzazione fallita: '+error.message);}
 });
}
