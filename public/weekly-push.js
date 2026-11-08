import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getMessaging, getToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config);
const button=document.getElementById('rp-enable-weekly-push');
const status=document.getElementById('rp-weekly-push-status');
function say(message){if(status)status.textContent=message;}
if(button)button.addEventListener('click',async()=>{
 button.disabled=true;
 try{
  if(!('serviceWorker' in navigator)||!('Notification' in window)||!await isSupported())throw new Error('Questo browser non supporta le notifiche push. Apri Runner Pulse in Chrome su Android.');
  const user=getAuth(app).currentUser;
  if(!user)throw new Error('Accedi prima con il tuo account Google.');
  if(Notification.permission==='denied')throw new Error('Notifiche bloccate: abilita le notifiche di Runner Pulse nelle impostazioni di Chrome.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Devi consentire le notifiche per attivarle.');
  const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const vapidKey=window.RUNNER_PULSE_VAPID_KEY;
  if(!vapidKey)throw new Error('Chiave pubblica Web Push non configurata.');
  const token=await getToken(getMessaging(app),{vapidKey,serviceWorkerRegistration:registration});
  if(!token)throw new Error('Chrome non ha generato un token per le notifiche.');
  const idToken=await user.getIdToken();
  const response=await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({token})});
  const result=await response.json();
  if(!response.ok||!result.success)throw new Error(result.message||'Registrazione non riuscita.');
  say('Notifiche autorizzate su questo telefono. L’invio della domenica richiede la configurazione del servizio programmato.');
 }catch(e){say(e.message||'Impossibile attivare le notifiche.');}
 finally{button.disabled=false;}
});
function openWeeklyCoach(){
 if(new URLSearchParams(location.search).get('weeklyCoach')!=='1')return;
 const show=()=>{const coach=document.querySelector('nav button[data-page="coach"]');if(!coach)return false;coach.click();const question=document.getElementById('rp-ai-question');if(question&&!question.value.trim())question.value='Prepara il resoconto della mia ultima settimana di allenamenti utilizzando soltanto i dati Garmin e gli allenamenti realmente registrati. Analizza carico, progressi, recupero e suggerisci la prossima settimana; indica i dati mancanti.';history.replaceState(null,'',location.pathname);return true;};
 if(!show()){window.addEventListener('runnerpulse:auth-user',()=>setTimeout(show,250),{once:true});}
}
openWeeklyCoach();
