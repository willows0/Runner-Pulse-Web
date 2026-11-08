import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Runner Pulse: autenticazione Google e grafici basati solo su dati ricevuti.
const firebaseConfig = {
  apiKey: 'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',
  authDomain: 'runnerpulse.firebaseapp.com',
  projectId: 'runnerpulse',
  storageBucket: 'runnerpulse.firebasestorage.app',
  messagingSenderId: '602428716854',
  appId: '1:602428716854:web:1bd814e1ce8534fce6e597'
};
const OWNER_EMAIL = 'utrefiletti@gmail.com';
const isOwner = () => auth.currentUser?.email?.toLowerCase() === OWNER_EMAIL;
const auth = getAuth(initializeApp(firebaseConfig));
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const googleVerifiedUser = u => Boolean(u && (u.emailVerified || u.providerData?.some(p => p.providerId === 'google.com' && p.email?.toLowerCase() === u.email?.toLowerCase())));
const allowedUser = () => {
  const u = auth.currentUser;
  return u && googleVerifiedUser(u);
};
async function authorizedPost(endpoint, body) {
  if (!allowedUser()) throw new Error('Accedi con il tuo account Google autorizzato.');
  if(endpoint.startsWith('/api/garmin/')&&!isOwner())throw new Error('Garmin non disponibile per questo account.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))throw new Error(`Il server ha restituito una risposta non JSON (HTTP ${response.status}). Verifica che Render abbia pubblicato tutti i file.`);
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || `Errore HTTP ${response.status}`);
  return data;
}

const gate = document.createElement('section');
gate.id = 'rp-login-gate';
gate.innerHTML = '<div class="rp-login-card"><div class="rp-login-heart">♥</div><h1>Runner Pulse</h1><p>Accedi con il tuo account Google per continuare.</p><button id="rp-login-button" type="button">Accedi con Google</button><p id="rp-login-error" role="alert"></p></div>';
document.body.prepend(gate);
const loginButton = document.getElementById('rp-login-button');
const errorEl = document.getElementById('rp-login-error');
const showError = e => { errorEl.textContent = e?.message || String(e); };
loginButton.addEventListener('click', async () => {
  loginButton.disabled = true;
  errorEl.textContent = '';
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      try { await signInWithRedirect(auth, provider); } catch (err) { showError(err); }
    } else showError(e);
  } finally { loginButton.disabled = false; }
});
getRedirectResult(auth).catch(showError);
onAuthStateChanged(auth, async user => {
  const allowed = Boolean(user && googleVerifiedUser(user));
  document.body.classList.toggle('rp-authenticated', allowed);
  if(allowed){
    document.getElementById('importGarmin')?.toggleAttribute('disabled',!isOwner());
    document.getElementById('homeImport')?.toggleAttribute('disabled',!isOwner());
    document.getElementById('rp-garmin-test')?.toggleAttribute('disabled',!isOwner());
    window.dispatchEvent(new CustomEvent('runnerpulse:auth-user',{detail:{uid:user.uid,owner:isOwner()}}));
    if(isOwner()){void loadGarminArchive();void startAutoSync();}else{stopAutoSync();syncUI(null,'Garmin non collegato a questo profilo.');}
  }else{healthRequest++;resetHealth();window.dispatchEvent(new CustomEvent('runnerpulse:auth-user',{detail:null}));stopAutoSync();}
  if (user && !allowed) {
    showError('Accedi con un account Google verificato per utilizzare Runner Pulse.');
    await signOut(auth);
  }
});


// Salute Garmin: nessun dato di esempio, nessuna cache condivisa tra account.
let healthRequest=0;
// Garmin Personal API: interpretazione prudente dei campi realmente restituiti.
// I valori sono cercati per nome, anche dentro oggetti annidati; mai per posizione.
const healthFields={
  'rp-heart-value':[['heartRate','restingValue'],['heartRate','restingHeartRate'],['heartRate','restingHeartRateInBeatsPerMinute'],['restingHeartRate'],['restingHeartRateInBeatsPerMinute']],
  'rp-intensity-value':[['intensityMinutes','totalIntensityMinutes'],['intensityMinutes','intensityMinutes'],['totalIntensityMinutes']],
  'rp-steps-value':[['movement','totalSteps'],['movement','steps'],['totalSteps'],['steps']],
  'rp-calories-value':[['calories','burnedTotal'],['calories','totalKilocalories'],['calories','totalCalories'],['totalKilocalories'],['totalCalories']],
  'rp-stress-value':[['stress','avgLevel'],['stress','averageStressLevel'],['stress','avgStressLevel'],['averageStressLevel'],['avgStressLevel']],
  'rp-vo2-value':[['vo2Max','vo2MaxValue'],['vo2Max','value'],['vo2MaxValue']]
};
function numericGarminValue(value){
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value;
  if(typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0)return Number(value);
  return null;
}
function normalizedGarminKey(key){return String(key).replace(/[^a-z0-9]/gi,'').toLowerCase();}
function garminPath(obj,path){
  let current=obj;
  for(const key of path){
    if(!current||typeof current!=='object'||Array.isArray(current))return null;
    const actual=Object.keys(current).find(k=>normalizedGarminKey(k)===normalizedGarminKey(key));
    if(actual===undefined)return null;
    current=current[actual];
  }
  return numericGarminValue(current);
}
// Limita la ricerca ai campi semanticamente equivalenti, senza scegliere
// numeri arbitrari (es. obiettivi, timestamp, massimi al posto delle medie).
function namedGarminValue(obj,aliases,depth=0){
  if(!obj||typeof obj!=='object'||depth>4)return null;
  const entries=Object.entries(obj);
  for(const alias of aliases){
    const entry=entries.find(([key])=>normalizedGarminKey(key)===normalizedGarminKey(alias));
    if(entry){const value=numericGarminValue(entry[1]);if(value!==null)return value;}
  }
  for(const [key,value] of entries){
    if(['samples','history','events','timestamps'].includes(normalizedGarminKey(key)))continue;
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      const found=namedGarminValue(value,aliases,depth+1);
      if(found!==null)return found;
    }
  }
  return null;
}
const metricAliases={
  'rp-heart-value':['restingValue','restingHeartRate','restingHeartRateInBeatsPerMinute','restingHr','restingHeartRateBpm'],
  'rp-steps-value':['totalSteps','stepCount','steps'],
  'rp-calories-value':['burnedTotal','totalKilocalories','totalCalories','totalKcal','caloriesBurned'],
  'rp-stress-value':['avgLevel','averageStressLevel','avgStressLevel','averageStress','avgStress'],
  'rp-vo2-value':['vo2MaxValue','vo2MaxRunning','runningVo2Max']
};
function healthMetric(summary,paths,id){
  for(const path of paths){const value=garminPath(summary,path);if(value!==null)return value;}
  return id&&metricAliases[id]?namedGarminValue(summary,metricAliases[id]):null;
}
function intensityMetric(summary){
  // Garmin v2 uses moderate and vigorous; vigorous counts twice for intensity minutes.
  const section=summary?.intensityMinutes;
  if(section&&typeof section==='object'){
    const moderate=garminPath(section,['moderate']);
    const vigorous=garminPath(section,['vigorous']);
    if(moderate!==null||vigorous!==null)return (moderate??0)+2*(vigorous??0);
  }
  const direct=healthMetric(summary,healthFields['rp-intensity-value']);
  if(direct!==null)return direct;
  const moderate=namedGarminValue(summary,['moderateIntensityMinutes']);
  const vigorous=namedGarminValue(summary,['vigorousIntensityMinutes']);
  if(moderate!==null||vigorous!==null)return (moderate??0)+2*(vigorous??0);
  return null;
}
function sleepMetric(summary){
  return namedGarminValue(summary,['sleepingSeconds','totalSleepSeconds']);
}
function resetHealth(){
  for(const id of [...Object.keys(healthFields),'rp-sleep-value']){
    const el=document.getElementById(id);if(el)el.textContent='—';
  }
  const note=document.getElementById('rp-health-sync-status');if(note)note.textContent='Dati salute non disponibili.';
}
async function refreshGarminHealth(){
  const request=++healthRequest;
  if(!allowedUser()||!isOwner())return;
  const note=document.getElementById('rp-health-sync-status');
  if(note)note.textContent='Aggiornamento dati salute Garmin…';
  const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
  try{
    let result;
    try{
      result=await authorizedPost('/api/garmin/health-daily',{startDate:localDate(yesterday),endDate:localDate(now)});
    }catch(firstError){
      if(!/timeout|aborted|timed out/i.test(String(firstError?.message||firstError)))throw firstError;
      if(request!==healthRequest||!allowedUser()||!isOwner())return;
      result=await authorizedPost('/api/garmin/health-daily',{startDate:localDate(yesterday),endDate:localDate(now)});
    }
    if(request!==healthRequest||!allowedUser()||!isOwner())return;
    const summaries=result.data.filter(x=>x&&typeof x==='object').sort((a,b)=>String(b.calendarDate||'').localeCompare(String(a.calendarDate||'')));
    // Preferire il giorno più recente che contiene la metrica, senza combinarne le date.
    let count=0;
    for(const [id,keys] of Object.entries(healthFields)){
      const found=summaries.map(s=>id==='rp-intensity-value'?intensityMetric(s):healthMetric(s,keys,id)).find(v=>v!==null);
      if(found!==undefined){const el=document.getElementById(id);if(el){el.textContent=found.toLocaleString('it-IT',{maximumFractionDigits:1});count++;}}
    }
    const sleepSeconds=summaries.map(s=>sleepMetric(s)).find(v=>v!==null);
    if(sleepSeconds!==undefined){const el=document.getElementById('rp-sleep-value');if(el){el.textContent=(sleepSeconds/3600).toLocaleString('it-IT',{maximumFractionDigits:1})+' h';count++;}}
    if(note)note.textContent=count?`Dati reali Garmin disponibili: ${count} metriche. Le altre richiedono dati o endpoint dedicati.`:'Garmin ha risposto, ma non sono presenti metriche riconosciute nel riepilogo.';
  }catch(error){if(request===healthRequest&&note)note.textContent='Dati salute Garmin non disponibili: '+(error.message||String(error));}
}

// Importa automaticamente nel browser le attività già conservate su Firebase.
// La pagina Attività e la Home ricevono gli stessi eventi, senza richiedere
// all'utente di premere il pulsante di importazione.
let archiveLoading=false;
async function loadGarminArchive(){
  if(archiveLoading||!allowedUser()||!isOwner())return;
  archiveLoading=true;
  const expectedUid=auth.currentUser.uid;
  try{
    let after=null;
    for(let page=0;page<100;page++){
      const result=await authorizedPost('/api/garmin/archive',after?{after}:{});
      if(!allowedUser()||!isOwner()||auth.currentUser.uid!==expectedUid)break;
      if(result.activities?.length){
        window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data',{detail:{activities:result.activities,fromArchive:true}}));
      }
      if(!result.next)break;
      after=result.next;
    }
  }catch(error){console.warn('Archivio Garmin non disponibile:',error.message);}
  finally{archiveLoading=false;}
}
// Importazione automatica a blocchi: il progresso percentuale è mostrato solo
// quando Garmin ha terminato la scoperta delle attività (totale noto).
let syncActive=false,syncCancel=false;
const syncClock=document.getElementById('rp-sync-clock');
const syncRing=document.getElementById('rp-sync-ring');
const syncText=document.getElementById('rp-sync-text');
const syncPercent=document.getElementById('rp-sync-percent');
function syncUI(state,message){
  if(!syncClock||!syncRing||!syncText)return;
  const phase=state?.phase||'new',total=Number(state?.discovered)||0,done=Number(state?.processed)||0,failed=Number(state?.failed)||0;
  const complete=phase==='done'&&failed===0;
  const fraction=complete?1:phase==='details'&&total?Math.min(.99,done/total):0;
  syncRing.style.strokeDashoffset=String(119.38*(1-fraction));
  syncClock.classList.toggle('rp-sync-complete',complete);
  syncClock.classList.toggle('rp-sync-running',syncActive);
  syncClock.classList.toggle('rp-sync-error',phase==='partial'||Boolean(message));
  const label=message|| (complete?`Sincronizzato: ${total} attività Garmin.`:phase==='partial'?`Importazione parziale: ${failed} dettagli non disponibili.`:phase==='discover'?`Ricerca dello storico Garmin: ${total} attività trovate…`:phase==='details'?`Sincronizzazione ${done} di ${total} attività (${Math.floor(done/total*100)||0}%).`:'In attesa della sincronizzazione.');
  syncText.textContent=label;
  if(syncPercent)syncPercent.textContent=complete?'100%':phase==='details'&&total?`${Math.min(99,Math.floor(done/total*100))}%`:phase==='partial'&&total?`${Math.min(100,Math.floor(done/total*100))}%`:'—';
  syncClock.title=label;syncClock.setAttribute('aria-label',label);
}
function stopAutoSync(){syncCancel=true;syncActive=false;syncUI(null,'Accedi con Google per sincronizzare Garmin.');}
async function startAutoSync(force=false){
  if(syncActive||!allowedUser()||!isOwner())return;
  syncActive=true;syncCancel=false;
  try{
    syncUI(null,'Verifica sincronizzazione Garmin in corso…');
    let state=(await authorizedPost('/api/garmin/sync-status',{})).state;
    if(force) syncUI(state,'Controllo Garmin…');
    else syncUI(state);
    // Non riscaricare 189 dettagli a ogni login: lo storico è già su Firestore.
    if(!force&&(state.phase==='done'||state.phase==='partial')){
      syncUI(state);await loadGarminArchive();return;
    }
    for(let steps=0;steps<100000&&!syncCancel&&allowedUser();steps++){
      const data=await authorizedPost('/api/garmin/sync-step',steps===0&&force?{restart:true}:{});
      state=data.state;syncUI(state);
      if(Array.isArray(data.activities)&&data.activities.length){window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data',{detail:{activities:data.activities}}));}
      if(state.phase==='done'||state.phase==='partial'){await loadGarminArchive();break;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }catch(e){if(!syncCancel)syncUI(null,'Sincronizzazione interrotta: '+(e.message||String(e)));}
  finally{syncActive=false;syncClock?.classList.remove('rp-sync-running');}
}
syncClock?.addEventListener('click',()=>{
  if(!allowedUser()||!isOwner()){syncUI(null,'Garmin disponibile soltanto per il proprietario.');return;}
  if(syncActive){syncText.textContent='Sincronizzazione Garmin già in corso…';return;}
  void checkNewGarminActivities();
});

// Aggiornamento incrementale solo su richiesta: conserva lo storico esistente.
let checkingNew=false;
async function checkNewGarminActivities(){
  if(checkingNew||!allowedUser()||!isOwner())return;
  const button=document.getElementById('rp-check-new-activities');
  const output=document.getElementById('rp-new-activities-result');
  checkingNew=true;if(button)button.disabled=true;
  if(output)output.textContent='Controllo nuove attività Garmin in corso…';
  try{
    const result=await authorizedPost('/api/garmin/check-new',{});
    if(output)output.textContent=result.added?`${result.added} nuove attività salvate. Nessun duplicato.`:'Nessuna nuova attività. Lo storico è già aggiornato.';
    if(syncText)syncText.textContent=result.added?`Aggiornamento completato: ${result.added} nuove attività.`:'Garmin aggiornato: nessuna nuova attività.';
    await loadGarminArchive();
  }catch(error){if(output)output.textContent='Controllo non riuscito: '+(error.message||String(error));}
  finally{checkingNew=false;if(button)button.disabled=false;}
}
document.getElementById('rp-check-new-activities')?.addEventListener('click',()=>void checkNewGarminActivities());
const settings = document.getElementById('settings');
if (settings) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h3>Verifica collegamento Garmin</h3><p class="muted">Testa la connessione usando il tuo accesso Google. Non vengono creati dati fittizi.</p><button type="button" id="rp-garmin-test" style="width:100%;padding:14px;border:0;border-radius:13px;background:#f36b08;color:#fff;font-weight:700">Verifica Garmin</button><p id="rp-garmin-result" class="note" role="status"></p>';
  settings.append(card);
  const testButton = card.querySelector('#rp-garmin-test');
  const result = card.querySelector('#rp-garmin-result');
  testButton.addEventListener('click', async () => {
    testButton.disabled = true;
    result.textContent = 'Verifica in corso…';
    try { const data = await authorizedPost('/api/garmin/test'); result.textContent = data.message || 'Verifica riuscita.'; }
    catch (e) { result.textContent = e.message || String(e); }
    finally { testButton.disabled = false; }
  });
}
const importBtn = document.getElementById('importGarmin');
const homeBtn = document.getElementById('homeImport');
const importResult = document.getElementById('importResult');
async function importGarmin() {
  if (!importBtn || !importResult) return;
  if(!isOwner()){importResult.textContent='Garmin non collegato a questo profilo.';return;}
  importBtn.disabled = true;
  if (homeBtn) homeBtn.disabled = true;
  importResult.textContent = 'Importazione Garmin in corso…';
  try {
    const data = await authorizedPost('/api/garmin/activities');
    if (!Array.isArray(data.activities)) throw new Error('Il server non ha restituito un elenco valido di attività.');
    window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data', { detail: data }));
  } catch (e) { importResult.textContent = 'Importazione non riuscita: ' + (e.message || String(e)); }
  finally { importBtn.disabled = false; if (homeBtn) homeBtn.disabled = false; }
}
importBtn?.addEventListener('click', importGarmin);
homeBtn?.addEventListener('click', () => {
  document.querySelector('nav button[data-page="activities"]')?.click();
  void importGarmin();
});

// Grafici: sfondo bianco, accenti arancioni. Nessuna modifica ai dati salvati.
const chartCss = document.createElement('style');
chartCss.textContent = `
.rp-detail-charts{background:#142840;color:#fff;margin:18px 0;padding:16px;border-radius:18px;border:1px solid #f8ddc9}
.rp-detail-charts h3{color:#ffad65;margin:4px 0 12px}
.rp-detail-charts .rp-chart{background:#203c5c;color:#fff;margin:16px 0;padding:12px;border:1px solid #48617b;border-radius:14px}
.rp-detail-charts .rp-chart h4{color:#ffad65;margin:0 0 12px}
.rp-detail-charts svg{display:block;width:100%;height:auto}
.rp-detail-charts table{width:100%;border-collapse:collapse;font-size:12px}
.rp-detail-charts th,.rp-detail-charts td{padding:7px 4px;border-bottom:1px solid #48617b;text-align:left}
.rp-detail-charts .rp-hint{font-size:13px;color:#d0deed;line-height:1.45}
.rp-detail-charts .rp-chart-scroll{overflow-x:auto}
`;
document.head.append(chartCss);
const svgNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
const normalize = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const numeric = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
function descriptorName(d) {
  if (typeof d === 'string') return normalize(d);
  return normalize(d?.key || d?.name || d?.metricName || d?.metricKey || d?.fieldName || d?.label);
}
function extractMetrics(detail) {
  const root = detail?.activityDetail || detail?.detail || detail;
  const descriptors = root?.metricDescriptors || root?.activityDetailMetrics?.metricDescriptors || [];
  const sampleContainer = root?.activityDetailMetrics || root?.metrics || [];
  const samples = Array.isArray(sampleContainer) ? sampleContainer :
    Array.isArray(sampleContainer?.metrics) ? sampleContainer.metrics :
    Array.isArray(sampleContainer?.samples) ? sampleContainer.samples : [];
  if (!samples.length) return [];
  return samples.map((sample, index) => {
    const row = { index };
    const values = Array.isArray(sample) ? sample : Array.isArray(sample?.metrics) ? sample.metrics : Array.isArray(sample?.values) ? sample.values : null;
    if (values && Array.isArray(descriptors)) {
      descriptors.forEach((descriptor, position) => {
        const name = descriptorName(descriptor);
        const metricIndex = Number.isInteger(Number(descriptor?.metricsIndex)) ? Number(descriptor.metricsIndex) :
          Number.isInteger(Number(descriptor?.metricIndex)) ? Number(descriptor.metricIndex) : position;
        const value = numeric(values[metricIndex]);
        if (name && value !== null) row[name] = value;
      });
    }
    // Alcune risposte Garmin espongono metriche direttamente come proprietà.
    if (sample && !Array.isArray(sample) && typeof sample === 'object') {
      for (const [key, value] of Object.entries(sample)) {
        if (key === 'metrics' || key === 'values') continue;
        const n = numeric(value);
        if (n !== null) row[normalize(key)] = n;
      }
    }
    return row;
  });
}
function findSeries(rows, names) {
  for (const name of names) {
    const key = normalize(name);
    const values = rows.map(row => row[key] ?? null);
    if (values.filter(Number.isFinite).length >= 2) return values;
  }
  return null;
}
function drawSeries(parent, title, values, convert = v => v, unit = '', zoneProfile = null) {
  const card = document.createElement('div'); card.className = 'rp-chart';
  const heading = document.createElement('h4'); heading.textContent = title; card.append(heading);
  if (!values) {
    const p = document.createElement('p'); p.className = 'rp-hint';
    p.textContent = 'Questa metrica non è presente nei campioni restituiti da Garmin.';
    card.append(p); parent.append(card); return;
  }
  const converted = values.map(v => Number.isFinite(v) ? convert(v) : null);
  const points = converted.map((v, i) => Number.isFinite(v) ? { i, v } : null).filter(Boolean);
  if (points.length < 2) { card.append('Dati validi insufficienti.'); parent.append(card); return; }
  const svg = svgEl('svg', { viewBox: '0 0 340 180', role: 'img', 'aria-label': title });
  const min = Math.min(...points.map(p => p.v));
  const max = Math.max(...points.map(p => p.v));
  const pad = Math.max((max - min) * .12, Math.abs(max) * .015, .1);
  const lo = min - pad, hi = max + pad;
  for (let k = 0; k < 4; k++) {
    const y = 18 + k * 45;
    svg.append(svgEl('line', { x1: 34, y1: y, x2: 332, y2: y, stroke: '#f1e3d8' }));
    const label = svgEl('text', { x: 30, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#74685e' });
    label.textContent = (hi - (hi - lo) * k / 3).toFixed(0); svg.append(label);
  }
  const zones = zoneProfile ? rpHrZones(zoneProfile) : null;
  let segment = [];
  const flush = () => {
    if (segment.length > 1) svg.append(svgEl('polyline', {
      points: segment.join(' '), fill: 'none', stroke: '#f36b08', 'stroke-width': 2.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    segment = [];
  };
  converted.forEach((v, i) => {
    if (!Number.isFinite(v)) { flush(); return; }
    segment.push(`${34 + i / Math.max(1, converted.length - 1) * 298},${153 - (v - lo) / (hi - lo) * 135}`);
  });
  flush();
  if (zones) {
    // Sovrappone segmenti colorati in base alla zona FC di ogni campione.
    // Nessun colore di zona è assegnato a campioni mancanti o non validi.
    const x = i => 34 + i / Math.max(1, converted.length - 1) * 298;
    const y = v => 153 - (v - lo) / (hi - lo) * 135;
    for (let i = 1; i < converted.length; i++) {
      const a = converted[i - 1], b = converted[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const zi = rpZoneIndex((a + b) / 2, zones);
      if (zi < 0) continue;
      svg.append(svgEl('line', {x1:x(i-1),y1:y(a),x2:x(i),y2:y(b),
        stroke:rpZoneColors[zi], 'stroke-width':3.3,'stroke-linecap':'round'}));
    }
    const legend = document.createElement('div'); legend.className = 'rp-hr-chart-legend';
    ['Z1','Z2','Z3','Z4','Z5'].forEach((name,i)=>{
      const item=document.createElement('span');item.className='rp-hr-chart-legend-item';
      const dot=document.createElement('i');dot.style.background=rpZoneColors[i];
      item.append(dot,document.createTextNode(name));legend.append(item);
    });
    card.append(legend);
    const method=document.createElement('p');method.className='rp-hint';
    method.textContent='Colori in base alle zone FC del Profilo · '+zones.method;
    card.append(method);
  }
  card.append(svg);
  const p = document.createElement('p'); p.className = 'rp-hint';
  p.textContent = `Min ${min.toFixed(1)}${unit} · Max ${max.toFixed(1)}${unit}`;
  card.append(p); parent.append(card);
}
function renderSplits(container, splits) {
  const raw = Array.isArray(splits) ? splits :
    Array.isArray(splits?.lapDTOs) ? splits.lapDTOs :
    Array.isArray(splits?.splits) ? splits.splits :
    Array.isArray(splits?.laps) ? splits.laps :
    Array.isArray(splits?.lapSummaries) ? splits.lapSummaries : [];
  const section = document.createElement('div'); section.className = 'rp-chart';
  const h = document.createElement('h4'); h.textContent = 'Lap / intermedi'; section.append(h);
  if (!raw.length) { section.append('Lap non disponibili nella risposta del servizio Garmin.'); container.append(section); return; }
  const scroll = document.createElement('div'); scroll.className = 'rp-chart-scroll';
  const table = document.createElement('table'); const head = document.createElement('tr');
  ['Lap', 'Distanza', 'Durata', 'Passo'].forEach(s => { const th = document.createElement('th'); th.textContent = s; head.append(th); });
  table.append(head);
  raw.slice(0, 100).forEach((lap, i) => {
    const meters = numeric(lap.distance ?? lap.distanceMeters);
    const seconds = numeric(lap.duration ?? lap.elapsedDuration ?? lap.movingDuration);
    const km = meters === null ? null : meters / 1000;
    const paceSeconds = km > 0 && seconds > 0 ? Math.round(seconds / km) : null;
    const cells = [String(i + 1), km !== null ? km.toFixed(2) + ' km' : '—', seconds !== null ? (seconds / 60).toFixed(1) + ' min' : '—', paceSeconds !== null ? `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, '0')} /km` : '—'];
    const tr = document.createElement('tr');
    cells.forEach(s => { const td = document.createElement('td'); td.textContent = s; tr.append(td); });
    table.append(tr);
  });
  scroll.append(table); section.append(scroll); container.append(section);
}
// Zone FC personali: percentuali calcolate soltanto quando esistono campioni reali Garmin.
// Le zone non cambiano automaticamente con il passo: cambiano quando il profilo viene aggiornato.
const rpZoneColors = ['#a9b9cf','#3c9dff','#1fbd76','#ffb84d','#f56b35'];
function rpAge(birthDate){if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate||''))return null;const born=new Date(birthDate+'T12:00:00');if(!Number.isFinite(born.getTime()))return null;const now=new Date();let age=now.getFullYear()-born.getFullYear();if(now.getMonth()<born.getMonth()||(now.getMonth()===born.getMonth()&&now.getDate()<born.getDate()))age--;return age>=12&&age<=100?age:null;}
function rpHrZones(profile){
 const age=rpAge(profile?.birthDate),measured=numeric(profile?.maxHR),rest=numeric(profile?.restHR);
 const estimated=age!==null?Math.round(208-.7*age):null;
 let observed=null;
 try {const uid=auth.currentUser?.uid;const items=uid?JSON.parse(localStorage.getItem('runnerPulseActivitiesV1:uid:'+uid)||'[]'):[];
  const peaks=Array.isArray(items)?items.filter(a=>a?.source==='garmin'&&/run|corsa|trail/i.test(String(a.kind||''))).map(a=>Number(a.maxHR)).filter(v=>Number.isFinite(v)&&v>=100&&v<=220):[];
  if(peaks.length)observed=Math.max(...peaks);
 }catch{}
 const hasMeasured=measured>=100&&measured<=240;
 const max=hasMeasured?measured:estimated===null?null:Math.max(estimated,observed||0);
 if(!max)return null;
 const useReserve=rest>=25&&rest<max-20;
 const bounds=[.5,.6,.7,.8,.9,1].map(p=>Math.round(useReserve?rest+(max-rest)*p:max*p));
 const method=(hasMeasured?'FC massima impostata nel Profilo':observed&&observed>estimated?'FC massima provvisoria: stima età confrontata con picco Garmin':'FC massima stimata dall’età (208 − 0,7 × età)')+(useReserve?' · riserva cardiaca (Karvonen)':' · percentuale FC massima');
 return {bounds,method,max,rest:useReserve?rest:null,observed};
}
function rpZoneIndex(hr,z){if(!Number.isFinite(hr)||hr<30||hr>240)return -1;const b=z.bounds;return hr<b[1]?0:hr<b[2]?1:hr<b[3]?2:hr<b[4]?3:4;}
function rpZoneLabel(i,z){const b=z.bounds;return i===0?`< ${b[1]} bpm`:i===4?`≥ ${b[4]} bpm`:`${b[i]}–${b[i+1]-1} bpm`;}
function rpZoneCard(parent,heart,rows,profile){const section=document.createElement('section');section.className='rp-hr-zones rp-chart';const h=document.createElement('h4');h.textContent='Tempo nelle zone di intensità';section.append(h);const z=rpHrZones(profile);const note=document.createElement('p');note.className='rp-hint';if(!z){note.textContent='Compila data di nascita oppure FC massima nel Profilo per definire le zone cardiache.';section.append(note);parent.append(section);return;}
 note.textContent=z.method+'. '+(z.observed?'Picco osservato nelle corse: '+z.observed+' bpm. ':'')+'Stime indicative; i picchi non equivalgono a una misurazione della FC massima.';section.append(note);
 if(!heart||heart.length<2){
  const p=document.createElement('p');p.className='rp-hint';p.textContent='Le zone sono calcolate dal Profilo. Garmin non ha fornito campioni FC sufficienti per mostrare minuti e percentuali di questa corsa.';section.append(p);
  const names=['Riscaldamento','Facile','Aerobico','Soglia','Massima'];
  for(let i=4;i>=0;i--){const row=document.createElement('div');row.className='rp-hr-zone';const label=document.createElement('div');label.className='rp-hr-zone-label';const title=document.createElement('strong');title.textContent=`Zona ${i+1} · ${names[i]}`;const range=document.createElement('span');range.textContent=rpZoneLabel(i,z);label.append(title,range);const line=document.createElement('div');line.className='rp-hr-zone-line';const track=document.createElement('div');track.className='rp-hr-zone-track';const fill=document.createElement('div');fill.className='rp-hr-zone-fill';fill.style.width='0%';fill.style.background=rpZoneColors[i];track.append(fill);const val=document.createElement('span');val.className='rp-hr-zone-value';val.textContent='—';line.append(track,val);row.append(label,line);section.append(row);}
  parent.append(section);return;
 }
 // I campioni possono essere irregolari: non equipariamo il numero di campioni ai secondi.
 const timeNames=['elapsedtime','elapsedtimems','timestamp','time','timerseconds','elapsedseconds','elapsedtimeinseconds'];let times=null;
 for(const key of timeNames){const candidate=rows.map(r=>numeric(r[key]));if(candidate.filter(Number.isFinite).length===rows.length&&candidate.length===heart.length&&candidate.every((v,i)=>i===0||v>=candidate[i-1])){times=candidate;break;}}
 let counts=[0,0,0,0,0],total=0,weighted=false;
 if(times){const deltas=times.slice(1).map((v,i)=>v-times[i]);const positive=deltas.filter(v=>v>0);const med=positive.length?positive.slice().sort((a,b)=>a-b)[Math.floor(positive.length/2)]:0;const scale=med>1000?1000:1;for(let i=0;i<heart.length-1;i++){const delta=(times[i+1]-times[i])/scale;if(!(delta>0&&delta<=120))continue;const zone=rpZoneIndex(heart[i],z);if(zone<0)continue;counts[zone]+=delta;total+=delta;}weighted=total>0;}
 if(!weighted){for(const hr of heart){const zone=rpZoneIndex(hr,z);if(zone>=0){counts[zone]++;total++;}}}
 if(!total){section.append('Campioni FC validi insufficienti.');parent.append(section);return;}
 const sub=document.createElement('p');sub.className='rp-hint';sub.textContent=weighted?'Durate calcolate dai campioni FC con intervalli temporali validi.':'Distribuzione dei campioni FC (non durata): Garmin non ha fornito tempi affidabili per ogni campione.';section.append(sub);
 const names=['Riscaldamento','Facile','Aerobico','Soglia','Massima'];for(let i=4;i>=0;i--){const pct=counts[i]/total*100;const row=document.createElement('div');row.className='rp-hr-zone';const label=document.createElement('div');label.className='rp-hr-zone-label';const title=document.createElement('strong');title.textContent=`Zona ${i+1} · ${names[i]}`;const range=document.createElement('span');range.textContent=rpZoneLabel(i,z);label.append(title,range);const line=document.createElement('div');line.className='rp-hr-zone-line';const track=document.createElement('div');track.className='rp-hr-zone-track';const fill=document.createElement('div');fill.className='rp-hr-zone-fill';fill.style.width=pct.toFixed(2)+'%';fill.style.background=rpZoneColors[i];track.append(fill);const val=document.createElement('span');val.className='rp-hr-zone-value';const secs=Math.round(counts[i]);val.textContent=(weighted?`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`:`${Math.round(counts[i])} camp.`)+` · ${Math.round(pct)}%`;line.append(track,val);row.append(label,line);section.append(row);}
 parent.append(section);
}
let detailRequest = 0;
async function loadDetailForActivity(activity) {
  const content = document.getElementById('detailContent');
  if (!content) return;
  content.querySelector('.rp-detail-charts')?.remove();
  if (activity?.source !== 'garmin' || !/^\d{1,20}$/.test(String(activity.garminId || ''))) return;
  const request = ++detailRequest;
  const panel = document.createElement('div'); panel.className = 'rp-detail-charts';
  panel.innerHTML = '<h3>Grafici</h3><p class="rp-hint" role="status">Caricamento dei dati dettagliati…</p>';
  content.append(panel);
  try {
    const data = await authorizedPost('/api/garmin/activity-detail', { activityId: activity.garminId });
    if (request !== detailRequest || document.getElementById('detailOverlay')?.hidden) return;
    panel.replaceChildren();
    const title = document.createElement('h3'); title.textContent = 'Grafici'; panel.append(title);
    const rows = extractMetrics(data.detail);
    const heart = findSeries(rows, ['heartrate', 'heartratebpm', 'directheartrate', 'hr']);
    const speed = findSeries(rows, ['speed', 'enhancedspeed', 'velocity', 'directspeed']);
    const altitude = findSeries(rows, ['elevation', 'altitude', 'enhancedaltitude', 'directelevation']);
    const cadence = findSeries(rows, ['directruncadence', 'runcadence', 'cadence', 'runningcadence', 'directcadence']);
    // Il grafico FC viene disegnato dopo il caricamento del profilo, per usare i colori delle zone.
    // Non disegnare prima una linea arancione che nasconde un eventuale errore.
    // Garmin activity detail normalmente esprime speed in m/s; non stimiamo dati mancanti.
    drawSeries(panel, '📈 Passo', speed, v => v > 0 ? 1000 / v / 60 : NaN, ' min/km');
    drawSeries(panel, '🏔️ Altitudine', altitude, v => v, ' m');
    drawSeries(panel, '👟 Cadenza', cadence, v => v, ' spm');
    renderSplits(panel, data.splits);
    // Recupera il profilo salvato, anche se non sono disponibili tutti i campi.
    let profile = null;
    let profileError = false;
    try {
      const saved = await authorizedPost('/api/coach/chat', {action:'profile-get'});
      profile = saved?.profile || null;
    } catch (_) { profileError = true; }
    if(request===detailRequest && !document.getElementById('detailOverlay')?.hidden) {
      drawSeries(panel, '❤️ Frequenza cardiaca', heart, v => v, ' bpm', profile);
      if (!rpHrZones(profile)) {
        const note=document.createElement('p'); note.className='rp-hint';
        note.textContent=profileError
          ? 'Zone FC non disponibili: impossibile leggere il Profilo dal server. Controlla il collegamento e riprova.'
          : 'Per colorare il grafico secondo le zone FC, salva la data di nascita oppure la FC massima nella pagina Profilo.';
        panel.append(note);
      }
      rpZoneCard(panel,heart,rows,profile);
    }
  } catch (err) {
    if (request !== detailRequest) return;
    panel.replaceChildren();
    const h = document.createElement('h3'); h.textContent = 'Grafici';
    const p = document.createElement('p'); p.className = 'rp-hint';
    p.textContent = 'Dati dettagliati non disponibili: ' + (err.message || String(err));
    panel.append(h, p);
  }
}
// I pulsanti vengono ricreati da app.js. Leggiamo la lista nell'ordine corrente del DOM.
document.getElementById('activityList')?.addEventListener('click', event => {
  const target = event.target.closest('button.activity-open');
  if (!target) return;
  const buttons = [...document.querySelectorAll('#activityList button.activity-open')];
  const index = buttons.indexOf(target);
  if (index < 0) return;
  try {
    const activities = JSON.parse(localStorage.getItem(window.runnerPulseStorageKey || 'runnerPulseActivitiesV1') || '[]');
    if (Array.isArray(activities)) {const sorted=activities.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.startTime||b.startTimeLocal||b.id||'').localeCompare(String(a.startTime||a.startTimeLocal||a.id||'')));void loadDetailForActivity(sorted[index]);}
  } catch (e) { console.warn('Impossibile leggere attività salvate:', e); }
});
document.getElementById('closeDetail')?.addEventListener('click', () => { detailRequest++; });

// La chat Coach è gestita da coach-memory.js, con cronologia Firebase.

// Il VO2 max stimato e' gestito da dashboard.js sui dati Garmin archiviati.
