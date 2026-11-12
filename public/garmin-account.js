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
const connectionDot=document.getElementById('rp-watch-connection-dot');
let connectionState='unknown';
function publishConnection(service){
 const name=service==='garmin'?'Garmin Connect':service==='polar'?'Polar Flow':service==='suunto'?'Suunto App':service==='samsung'?'Samsung Health':'';
 window.runnerPulseConnectedService=service||null;
 if(caption)caption.textContent=name||'';
 if(watchHint)watchHint.textContent='Tocca per gestire';
 if(watchButton){watchButton.title='Gestisci dispositivi nel Profilo';watchButton.setAttribute('aria-label','Apri dispositivi nel Profilo');}
 if(watchActions)watchActions.hidden=true;
 if(connectionDot){const connected=Boolean(service);connectionDot.dataset.connected=String(connected);connectionDot.dataset.checking=String(connectionState==='unknown');connectionDot.dataset.status=connectionState;connectionDot.title=connectionState==='unknown'?'Connessione temporaneamente non verificabile':connected?'Orologio collegato':'Orologio non collegato';connectionDot.setAttribute('aria-label','Stato connessione orologio: '+(connectionState==='unknown'?'non verificabile':connected?'collegato':'non collegato'));}
 if(!service){if(watchText){watchText.textContent='';watchText.hidden=true;}if(watchPercent){watchPercent.textContent='';watchPercent.hidden=true;}}
 else {if(watchText)watchText.hidden=false;if(watchPercent)watchPercent.hidden=service!=='garmin';if(service!=='garmin'&&watchText)watchText.textContent='Orologio collegato';}
 window.dispatchEvent(new CustomEvent('runnerpulse:device-status',{detail:{service:service||null}}));
}
watchButton?.addEventListener('click',event=>{event.stopImmediatePropagation();document.querySelector('nav button[data-page="settings"]')?.click();requestAnimationFrame(()=>section.scrollIntoView({behavior:'smooth',block:'start'}));},true);
publishConnection(null);
const style=document.createElement('style');
style.textContent=`.rp-device-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 2px;border-bottom:1px solid #ffffff30}.rp-device-name{font-weight:750}.rp-device-sub{font-size:12px;opacity:.72;margin-top:3px}.rp-device-right{display:flex;align-items:center;gap:10px}.rp-device-state{font-size:12px;opacity:.8;text-align:right}.rp-device-switch{position:relative;width:48px;height:28px;border-radius:30px;border:0;background:#aeb5bd;flex-shrink:0;cursor:pointer;transition:background .2s}.rp-device-switch::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:white;transition:transform .2s;box-shadow:0 1px 4px #0003}.rp-device-switch[aria-checked="true"]{background:#19c953}.rp-device-switch[aria-checked="true"]::after{transform:translateX(20px)}.rp-device-switch:disabled{cursor:not-allowed;opacity:1}.rp-device-switch[data-status=unknown]{background:#f59e0b!important}.rp-device-state[data-status=unknown]{color:#ffbd69;opacity:1}`;
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
 connectionState=connected?'connected':'disconnected';
 garminConnected=connected;garminOAuthAvailable=available;publishConnection(connected?'garmin':null);
 const btn=switches.get('garmin');btn.dataset.status=connectionState;btn.setAttribute('aria-checked',String(connected));btn.disabled=!auth.currentUser||(!available&&!connected);
 labels.get('garmin').dataset.status=connectionState;labels.get('garmin').textContent=connected?'Collegato':available?'Non collegato':'In preparazione';
}
function showUnknown(reason){
 connectionState='unknown';
 const btn=switches.get('garmin');btn.dataset.status='unknown';btn.disabled=true;btn.setAttribute('aria-checked','false');
 labels.get('garmin').dataset.status='unknown';labels.get('garmin').textContent='Non verificabile';
 if(connectionDot){connectionDot.dataset.status='unknown';connectionDot.dataset.checking='true';connectionDot.title='Connessione temporaneamente non verificabile';connectionDot.setAttribute('aria-label','Stato connessione orologio: non verificabile');}
 message.textContent='Connessione temporaneamente non verificabile'+(reason?': '+reason:'. Riprova più tardi.')+' Non scollegare il dispositivo.';
 if(oldStatus)oldStatus.textContent=message.textContent;
}
async function refresh(){
 const id=++generation;
 const user=auth.currentUser;
 if(!user){connectionState='disconnected';setGarminUI(false,false);message.textContent='Accedi con Google per collegare i dispositivi.';return;}
 showUnknown('verifica in corso');
 message.textContent='Verifica connessione del servizio…';
 try{
  const token=await user.getIdToken();
  const response=await fetch('/api/garmin/account-status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json();if(id!==generation)return;
  if(!response.ok)throw new Error(data.message||'Stato Garmin non disponibile');
  garminConnectUrl=typeof data.connectUrl==='string'&&data.connectUrl.startsWith('/')?data.connectUrl:'';
  setGarminUI(data.connected===true,data.oauthAvailable===true&&Boolean(garminConnectUrl));
  message.textContent=data.connected===true?'Dispositivo collegato. Verifica sincronizzazione ufficiale…':'Nessun dispositivo collegato. Scegli un servizio dall’elenco per iniziare.';
  if(data.connected===true){
   try{
    const statusResponse=await fetch('/api/garmin/official-sync-status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(!statusResponse.ok)throw new Error('Stato sincronizzazione non disponibile');
    const status=await statusResponse.json();
    if(id!==generation)return;
    if(status.status!=='identity_verified'&&status.status!=='receiving'){
     const verifyResponse=await fetch('/api/garmin/official-verify',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
     const verified=await verifyResponse.json();
     if(!verifyResponse.ok)throw new Error(verified.message||'Verifica Garmin non riuscita');
    }
    if(id===generation)message.textContent='Garmin collegato. Sincronizzazione ufficiale in attesa delle nuove attività.';
   }catch(verifyError){if(id===generation)message.textContent='Garmin collegato, ma sincronizzazione non verificata: '+(verifyError.message||'riprova più tardi');}
  }
  if(oldStatus)oldStatus.textContent=message.textContent;
 }catch(error){if(id===generation)showUnknown(error.message||'impossibile verificare lo stato');}
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

// Etichette dell'interfaccia: i riferimenti al fornitore sono dinamici.
// Le scelte nella lista dei servizi restano esplicite per consentire il collegamento.
const originalVisibleText=new WeakMap();
let brandingScheduled=false;
function refreshVisibleBranding(){
 const service=window.runnerPulseConnectedService;
 const displayName=service==='garmin'?'Garmin':service==='polar'?'Polar':service==='suunto'?'Suunto':service==='samsung'?'Samsung':'';
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 const nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){
  const parent=node.parentElement;
  if(!parent||parent.closest('#rp-connected-devices, .rp-garmin-account, script, style, noscript, [hidden], #rp-sync-text, #rp-sync-percent'))continue;
  const current=node.nodeValue;
  if(!originalVisibleText.has(node)){
   if(!/garmin/i.test(current))continue;
   originalVisibleText.set(node,current);
  }else if(current!==originalVisibleText.get(node)&&!/garmin/i.test(current)&&!displayName)continue;
  const original=originalVisibleText.get(node);
  const replacement=original.replace(/Garmin Connect/gi,displayName?`${displayName} Connect`:'servizio collegato').replace(/Garmin/gi,displayName||'servizio');
  if(current!==replacement)node.nodeValue=replacement;
 }
}
function scheduleBranding(){if(brandingScheduled)return;brandingScheduled=true;requestAnimationFrame(()=>{brandingScheduled=false;refreshVisibleBranding();});}
window.addEventListener('runnerpulse:device-status',scheduleBranding);
new MutationObserver(scheduleBranding).observe(document.body,{childList:true,subtree:true,characterData:true});
scheduleBranding();
