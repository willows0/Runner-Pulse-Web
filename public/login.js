import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const firebaseConfig={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',storageBucket:'runnerpulse.firebasestorage.app',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const ALLOWED_EMAIL='utrefiletti@gmail.com';
const auth=getAuth(initializeApp(firebaseConfig));
const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
const gate=document.createElement('section');gate.id='rp-login-gate';gate.innerHTML='<div class="rp-login-card"><div class="rp-login-heart">♥</div><h1>Runner Pulse</h1><p>Accedi con il tuo account Google per continuare.</p><button id="rp-login-button" type="button">Accedi con Google</button><p id="rp-login-error" role="alert"></p></div>';
document.body.prepend(gate);
const button=document.getElementById('rp-login-button');const errorEl=document.getElementById('rp-login-error');const showError=e=>{errorEl.textContent=e?.message||String(e)};
button.addEventListener('click',async()=>{button.disabled=true;errorEl.textContent='';try{await signInWithPopup(auth,provider)}catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){try{await signInWithRedirect(auth,provider)}catch(err){showError(err)}}else showError(e)}finally{button.disabled=false}});
getRedirectResult(auth).catch(showError);
const settings=document.querySelector('#settings');if(settings){const card=document.createElement('div');card.className='card';card.innerHTML='<h3>Verifica collegamento Garmin</h3><p class="muted">Testa la connessione usando il tuo accesso Google. Non vengono creati dati fittizi.</p><button type="button" id="rp-garmin-test" style="width:100%;padding:14px;border:0;border-radius:13px;background:#f36b08;color:#fff;font-weight:700">Verifica Garmin</button><p id="rp-garmin-result" class="note" role="status"></p>';settings.append(card);const testButton=card.querySelector('#rp-garmin-test');const result=card.querySelector('#rp-garmin-result');testButton.addEventListener('click',async()=>{testButton.disabled=true;result.textContent='Verifica in corso…';try{const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL)throw Error('Accedi con il tuo account Google autorizzato.');const token=await user.getIdToken();const response=await fetch('/api/garmin/test',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();result.textContent=data.message||`Risposta HTTP ${response.status}`}catch(e){result.textContent=e.message||String(e)}finally{testButton.disabled=false}})}
const importBtn=document.getElementById('importGarmin'),homeBtn=document.getElementById('homeImport'),importResult=document.getElementById('importResult');
async function importGarmin(){if(!importBtn||!importResult)return;importBtn.disabled=true;if(homeBtn)homeBtn.disabled=true;importResult.textContent='Importazione Garmin in corso…';try{const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL||!user.emailVerified)throw Error('Accedi con il tuo account Google autorizzato.');const token=await user.getIdToken();const response=await fetch('/api/garmin/activities',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||`Errore HTTP ${response.status}`);if(!Array.isArray(data.activities))throw Error('Il server non ha restituito un elenco valido di attività.');window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data',{detail:data}))}catch(e){importResult.textContent='Importazione non riuscita: '+(e.message||String(e))}finally{importBtn.disabled=false;if(homeBtn)homeBtn.disabled=false}}
if(importBtn)importBtn.addEventListener('click',importGarmin);
if(homeBtn)homeBtn.addEventListener('click',()=>{document.querySelector('nav button[data-page="activities"]')?.click();importGarmin()});
onAuthStateChanged(auth,async user=>{const allowed=Boolean(user&&user.email?.toLowerCase()===ALLOWED_EMAIL&&user.emailVerified);document.body.classList.toggle('rp-authenticated',allowed);if(user&&!allowed){showError('Questo account Google non è autorizzato a utilizzare Runner Pulse.');await signOut(auth)}});

// Grafici Garmin: recupero on-demand, senza modificare gli allenamenti salvati.
const chartCss=document.createElement('style');chartCss.textContent=`.rp-detail-charts{background:#fff;color:#30251e;margin:18px 0;padding:16px;border-radius:18px;border:1px solid #f8ddc9}.rp-detail-charts h3{color:#ce5200;margin:4px 0 12px}.rp-detail-charts .rp-chart{margin:16px 0;padding:12px;border:1px solid #f3e1d4;border-radius:14px}.rp-detail-charts svg{display:block;width:100%;height:auto}.rp-detail-charts table{width:100%;border-collapse:collapse;font-size:12px}.rp-detail-charts th,.rp-detail-charts td{padding:7px 4px;border-bottom:1px solid #f3e1d4;text-align:left}.rp-detail-charts .rp-hint{font-size:13px;color:#796b60}`;document.head.append(chartCss);
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs={}){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el}
function metricName(d){return String(d?.key||d?.name||d?.metricName||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function extractMetrics(detail){
  const descriptors=detail?.metricDescriptors||detail?.activityDetailMetrics?.metricDescriptors||[];
  const samples=detail?.activityDetailMetrics||detail?.metrics||[];
  const rows=Array.isArray(samples)?samples:Array.isArray(samples?.metrics)?samples.metrics:[];
  if(!Array.isArray(descriptors)||!Array.isArray(rows))return [];
  return rows.map((r,i)=>{const vals=Array.isArray(r)?r:Array.isArray(r?.metrics)?r.metrics:[];const obj={index:i};descriptors.forEach((d,j)=>{const n=metricName(d);const v=Number(vals[j]);if(n&&vals[j]!==null&&vals[j]!==undefined&&Number.isFinite(v))obj[n]=v});return obj});
}
function findSeries(rows,names){for(const name of names){const values=rows.map(r=>r[name]??null);if(values.filter(v=>Number.isFinite(v)).length>=2)return values}return null}
function drawSeries(parent,title,values,color,convert=(v)=>v,unit=''){
  const card=document.createElement('div');card.className='rp-chart';const h=document.createElement('h4');h.textContent=title;card.append(h);
  if(!values){const p=document.createElement('p');p.className='rp-hint';p.textContent='Dati dettagliati non disponibili per questo grafico.';card.append(p);parent.append(card);return}
  const points=values.map((v,i)=>Number.isFinite(v)?{i,v:convert(v)}:null).filter(p=>p&&Number.isFinite(p.v));
  if(points.length<2){card.append('Dati insufficienti.');parent.append(card);return}
  const svg=svgEl('svg',{viewBox:'0 0 340 180',role:'img','aria-label':title});const min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v));const pad=Math.max((max-min)*.12,.1);const lo=min-pad,hi=max+pad;
  for(let k=0;k<4;k++){const y=18+k*43;svg.append(svgEl('line',{x1:34,y1:y,x2:332,y2:y,stroke:'#f1e3d8'}));const label=svgEl('text',{x:30,y:y+4,'text-anchor':'end','font-size':10,fill:'#74685e'});label.textContent=(hi-(hi-lo)*k/3).toFixed(0);svg.append(label)}
  let segment=[];const flush=()=>{if(segment.length>1)svg.append(svgEl('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));segment=[]};
  values.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return}const converted=convert(v);if(!Number.isFinite(converted)){flush();return}segment.push(`${34+i/Math.max(1,values.length-1)*298},${153-(converted-lo)/(hi-lo)*135}`)});flush();card.append(svg);
  const p=document.createElement('p');p.className='rp-hint';p.textContent=`Min ${min.toFixed(1)}${unit} · Max ${max.toFixed(1)}${unit} · ${points.length} campioni`;card.append(p);parent.append(card)
}
function renderSplits(container,splits){const raw=Array.isArray(splits)?splits:Array.isArray(splits?.lapDTOs)?splits.lapDTOs:Array.isArray(splits?.splits)?splits.splits:[];const section=document.createElement('div');section.className='rp-chart';const h=document.createElement('h4');h.textContent='Lap / intermedi';section.append(h);if(!raw.length){section.append('Lap non disponibili dal servizio Garmin.');container.append(section);return}const table=document.createElement('table');const head=document.createElement('tr');['Lap','Distanza','Durata','Passo'].forEach(s=>{const th=document.createElement('th');th.textContent=s;head.append(th)});table.append(head);raw.slice(0,100).forEach((lap,i)=>{const km=Number(lap.distance??lap.distanceMeters)/1000;const sec=Number(lap.duration??lap.elapsedDuration??lap.movingDuration);const tr=document.createElement('tr');const cells=[String(i+1),Number.isFinite(km)?km.toFixed(2)+' km':'—',Number.isFinite(sec)?(sec/60).toFixed(1)+' min':'—',km>0&&sec>0?`${Math.floor(sec/km/60)}:${String(Math.round(sec/km)%60).padStart(2,'0')} /km`:'—'];cells.forEach(s=>{const td=document.createElement('td');td.textContent=s;tr.append(td)});table.append(tr)});section.append(table);container.append(section)}
let detailRequest=0;
async function loadDetailForActivity(activity){
  const content=document.getElementById('detailContent');if(!content)return;
  const prior=content.querySelector('.rp-detail-charts');if(prior)prior.remove();
  if(activity?.source!=='garmin'||!/^[0-9]{1,20}$/.test(String(activity.garminId||'')))return;
  const request=++detailRequest;const panel=document.createElement('div');panel.className='rp-detail-charts';panel.innerHTML='<h3>Grafici Garmin</h3><p class="rp-hint" role="status">Caricamento dei dati dettagliati…</p>';content.append(panel);
  try{
    const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL||!user.emailVerified)throw Error('Accedi con Google per caricare i grafici.');
    const token=await user.getIdToken();const response=await fetch('/api/garmin/activity-detail',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({activityId:activity.garminId})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||`Errore HTTP ${response.status}`);
    if(request!==detailRequest||document.getElementById('detailOverlay')?.hidden)return;
    panel.replaceChildren();const title=document.createElement('h3');title.textContent='Grafici Garmin';panel.append(title);
    const rows=extractMetrics(data.detail);const heart=findSeries(rows,['heartrate','heartRate'.toLowerCase(),'heartRateBpm'.toLowerCase(),'directheartrate']);
    const speed=findSeries(rows,['speed','enhancedspeed','velocity']);const altitude=findSeries(rows,['elevation','altitude','enhancedaltitude']);const cadence=findSeries(rows,['runcadence','cadence','runningcadence']);
    drawSeries(panel,'❤️ Frequenza cardiaca',heart,'#e03a44',v=>v,' bpm');
    drawSeries(panel,'📈 Passo',speed,'#2486db',v=>v>0?1000/v/60:NaN,' min/km');
    drawSeries(panel,'🏔️ Altitudine',altitude,'#2a9961',v=>v,' m');
    drawSeries(panel,'👟 Cadenza',cadence,'#ee7a1d',v=>v,' spm');
    renderSplits(panel,data.splits);
    const note=document.createElement('p');note.className='rp-hint';note.textContent='I grafici mostrano soltanto i campioni effettivamente ricevuti. Le unità di velocità e distanza sono interpretate secondo il formato Garmin previsto; eventuali metriche non disponibili non vengono stimate.';panel.append(note)
  }catch(err){if(request!==detailRequest)return;panel.replaceChildren();const h=document.createElement('h3');h.textContent='Grafici Garmin';const p=document.createElement('p');p.className='rp-hint';p.textContent='Dati dettagliati non disponibili: '+(err.message||String(err));panel.append(h,p)}
}
// La lista attività è ricreata da app.js: l'evento delegato resta valido dopo le importazioni.
document.getElementById('activityList')?.addEventListener('click',event=>{const target=event.target.closest('button.activity-open');if(!target)return;const buttons=[...document.querySelectorAll('#activityList button.activity-open')];const index=buttons.indexOf(target);if(index<0)return;try{const activities=JSON.parse(localStorage.getItem('runnerPulseActivitiesV1')||'[]');if(Array.isArray(activities))loadDetailForActivity(activities[index])}catch{}});
document.getElementById('closeDetail')?.addEventListener('click',()=>{detailRequest++});
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const firebaseConfig={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',storageBucket:'runnerpulse.firebasestorage.app',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const ALLOWED_EMAIL='utrefiletti@gmail.com';
const auth=getAuth(initializeApp(firebaseConfig));
const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
const gate=document.createElement('section');gate.id='rp-login-gate';gate.innerHTML='<div class="rp-login-card"><div class="rp-login-heart">♥</div><h1>Runner Pulse</h1><p>Accedi con il tuo account Google per continuare.</p><button id="rp-login-button" type="button">Accedi con Google</button><p id="rp-login-error" role="alert"></p></div>';
document.body.prepend(gate);
const button=document.getElementById('rp-login-button');const errorEl=document.getElementById('rp-login-error');const showError=e=>{errorEl.textContent=e?.message||String(e)};
button.addEventListener('click',async()=>{button.disabled=true;errorEl.textContent='';try{await signInWithPopup(auth,provider)}catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){try{await signInWithRedirect(auth,provider)}catch(err){showError(err)}}else showError(e)}finally{button.disabled=false}});
getRedirectResult(auth).catch(showError);
const settings=document.querySelector('#settings');if(settings){const card=document.createElement('div');card.className='card';card.innerHTML='<h3>Verifica collegamento Garmin</h3><p class="muted">Testa la connessione usando il tuo accesso Google. Non vengono creati dati fittizi.</p><button type="button" id="rp-garmin-test" style="width:100%;padding:14px;border:0;border-radius:13px;background:#f36b08;color:#fff;font-weight:700">Verifica Garmin</button><p id="rp-garmin-result" class="note" role="status"></p>';settings.append(card);const testButton=card.querySelector('#rp-garmin-test');const result=card.querySelector('#rp-garmin-result');testButton.addEventListener('click',async()=>{testButton.disabled=true;result.textContent='Verifica in corso…';try{const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL)throw Error('Accedi con il tuo account Google autorizzato.');const token=await user.getIdToken();const response=await fetch('/api/garmin/test',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();result.textContent=data.message||`Risposta HTTP ${response.status}`}catch(e){result.textContent=e.message||String(e)}finally{testButton.disabled=false}})}
const importBtn=document.getElementById('importGarmin'),homeBtn=document.getElementById('homeImport'),importResult=document.getElementById('importResult');
async function importGarmin(){if(!importBtn||!importResult)return;importBtn.disabled=true;if(homeBtn)homeBtn.disabled=true;importResult.textContent='Importazione Garmin in corso…';try{const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL||!user.emailVerified)throw Error('Accedi con il tuo account Google autorizzato.');const token=await user.getIdToken();const response=await fetch('/api/garmin/activities',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||`Errore HTTP ${response.status}`);if(!Array.isArray(data.activities))throw Error('Il server non ha restituito un elenco valido di attività.');window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data',{detail:data}))}catch(e){importResult.textContent='Importazione non riuscita: '+(e.message||String(e))}finally{importBtn.disabled=false;if(homeBtn)homeBtn.disabled=false}}
if(importBtn)importBtn.addEventListener('click',importGarmin);
if(homeBtn)homeBtn.addEventListener('click',()=>{document.querySelector('nav button[data-page="activities"]')?.click();importGarmin()});
onAuthStateChanged(auth,async user=>{const allowed=Boolean(user&&user.email?.toLowerCase()===ALLOWED_EMAIL&&user.emailVerified);document.body.classList.toggle('rp-authenticated',allowed);if(user&&!allowed){showError('Questo account Google non è autorizzato a utilizzare Runner Pulse.');await signOut(auth)}});

// Grafici Garmin: recupero on-demand, senza modificare gli allenamenti salvati.
const chartCss=document.createElement('style');chartCss.textContent=`.rp-detail-charts{background:#fff;color:#30251e;margin:18px 0;padding:16px;border-radius:18px;border:1px solid #f8ddc9}.rp-detail-charts h3{color:#ce5200;margin:4px 0 12px}.rp-detail-charts .rp-chart{margin:16px 0;padding:12px;border:1px solid #f3e1d4;border-radius:14px}.rp-detail-charts svg{display:block;width:100%;height:auto}.rp-detail-charts table{width:100%;border-collapse:collapse;font-size:12px}.rp-detail-charts th,.rp-detail-charts td{padding:7px 4px;border-bottom:1px solid #f3e1d4;text-align:left}.rp-detail-charts .rp-hint{font-size:13px;color:#796b60}`;document.head.append(chartCss);
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs={}){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el}
function metricName(d){return String(d?.key||d?.name||d?.metricName||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function extractMetrics(detail){
  const descriptors=detail?.metricDescriptors||detail?.activityDetailMetrics?.metricDescriptors||[];
  const samples=detail?.activityDetailMetrics||detail?.metrics||[];
  const rows=Array.isArray(samples)?samples:Array.isArray(samples?.metrics)?samples.metrics:[];
  if(!Array.isArray(descriptors)||!Array.isArray(rows))return [];
  return rows.map((r,i)=>{const vals=Array.isArray(r)?r:Array.isArray(r?.metrics)?r.metrics:[];const obj={index:i};descriptors.forEach((d,j)=>{const n=metricName(d);const v=Number(vals[j]);if(n&&vals[j]!==null&&vals[j]!==undefined&&Number.isFinite(v))obj[n]=v});return obj});
}
function findSeries(rows,names){for(const name of names){const values=rows.map(r=>r[name]??null);if(values.filter(v=>Number.isFinite(v)).length>=2)return values}return null}
function drawSeries(parent,title,values,color,convert=(v)=>v,unit=''){
  const card=document.createElement('div');card.className='rp-chart';const h=document.createElement('h4');h.textContent=title;card.append(h);
  if(!values){const p=document.createElement('p');p.className='rp-hint';p.textContent='Dati dettagliati non disponibili per questo grafico.';card.append(p);parent.append(card);return}
  const points=values.map((v,i)=>Number.isFinite(v)?{i,v:convert(v)}:null).filter(p=>p&&Number.isFinite(p.v));
  if(points.length<2){card.append('Dati insufficienti.');parent.append(card);return}
  const svg=svgEl('svg',{viewBox:'0 0 340 180',role:'img','aria-label':title});const min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v));const pad=Math.max((max-min)*.12,.1);const lo=min-pad,hi=max+pad;
  for(let k=0;k<4;k++){const y=18+k*43;svg.append(svgEl('line',{x1:34,y1:y,x2:332,y2:y,stroke:'#f1e3d8'}));const label=svgEl('text',{x:30,y:y+4,'text-anchor':'end','font-size':10,fill:'#74685e'});label.textContent=(hi-(hi-lo)*k/3).toFixed(0);svg.append(label)}
  let segment=[];const flush=()=>{if(segment.length>1)svg.append(svgEl('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));segment=[]};
  values.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return}const converted=convert(v);if(!Number.isFinite(converted)){flush();return}segment.push(`${34+i/Math.max(1,values.length-1)*298},${153-(converted-lo)/(hi-lo)*135}`)});flush();card.append(svg);
  const p=document.createElement('p');p.className='rp-hint';p.textContent=`Min ${min.toFixed(1)}${unit} · Max ${max.toFixed(1)}${unit} · ${points.length} campioni`;card.append(p);parent.append(card)
}
function renderSplits(container,splits){const raw=Array.isArray(splits)?splits:Array.isArray(splits?.lapDTOs)?splits.lapDTOs:Array.isArray(splits?.splits)?splits.splits:[];const section=document.createElement('div');section.className='rp-chart';const h=document.createElement('h4');h.textContent='Lap / intermedi';section.append(h);if(!raw.length){section.append('Lap non disponibili dal servizio Garmin.');container.append(section);return}const table=document.createElement('table');const head=document.createElement('tr');['Lap','Distanza','Durata','Passo'].forEach(s=>{const th=document.createElement('th');th.textContent=s;head.append(th)});table.append(head);raw.slice(0,100).forEach((lap,i)=>{const km=Number(lap.distance??lap.distanceMeters)/1000;const sec=Number(lap.duration??lap.elapsedDuration??lap.movingDuration);const tr=document.createElement('tr');const cells=[String(i+1),Number.isFinite(km)?km.toFixed(2)+' km':'—',Number.isFinite(sec)?(sec/60).toFixed(1)+' min':'—',km>0&&sec>0?`${Math.floor(sec/km/60)}:${String(Math.round(sec/km)%60).padStart(2,'0')} /km`:'—'];cells.forEach(s=>{const td=document.createElement('td');td.textContent=s;tr.append(td)});table.append(tr)});section.append(table);container.append(section)}
let detailRequest=0;
async function loadDetailForActivity(activity){
  const content=document.getElementById('detailContent');if(!content)return;
  const prior=content.querySelector('.rp-detail-charts');if(prior)prior.remove();
  if(activity?.source!=='garmin'||!/^[0-9]{1,20}$/.test(String(activity.garminId||'')))return;
  const request=++detailRequest;const panel=document.createElement('div');panel.className='rp-detail-charts';panel.innerHTML='<h3>Grafici Garmin</h3><p class="rp-hint" role="status">Caricamento dei dati dettagliati…</p>';content.append(panel);
  try{
    const user=auth.currentUser;if(!user||user.email?.toLowerCase()!==ALLOWED_EMAIL||!user.emailVerified)throw Error('Accedi con Google per caricare i grafici.');
    const token=await user.getIdToken();const response=await fetch('/api/garmin/activity-detail',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({activityId:activity.garminId})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||`Errore HTTP ${response.status}`);
    if(request!==detailRequest||document.getElementById('detailOverlay')?.hidden)return;
    panel.replaceChildren();const title=document.createElement('h3');title.textContent='Grafici Garmin';panel.append(title);
    const rows=extractMetrics(data.detail);const heart=findSeries(rows,['heartrate','heartRate'.toLowerCase(),'heartRateBpm'.toLowerCase(),'directheartrate']);
    const speed=findSeries(rows,['speed','enhancedspeed','velocity']);const altitude=findSeries(rows,['elevation','altitude','enhancedaltitude']);const cadence=findSeries(rows,['runcadence','cadence','runningcadence']);
    drawSeries(panel,'❤️ Frequenza cardiaca',heart,'#e03a44',v=>v,' bpm');
    drawSeries(panel,'📈 Passo',speed,'#2486db',v=>v>0?1000/v/60:NaN,' min/km');
    drawSeries(panel,'🏔️ Altitudine',altitude,'#2a9961',v=>v,' m');
    drawSeries(panel,'👟 Cadenza',cadence,'#ee7a1d',v=>v,' spm');
    renderSplits(panel,data.splits);
    const note=document.createElement('p');note.className='rp-hint';note.textContent='I grafici mostrano soltanto i campioni effettivamente ricevuti. Le unità di velocità e distanza sono interpretate secondo il formato Garmin previsto; eventuali metriche non disponibili non vengono stimate.';panel.append(note)
  }catch(err){if(request!==detailRequest)return;panel.replaceChildren();const h=document.createElement('h3');h.textContent='Grafici Garmin';const p=document.createElement('p');p.className='rp-hint';p.textContent='Dati dettagliati non disponibili: '+(err.message||String(err));panel.append(h,p)}
}
// La lista attività è ricreata da app.js: l'evento delegato resta valido dopo le importazioni.
document.getElementById('activityList')?.addEventListener('click',event=>{const target=event.target.closest('button.activity-open');if(!target)return;const buttons=[...document.querySelectorAll('#activityList button.activity-open')];const index=buttons.indexOf(target);if(index<0)return;try{const activities=JSON.parse(localStorage.getItem('runnerPulseActivitiesV1')||'[]');if(Array.isArray(activities))loadDetailForActivity(activities[index])}catch{}});
document.getElementById('closeDetail')?.addEventListener('click',()=>{detailRequest++});
