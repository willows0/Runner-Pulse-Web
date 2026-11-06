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
    if(isOwner())void startAutoSync();else{stopAutoSync();syncUI(null,'Garmin non collegato a questo profilo.');}
  }else{window.dispatchEvent(new CustomEvent('runnerpulse:auth-user',{detail:null}));stopAutoSync();}
  if (user && !allowed) {
    showError('Accedi con un account Google verificato per utilizzare Runner Pulse.');
    await signOut(auth);
  }
});


// Importazione automatica a blocchi: il progresso percentuale è mostrato solo
// quando Garmin ha terminato la scoperta delle attività (totale noto).
let syncActive=false,syncCancel=false;
const syncClock=document.getElementById('rp-sync-clock');
const syncRing=document.getElementById('rp-sync-ring');
const syncText=document.getElementById('rp-sync-text');
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
  syncText.textContent=label;syncClock.title=label;syncClock.setAttribute('aria-label',label);
}
function stopAutoSync(){syncCancel=true;syncActive=false;syncUI(null,'Accedi con Google per sincronizzare Garmin.');}
async function startAutoSync(force=false){
  if(syncActive||!allowedUser()||!isOwner())return;
  syncActive=true;syncCancel=false;
  try{
    syncUI(null,'Verifica sincronizzazione Garmin in corso…');
    let state=(await authorizedPost('/api/garmin/sync-status',{})).state;
    if(force) syncUI(state,'Riavvio sincronizzazione Garmin…');
    else syncUI(state);
    for(let steps=0;steps<100000&&!syncCancel&&allowedUser();steps++){
      const data=await authorizedPost('/api/garmin/sync-step',steps===0&&force?{restart:true}:{});
      state=data.state;syncUI(state);
      if(Array.isArray(data.activities)&&data.activities.length){window.dispatchEvent(new CustomEvent('runnerpulse:garmin-data',{detail:{activities:data.activities}}));}
      if(state.phase==='done'||state.phase==='partial')break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }catch(e){if(!syncCancel)syncUI(null,'Sincronizzazione interrotta: '+(e.message||String(e)));}
  finally{syncActive=false;syncClock?.classList.remove('rp-sync-running');}
}
syncClock?.addEventListener('click',()=>{
  if(!allowedUser()||!isOwner()){syncUI(null,'Garmin disponibile soltanto per il proprietario.');return;}
  if(syncActive){syncText.textContent='Sincronizzazione Garmin già in corso…';return;}
  void startAutoSync(true);
});

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
.rp-detail-charts{background:#fff;color:#30251e;margin:18px 0;padding:16px;border-radius:18px;border:1px solid #f8ddc9}
.rp-detail-charts h3{color:#ce5200;margin:4px 0 12px}
.rp-detail-charts .rp-chart{background:#fff;margin:16px 0;padding:12px;border:1px solid #f3e1d4;border-radius:14px}
.rp-detail-charts .rp-chart h4{color:#bf4c00;margin:0 0 12px}
.rp-detail-charts svg{display:block;width:100%;height:auto}
.rp-detail-charts table{width:100%;border-collapse:collapse;font-size:12px}
.rp-detail-charts th,.rp-detail-charts td{padding:7px 4px;border-bottom:1px solid #f3e1d4;text-align:left}
.rp-detail-charts .rp-hint{font-size:13px;color:#796b60;line-height:1.45}
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
function drawSeries(parent, title, values, convert = v => v, unit = '') {
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
  flush(); card.append(svg);
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
    drawSeries(panel, '❤️ Frequenza cardiaca', heart, v => v, ' bpm');
    // Garmin activity detail normalmente esprime speed in m/s; non stimiamo dati mancanti.
    drawSeries(panel, '📈 Passo', speed, v => v > 0 ? 1000 / v / 60 : NaN, ' min/km');
    drawSeries(panel, '🏔️ Altitudine', altitude, v => v, ' m');
    drawSeries(panel, '👟 Cadenza', cadence, v => v, ' spm');
    renderSplits(panel, data.splits);
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
    if (Array.isArray(activities)) void loadDetailForActivity(activities[index]);
  } catch (e) { console.warn('Impossibile leggere attività salvate:', e); }
});
document.getElementById('closeDetail')?.addEventListener('click', () => { detailRequest++; });

// Chat Allenatore AI: accesso Google esistente, dati reali solo su invio esplicito.
(function setupCoachAI(){
  const coach=document.getElementById('coach'); if(!coach)return;
  const old=[...coach.querySelectorAll('.card')].find(c=>c.querySelector('h3')?.textContent?.trim()==='Allenatore AI');
  const card=old||document.createElement('div');card.className='card rp-ai-card';
  card.innerHTML=`<h3>🧡 Allenatore AI</h3><p class="muted">Chiedimi consigli sulla mezza maratona. Puoi scegliere se condividere i tuoi allenamenti salvati in questo browser.</p><div id="rp-ai-history" role="log" aria-live="polite" style="display:grid;gap:10px;margin:14px 0;max-height:380px;overflow-y:auto"></div><form id="rp-ai-form"><label for="rp-ai-question">La tua domanda</label><textarea id="rp-ai-question" rows="3" maxlength="1500" required placeholder="Come posso organizzare i miei tre allenamenti settimanali?" style="width:100%;box-sizing:border-box;border:1px solid #e5d3c7;border-radius:12px;padding:12px;font:inherit"></textarea><label style="display:flex;align-items:flex-start;gap:9px;margin:12px 0"><input id="rp-ai-share" type="checkbox" checked style="width:auto;margin-top:4px"><span>Invia anche gli ultimi 30 allenamenti salvati per personalizzare la risposta.</span></label><button id="rp-ai-send" type="submit">Chiedi all'allenatore</button><p id="rp-ai-status" role="status" class="note"></p></form><p class="note">L'AI può sbagliare: adatta sempre gli allenamenti alle tue condizioni. Le domande vengono inviate al servizio OpenAI.</p>`;
  if(!old)coach.append(card);
  const form=card.querySelector('#rp-ai-form'),question=card.querySelector('#rp-ai-question'),history=card.querySelector('#rp-ai-history'),status=card.querySelector('#rp-ai-status'),button=card.querySelector('#rp-ai-send');
  function bubble(who,content){const div=document.createElement('div');div.style.cssText=`padding:12px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:${who==='Tu'?'#fff1e5':'#f7f7f7'}`;const b=document.createElement('strong');b.textContent=who;const p=document.createElement('p');p.textContent=content;p.style.margin='6px 0 0';div.append(b,p);history.append(div);history.scrollTop=history.scrollHeight;}
  form.addEventListener('submit',async e=>{
    e.preventDefault();const message=question.value.trim();if(!message)return;
    if(!allowedUser()){status.textContent='Accedi con il tuo account Google autorizzato.';return;}
    let activities=[];
    if(card.querySelector('#rp-ai-share').checked){try{const stored=JSON.parse(localStorage.getItem(window.runnerPulseStorageKey || 'runnerPulseActivitiesV1')||'[]');if(Array.isArray(stored))activities=stored.slice(0,30).map(a=>({date:a.date,kind:a.kind,km:a.km,minutes:a.minutes,avgHR:a.avgHR,maxHR:a.maxHR,elevation:a.elevation,avgSpeed:a.avgSpeed}));}catch{}}
    bubble('Tu',message);question.value='';button.disabled=true;status.textContent='L’allenatore sta preparando la risposta…';
    try{const data=await authorizedPost('/api/coach/chat',{message,activities});bubble('Allenatore AI',data.answer);status.textContent=activities.length?`Risposta basata su ${data.activitiesUsed} allenamenti condivisi.`:'Risposta senza dati degli allenamenti.';}
    catch(error){status.textContent=error.message||String(error);question.value=message;}
    finally{button.disabled=false;}
  });
})();
