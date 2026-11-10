import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(firebaseConfig);
const auth=getAuth(app);
const oldSection=document.querySelector('.rp-garmin-account');
const oldStatus=document.getElementById('rp-garmin-account-status');
const oldButton=document.getElementById('rp-garmin-connect-account');
if(oldSection){oldSection.hidden=true;}
const section=document.createElement('section');
section.className='rp-garmin-account rp-devices';section.id='rp-connected-devices';
section.setAttribute('aria-label','Dispositivi connessi');
section.innerHTML=`<h2>Dispositivi connessi</h2><p>Collega i tuoi servizi sportivi. Un interruttore acceso indica una connessione verificata, non una semplice richiesta.</p><div id="rp-device-list"></div><p id="rp-devices-message" role="status" aria-live="polite"></p>`;
(oldSection||document.querySelector('#settings .rp-weekly-notification'))?.insertAdjacentElement('beforebegin',section);
const list=section.querySelector('#rp-device-list');
const message=section.querySelector('#rp-devices-message');
const services=[['garmin','Garmin','Garmin Connect'],['polar','Polar','Polar Flow'],['suunto','Suunto','Suunto App'],['samsung','Samsung','Samsung Health']];
const switches=new Map();
const labels=new Map();
const caption=document.querySelector('.rp-watch-caption');
const watchText=document.getElementById('rp-sync-text');
const watchPercent=document.getElementById('rp-sync-percent');
const watchHint=document.querySelector('.rp-watch-hint');
const watchButton=document.getElementById('rp-sync-clock');
const watchActions=document.querySelector('.rp-watch-actions');
function publishConnection(service){
 const name=service==='garmin'?'Garmin Connect':service==='polar'?'Polar Flow':service==='suunto'?'Suunto App':service==='samsung'?'Samsung Health':'';
 window.runnerPulseConnectedService=service||null;
 if(caption)caption.textContent=name||'COLLEGA OROLOGIO';
 if(watchHint)watchHint.textContent='Tocca per gestire';
 if(watchButton){watchButton.title='Gestisci dispositivi nel Profilo';watchButton.setAttribute('aria-label','Apri dispositivi nel Profilo');}
 if(watchActions)watchActions.hidden=service!=='garmin';
 if(!service){if(watchText)watchText.textContent='Nessun orologio collegato';if(watchPercent)watchPercent.hidden=true;}
 else {if(watchPercent)watchPercent.hidden=service!=='garmin';if(service!=='garmin'&&watchText)watchText.textContent='Orologio collegato';}
 window.dispatchEvent(new CustomEvent('runnerpulse:device-status',{detail:{service:service||null}}));
}
watchButton?.addEventListener('click',event=>{event.stopImmediatePropagation();document.querySelector('nav button[data-page="settings"]')?.click();requestAnimationFrame(()=>section.scrollIntoView({behavior:'smooth',block:'start'}));},true);
publishConnection(null);
const style=document.createElement('style');
style.textContent=`.rp-device-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 2px;border-bottom:1px solid #ffffff30}.rp-device-name{font-weight:750}.rp-device-sub{font-size:12px;opacity:.72;margin-top:3px}.rp-device-right{display:flex;align-items:center;gap:10px}.rp-device-state{font-size:12px;opacity:.8;text-align:right}.rp-device-switch{position:relative;width:48px;height:28px;border-radius:30px;border:0;background:#aeb5bd;flex-shrink:0;cursor:pointer;transition:background .2s}.rp-device-switch::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:white;transition:transform .2s;box-shadow:0 1px 4px #0003}.rp-device-switch[aria-checked="true"]{background:#f97316}.rp-device-switch[aria-checked="true"]::after{transform:translateX(20px)}.rp-device-switch:disabled{cursor:not-allowed;opacity:.6}`;
document.head.append(style);
for(const [id,name,subtitle] of services){
 const row=document.createElement('div');row.className='rp-device-row';
 const left=document.createElement('div');const title=document.createElement('div');title.className='rp-device-name';title.textContent=name;const sub=document.createElement('div');sub.className='rp-device-sub';sub.textContent=subtitle;left.append(title,sub);
 const right=document.createElement('div');right.className='rp-device-right';
 const state=document.createElement('span');state.className='rp-device-state';state.textContent='Non collegato';
 const button=document.createElement('button');button.type='button';button.className='rp-device-switch';button.setAttribute('role','switch');button.setAttribute('aria-label',`Collegamento ${name}`);button.setAttribute('aria-checked','false');button.disabled=true;
 right.append(state,button);row.append(left,right);list.append(row);switches.set(id,button);labels.set(id,state);
}
let generation=0;
let garminConnected=false;
let garminOAuthAvailable=false;
let garminConnectUrl='';
function setGarminUI(connected,available){
 garminConnected=connected;garminOAuthAvailable=available;publishConnection(connected?'garmin':null);
 const btn=switches.get('garmin');btn.setAttribute('aria-checked',String(connected));btn.disabled=!auth.currentUser||(!available&&!connected);
 labels.get('garmin').textContent=connected?'Collegato':available?'Non collegato':'In preparazione';
}
async function refresh(){
 const id=++generation;
 const user=auth.currentUser;
 setGarminUI(false,false);
 if(!user){message.textContent='Accedi con Google per collegare i dispositivi.';publishConnection(null);return;}
 message.textContent='Verifica connessione Garmin…';
 try{
  const token=await user.getIdToken();
  const response=await fetch('/api/garmin/account-status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json();if(id!==generation)return;
  if(!response.ok)throw new Error(data.message||'Stato Garmin non disponibile');
  garminConnectUrl=typeof data.connectUrl==='string'&&data.connectUrl.startsWith('/')?data.connectUrl:'';
  setGarminUI(data.connected===true,data.oauthAvailable===true&&Boolean(garminConnectUrl));
  message.textContent=data.message||'';
  if(oldStatus)oldStatus.textContent=data.message||'';
 }catch(error){if(id===generation){message.textContent='Connessione non verificata: '+(error.message||'impossibile verificare lo stato.');publishConnection(null);}}
}
switches.get('garmin').addEventListener('click',()=>{
 if(garminConnected){if(!window.confirm('Vuoi scollegare il tuo account Garmin da Runner Pulse?'))return;void (async()=>{try{const token=await auth.currentUser.getIdToken();const response=await fetch('/api/garmin/disconnect',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.message||'Scollegamento non riuscito');await refresh();}catch(error){message.textContent=error.message||'Scollegamento non riuscito';}})();return;}
 if(!garminOAuthAvailable||!garminConnectUrl){message.textContent='Autorizzazione Garmin non ancora disponibile.';return;}
 void (async()=>{try{const token=await auth.currentUser.getIdToken();const response=await fetch(garminConnectUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok||!data.authorizationUrl)throw new Error(data.message||'Autorizzazione Garmin non disponibile');window.location.assign(data.authorizationUrl);}catch(error){message.textContent=error.message||'Connessione non riuscita';}})();
});
onAuthStateChanged(auth,()=>void refresh());
window.addEventListener('focus',()=>{if(auth.currentUser)void refresh();});
window.addEventListener('runnerpulse:device-refresh',()=>void refresh());

const garminReturn=new URLSearchParams(window.location.search).get('garmin');
if(garminReturn){message.textContent=garminReturn==='connected'?'Garmin autorizzato! Verifica in corso…':garminReturn==='denied'?'Autorizzazione Garmin annullata.':'Collegamento Garmin non completato: '+garminReturn;history.replaceState(null,'',window.location.pathname);}

// Il riepilogo tecnico della sincronizzazione resta disponibile sul server,
// ma non viene mostrato nel Profilo. La connessione Garmin resta attiva.
