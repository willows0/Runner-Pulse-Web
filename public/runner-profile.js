// Runner Pulse — Profilo permanente, account Google / Firebase.
import {getApps} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const form=document.getElementById('rp-profile-form');
const status=document.getElementById('rp-profile-status');
const app=getApps()[0];
const auth=app?getAuth(app):null;
let generation=0,loaded=false,dirty=false,saving=false,timer=null;
const fields=()=>[...form.querySelectorAll('[name]')];
async function request(action,profile){
 const user=auth?.currentUser;if(!user)throw new Error('Accesso Google non ancora pronto. Ricarica la pagina e riprova.');
 const token=await user.getIdToken();
 const response=await fetch('/api/coach/chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...(profile?{profile}:{})})});
 const contentType=response.headers.get('content-type')||'';if(!contentType.includes('application/json'))throw new Error('Il server non ha risposto correttamente (HTTP '+response.status+'). Verifica il deploy.');const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Errore nel salvataggio.');return data;
}
function snapshot(){return Object.fromEntries(fields().map(input=>[input.name,input.value.trim()]));}
function fill(profile={}){for(const input of fields())input.value=profile[input.name]??'';}
function age(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const birth=new Date(date+'T12:00:00');if(!Number.isFinite(birth.getTime()))return null;const now=new Date();let years=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))years--;return years>=10&&years<=110?years:null;}
let zoneBox=document.getElementById('rp-profile-zones');
if(form&&!zoneBox){zoneBox=document.createElement('div');zoneBox.id='rp-profile-zones';zoneBox.className='rp-profile-zones';const save=form.querySelector('[type=submit]');save?.before(zoneBox);}

function garminObservedPeak(){
 try {
  const uid=auth?.currentUser?.uid;if(!uid)return null;
  const key='runnerPulseActivitiesV1:uid:'+uid;
  const entries=JSON.parse(localStorage.getItem(key)||'[]');
  if(!Array.isArray(entries))return null;
  const values=entries.filter(a=>a?.source==='garmin' && /run|corsa|trail/i.test(String(a.kind||'')))
    .map(a=>Number(a.maxHR)).filter(v=>Number.isFinite(v)&&v>=100&&v<=220);
  return values.length?Math.max(...values):null;
 }catch{return null;}
}

function showZones(){
 if(!zoneBox)return;const p=snapshot(),years=age(p.birthDate),measured=Number(p.maxHR),rest=Number(p.restHR);
 const estimated=years!==null?Math.round(208-.7*years):null;
 const observed=garminObservedPeak();
 const max=p.maxHR&&measured>=100&&measured<=240?measured:estimated!==null?Math.max(estimated,observed||0):null;
 if(!max){zoneBox.textContent='Zone FC: inserisci la data di nascita o la FC massima per vedere una stima.';return;}
 const reserve=Boolean(p.restHR&&rest>=25&&rest<max-20);
 const bounds=[.5,.6,.7,.8,.9,1].map(f=>Math.round(reserve?rest+(max-rest)*f:max*f));
 zoneBox.replaceChildren();const title=document.createElement('strong');title.textContent='Le tue zone FC indicative';zoneBox.append(title);
 const note=document.createElement('p');note.textContent=(p.maxHR?'FC massima inserita':observed&&estimated!==null&&observed>estimated?'Soglia provvisoria: massimo tra stima dall’età e picco Garmin':'FC massima stimata dall’età')+(reserve?' · metodo Karvonen':' · % FC massima')+'. '+(observed?'Picco FC registrato nelle corse: '+observed+' bpm. ':'')+'Stime indicative: un picco non dimostra la vera FC massima. Aggiorna il Profilo dopo una misurazione affidabile.';zoneBox.append(note);
 const names=['Riscaldamento','Facile','Aerobico','Soglia','Massima'];
 for(let i=0;i<5;i++){const line=document.createElement('div');line.className='rp-profile-zone-line';line.textContent=`Zona ${i+1} · ${names[i]}: ${bounds[i]}–${bounds[i+1]} bpm`;zoneBox.append(line);}
}
async function load(user){const seq=++generation;loaded=false;dirty=false;clearTimeout(timer);fill();showZones();if(!user){status.textContent='Accedi con Google per caricare il profilo.';return;}
 status.textContent='Caricamento profilo salvato…';try{const result=await request('profile-get');if(seq!==generation)return;fill(result.profile||{});loaded=true;status.textContent='Profilo caricato. Le modifiche vengono salvate automaticamente.';showZones();}
 catch(error){if(seq!==generation)return;status.textContent=error.message+' Riprova aprendo nuovamente il Profilo.';}
}
async function save(){if(!loaded||!dirty||saving)return;const seq=generation;const profile=snapshot();dirty=false;saving=true;status.textContent='Salvataggio su Firebase…';try{
 await request('profile-save',profile);if(seq===generation)status.textContent='Profilo salvato e disponibile al Coach.';
 }catch(error){if(seq===generation){dirty=true;status.textContent='Non salvato: '+error.message+' Premi “Salva il mio profilo” per riprovare.';}}
 finally{saving=false;if(seq===generation&&dirty){clearTimeout(timer);timer=setTimeout(save,1200);}}
}
function schedule(){if(!loaded)return;dirty=true;showZones();clearTimeout(timer);timer=setTimeout(save,1100);}
window.runnerPulseProfileReady=Boolean(auth&&form);
form?.addEventListener('input',schedule);
form?.addEventListener('change',schedule);
form?.addEventListener('submit',event=>{event.preventDefault();if(!loaded){status.textContent='Attendi il caricamento del profilo.';return;}dirty=true;clearTimeout(timer);save();});
if(auth)onAuthStateChanged(auth,load);else if(status)status.textContent='Autenticazione non pronta. Aggiorna la pagina e riprova.';

window.addEventListener('runnerpulse:activities-changed',showZones);
window.addEventListener('runnerpulse:garmin-data',showZones);
