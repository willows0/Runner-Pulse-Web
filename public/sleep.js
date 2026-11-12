import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId==='runnerpulse')||initializeApp(config),auth=getAuth(app);
const el=id=>document.getElementById(id);
let generation=0;
const duration=seconds=>`${Math.floor(seconds/3600)}h ${String(Math.floor((seconds%3600)/60)).padStart(2,'0')}m`;
function reset(message){el('rp-sleep-duration').textContent='—';el('rp-sleep-date').textContent='Dati non disponibili';el('rp-sleep-score').textContent='—';el('rp-sleep-judgement').textContent='Non disponibile';el('rp-sleep-coach-comment').textContent='';el('rp-sleep-ring').style.setProperty('--ring-color','#64748b');el('rp-sleep-bars').replaceChildren();el('rp-sleep-note').textContent=message;}
async function load(){
 const current=++generation,user=auth.currentUser;
 if(!user){reset('Accedi per visualizzare il sonno.');return;}
 try{
  const token=await user.getIdToken(),response=await fetch('/api/sleep/week',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const payload=await response.json();
  if(current!==generation||auth.currentUser?.uid!==user.uid)return;
  const days=Array.isArray(payload.days)?payload.days:[],available=days.filter(d=>Number.isFinite(d.seconds)&&d.seconds>=0),latest=available.at(-1);
  el('rp-sleep-duration').textContent=latest?duration(latest.seconds):'—';
  el('rp-sleep-date').textContent=latest?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(latest.date+'T12:00:00Z')):'Dati non disponibili';
  const judgement=latest?.coachJudgement||'Non disponibile';
  const colors={'Ottimo':'#22c55e','Buono':'#38bdf8','Discreto':'#f59e0b','Scarso':'#ef4444','Da migliorare':'#ef4444'};
  el('rp-sleep-score').textContent=Number.isInteger(latest?.coachScore)?String(latest.coachScore):'—';
  el('rp-sleep-judgement').textContent=judgement;
  el('rp-sleep-ring').style.setProperty('--ring-color',colors[judgement]||'#64748b');
  el('rp-sleep-coach-comment').textContent=latest?.coachComment||'La valutazione richiede durata, fasi del sonno e periodi di veglia disponibili.';
  const bars=el('rp-sleep-bars');bars.replaceChildren();
  const max=Math.max(1,...days.map(d=>Number.isFinite(d.seconds)?d.seconds:0));
  for(const day of days){
   const cell=document.createElement('div');cell.className='rp-steps-day';
   const bar=document.createElement('div');bar.className='rp-steps-bar'+(Number.isFinite(day.seconds)?'':' missing');
   bar.style.height=Number.isFinite(day.seconds)?Math.max(3,Math.round(day.seconds/max*104))+'px':'3px';
   bar.title=day.date+': '+(Number.isFinite(day.seconds)?duration(day.seconds):'Dati non disponibili');
   const label=document.createElement('span');label.textContent=new Intl.DateTimeFormat('it-IT',{weekday:'short',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z'));
   cell.append(bar,label);bars.append(cell);
  }
  el('rp-sleep-note').textContent=available.length?`Dati Garmin disponibili per ${available.length} giorni su 7.`:'Nessun riepilogo del sonno disponibile negli ultimi 7 giorni.';
 }catch(error){if(current===generation)reset('Impossibile leggere il sonno dal server ('+error.message+').');}
}
onAuthStateChanged(auth,load);
window.addEventListener('runnerpulse:garmin-connection',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
