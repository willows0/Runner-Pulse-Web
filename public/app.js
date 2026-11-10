// Runner Pulse — attività e statistiche locali. Nessun dato sintetico.
// Ogni account Firebase usa una chiave locale distinta. Nessun dato legacy e' mostrato prima dell'accesso.
let key=null;
let entries=[];
// Inizializzata prima di qualunque render, anche durante eventi Firebase asincroni.
let currentMetric='km';
const deletedGarminIds=new Set();
window.addEventListener('runnerpulse:auth-user',event=>{
  const info=event.detail;
  key=info?.uid ? 'runnerPulseActivitiesV1:uid:'+info.uid : null;
  window.runnerPulseStorageKey=key;
  entries=[];
  deletedGarminIds.clear();
  if(key){
    try{
      let saved=localStorage.getItem(key);
      // Importazione una sola volta dello storico preesistente, esclusivamente nel profilo proprietario.
      if(saved===null&&info.owner){
        const legacy=localStorage.getItem('runnerPulseActivitiesV1');
        if(legacy!==null){const parsed=JSON.parse(legacy);if(Array.isArray(parsed)){saved=legacy;localStorage.setItem(key,legacy);}}
      }
      const parsed=JSON.parse(saved||'[]');if(Array.isArray(parsed))entries=parsed;
    }catch{entries=[];}
  }
  render();
});
const $=id=>document.getElementById(id);
const safeNumber=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const first=(obj,keys)=>{for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&v!=='')return v;}return null;};
const fmt=n=>Number(n).toLocaleString('it-IT',{maximumFractionDigits:2});
const pace=(km,min)=>{if(!(km>0&&min>0))return '—';const s=Math.round(min/km*60);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')} min/km`;};
const save=()=>{if(!key)return;localStorage.setItem(key,JSON.stringify(entries));render();window.dispatchEvent(new CustomEvent('runnerpulse:activities-changed'));};
// Conserva la sezione corrente anche dopo il refresh del browser.
const RP_PAGE_KEY='runnerPulseCurrentPageV2';
const RP_PAGES=new Set(['home','activities','plan','coach','settings']);
function rpActivatePage(page, remember=true){
  if(!RP_PAGES.has(page))page='home';
  document.querySelectorAll('main > .page').forEach(el=>el.classList.toggle('active',el.id===page));
  document.querySelectorAll('body > nav button[data-page]').forEach(el=>el.classList.toggle('selected',el.dataset.page===page));
  if(remember){try{sessionStorage.setItem(RP_PAGE_KEY,page);}catch{}}
  window.scrollTo(0,0);
}
document.querySelectorAll('body > nav button[data-page]').forEach(btn=>btn.addEventListener('click',()=>rpActivatePage(btn.dataset.page)));
try{rpActivatePage(sessionStorage.getItem(RP_PAGE_KEY)||'home',false);}catch{rpActivatePage('home',false);}

const manualModal=$('rp-manual-modal');
const openManual=$('rp-open-manual');
const closeManual=()=>{manualModal.hidden=true;document.body.classList.remove('rp-manual-modal-open');openManual.focus();};
openManual.addEventListener('click',()=>{manualModal.hidden=false;document.body.classList.add('rp-manual-modal-open');$('rp-manual-message').textContent='';$('date').focus();});
$('rp-close-manual').addEventListener('click',closeManual);
$('rp-cancel-manual').addEventListener('click',closeManual);
manualModal.querySelector('[data-manual-close]').addEventListener('click',closeManual);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!manualModal.hidden)closeManual();});
$('date').value=new Date().toLocaleDateString('en-CA');
$('activityForm').onsubmit=e=>{e.preventDefault();if(!key){$('rp-manual-message').textContent='Accedi con Google prima di salvare un allenamento.';return;}entries.unshift({id:'manual-'+Date.now(),date:$('date').value,kind:$('kind').value,km:Number($('km').value),minutes:Number($('minutes').value),source:'manual'});save();e.target.reset();$('date').value=new Date().toLocaleDateString('en-CA');closeManual();};
function stat(label,value){const d=document.createElement('div');d.className='detail-stat';const strong=document.createElement('strong');strong.textContent=value;const small=document.createElement('small');small.textContent=label;d.append(strong,small);return d;}
function activityDateKey(value){
  const text=String(value||'').trim();
  const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const italian=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if(italian)return `${italian[3]}-${italian[2].padStart(2,'0')}-${italian[1].padStart(2,'0')}`;
  return '';
}
function activityDateIT(value){
  const key=activityDateKey(value);
  return key?`${key.slice(8,10)}/${key.slice(5,7)}/${key.slice(0,4)}`:'Data non disponibile';
}
function activityNewestFirst(a,b){
  const da=activityDateKey(a.date),db=activityDateKey(b.date);
  if(!da)return db?1:0;
  if(!db)return -1;
  return db.localeCompare(da) || String(b.startTime||b.startTimeLocal||b.id||'').localeCompare(String(a.startTime||a.startTimeLocal||a.id||''));
}
function showDetail(x){const wrap=$('detailContent');wrap.replaceChildren();const card=document.createElement('div');card.className='detail-card';const h=document.createElement('h2');h.textContent=x.kind||'Allenamento';const meta=document.createElement('p');meta.className='detail-meta';meta.textContent=activityDateIT(x.date);card.append(h,meta);const grid=document.createElement('div');grid.className='detail-grid';grid.append(stat('Distanza',fmt(x.km)+' km'),stat('Durata',fmt(x.minutes)+' min'),stat('Passo medio',pace(x.km,x.minutes)));if(x.avgHR!=null)grid.append(stat('FC media',fmt(x.avgHR)+' bpm'));if(x.maxHR!=null)grid.append(stat('FC massima',fmt(x.maxHR)+' bpm'));if(x.elevation!=null)grid.append(stat('Dislivello positivo',fmt(x.elevation)+' m'));if(x.calories!=null)grid.append(stat('Calorie',fmt(x.calories)+' kcal'));if(x.avgSpeed!=null)grid.append(stat('Velocità media',fmt(x.avgSpeed)+' km/h'));card.append(grid);const header=document.createElement('header');header.className='rp-detail-header';header.innerHTML='<div class="rp-detail-avatar" aria-label="Foto Google"><img alt="Foto del profilo Google" hidden><span aria-hidden="true">●</span></div><div class="rp-coach-brand"><span class="rp-coach-brand-run" aria-hidden="true">➤</span> Runner <em>Pulse</em></div>';const sourceAvatar=document.getElementById('rp-google-avatar');const avatar=header.querySelector('.rp-detail-avatar img');const fallback=header.querySelector('.rp-detail-avatar span');const syncAvatar=()=>{const src=sourceAvatar?.getAttribute('src');if(src&&!sourceAvatar.hidden){avatar.src=src;avatar.hidden=false;fallback.hidden=true;}else{avatar.hidden=true;fallback.hidden=false;}};syncAvatar();if(sourceAvatar){const observer=new MutationObserver(syncAvatar);observer.observe(sourceAvatar,{attributes:true,attributeFilter:['src','hidden']});window.addEventListener('runnerpulse:auth-user',syncAvatar,{once:true});setTimeout(()=>observer.disconnect(),30000);}const tabs=document.createElement('div');tabs.className='rp-detail-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Sezioni allenamento');const panes={};[['overview','Panoramica'],['charts','Grafici'],['laps','Lap']].forEach(([id,label])=>{const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.detailTab=id;btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(id==='overview'));btn.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===btn)));Object.entries(panes).forEach(([k,pane])=>{pane.hidden=k!==id;});document.getElementById('detailOverlay').scrollTo({top:0,behavior:'instant'});});tabs.append(btn);const pane=document.createElement('section');pane.id='rp-detail-'+id;pane.className='rp-detail-pane';pane.setAttribute('role','tabpanel');pane.hidden=id!=='overview';panes[id]=pane;});panes.overview.append(card);wrap.append(header,tabs,panes.overview,panes.charts,panes.laps);$('detailOverlay').hidden=false;document.body.style.overflow='hidden';const detailNav=$('rp-detail-bottom-nav');const mainNav=document.querySelector('body > nav');if(detailNav&&mainNav){detailNav.replaceChildren(...Array.from(mainNav.querySelectorAll('button[data-page]'),b=>{const clone=b.cloneNode(true);clone.classList.toggle('selected',b.dataset.page==='activities');clone.addEventListener('click',()=>{$('detailOverlay').hidden=true;document.body.style.overflow='';mainNav.querySelector('button[data-page="'+b.dataset.page+'"]')?.click();});return clone;}));}}
$('closeDetail').onclick=()=>{$('detailOverlay').hidden=true;document.body.style.overflow='';};
function render(){const totalKm=entries.reduce((s,x)=>s+(Number(x.km)||0),0);const totalMin=entries.reduce((s,x)=>s+(Number(x.minutes)||0),0);$('count').textContent=entries.length;$('distance').textContent=fmt(totalKm);$('avgPace').textContent=pace(totalKm,totalMin).replace(' min/km','');$('activityList').replaceChildren();[...entries].sort(activityNewestFirst).forEach(x=>{const c=document.createElement('div');c.className='card';const open=document.createElement('button');open.className='activity-open';open.type='button';const title=document.createElement('b');title.textContent=`${x.kind||'Corsa'} · ${fmt(x.km)} km`;const sub=document.createElement('small');sub.textContent=`${activityDateIT(x.date)} · ${fmt(x.minutes)} min · ${pace(x.km,x.minutes)}`;open.append(title,sub);open.onclick=()=>showDetail(x);const del=document.createElement('button');del.className='delete';del.textContent='Elimina';del.onclick=async()=>{
  if(!window.confirm(`Vuoi eliminare definitivamente da Runner Pulse l'allenamento del ${activityDateIT(x.date)}?${x.source==='garmin'?' Sarà eliminato anche da Firebase, ma resterà su Garmin Connect.':''}`))return;
  del.disabled=true;
  try{
    if(x.source==='garmin'){
      const id=String(x.garminId||String(x.id||'').replace(/^garmin-/,''));
      if(!/^\d{1,20}$/.test(id))throw new Error('Identificativo Garmin non valido: nessun dato eliminato.');
      await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('runnerpulse:delete-garmin',{detail:{activityId:id,resolve,reject}})));
      deletedGarminIds.add(id);
    }
    entries=entries.filter(e=>e!==x);save();
  }catch(error){del.disabled=false;window.alert('Eliminazione non riuscita: '+(error.message||String(error)));}
};c.append(open,del);$('activityList').append(c);});$('coachText').textContent=entries.length?`Hai registrato ${entries.length} allenamenti per ${fmt(totalKm)} km totali. Passo medio complessivo: ${pace(totalKm,totalMin)}. È un riepilogo matematico, non un'analisi AI o una valutazione medica.`:'Registra o importa un allenamento per vedere il riepilogo.';if(entries.some(e=>e.source==='garmin')){$('garminStatus').textContent='Attività importate su questo dispositivo';const last=localStorage.getItem('runnerPulseGarminLastSync');$('garminUpdated').textContent=last?'Ultima importazione riuscita: '+new Date(last).toLocaleString('it-IT'):'Le attività sono disponibili nella sezione Attività.';}renderAnalytics();}
fetch('/api/status').then(r=>r.json()).then(s=>{if(!entries.some(e=>e.source==='garmin'))$('garminStatus').textContent=s.garminConnected?'Collegato':s.message;$('garminSettings').textContent=s.garminConfigured?'Chiave presente sul server. Usa Verifica Garmin oppure Importa attività per controllare l’accesso.':'Chiave non configurata sul server.';}).catch(()=>{if(!entries.some(e=>e.source==='garmin'))$('garminStatus').textContent='Impossibile verificare lo stato del server.';});
// Compatibilità con i riepiloghi Garmin ufficiali (Activity API) e con lo storico Personal API.
function normalizeGarmin(a){
  if(!a||typeof a!=='object')return null;
  const id=first(a,['activityId','id','summaryId']);
  const meters=safeNumber(first(a,['distanceInMeters','distance','distanceMeters']));
  const seconds=safeNumber(first(a,['durationInSeconds','duration','elapsedDuration','movingDuration']));
  const epoch=safeNumber(first(a,['startTimeInSeconds']));
  const rawDate=first(a,['startTimeLocal','startTimeGMT','startTime','date']);
  let date=null;
  if(typeof rawDate==='string'&&/^\d{4}-\d{2}-\d{2}/.test(rawDate))date=rawDate.slice(0,10);
  else if(epoch!=null&&epoch>0)date=new Date(epoch*1000).toISOString().slice(0,10);
  else if(typeof rawDate==='number'&&rawDate>0)date=new Date(rawDate*(rawDate<1e11?1000:1)).toISOString().slice(0,10);
  const kind=first(a,['activityType','activityTypeName','type']);
  const type=typeof kind==='object'?first(kind,['typeKey','typeName','name']):kind;
  const km=meters!=null?meters/1000:null;
  const minutes=seconds!=null?seconds/60:null;
  // Non inventare distanza o durata: gli allenamenti incompleti sono esclusi dal riepilogo numerico.
  if(id==null||!date||!Number.isFinite(km)||km<=0||!Number.isFinite(minutes)||minutes<=0)return null;
  const num=keys=>safeNumber(first(a,keys));
  const speed=num(['averageSpeedInMetersPerSecond','averageSpeed','avgSpeed']);
  return {id:'garmin-'+id,garminId:String(id),date,kind:String(type||a.activityName||'Corsa'),
    km:Math.round(km*100)/100,minutes:Math.round(minutes*10)/10,source:'garmin',
    avgHR:num(['averageHeartRateInBeatsPerMinute','averageHR','averageHeartRate','avgHeartRate']),
    maxHR:num(['maxHeartRateInBeatsPerMinute','maxHR','maxHeartRate']),
    elevation:num(['totalElevationGain','elevationGain']),calories:num(['calories','activeKilocalories']),
    avgSpeed:speed!=null?Math.round(speed*3.6*100)/100:null};
}
window.addEventListener('runnerpulse:garmin-data',e=>{if(!key)return;const data=e.detail;const list=Array.isArray(data?.activities)?data.activities:[];let added=0,updated=0,skipped=0;const existing=new Map(entries.map((x,i)=>[String(x.id),i]));for(const raw of list){const item=normalizeGarmin(raw);if(!item||deletedGarminIds.has(item.garminId)){skipped++;continue;}const i=existing.get(item.id);if(i!==undefined){entries[i]={...entries[i],...item};updated++;}else{entries.unshift(item);added++;existing.set(item.id,0);}}if(Array.isArray(data?.activities)){if(!data.fromArchive)localStorage.setItem('runnerPulseGarminLastSync',new Date().toISOString());save();if(!data.fromArchive)$('importResult').textContent=`Importazione completata: ${added} nuove, ${updated} aggiornate, ${skipped} non utilizzabili. ${list.length} attività ricevute dal server.`;if(!list.length&&!data.fromArchive)$('importResult').textContent='Il servizio non ha restituito attività in questa richiesta.';}});
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>download('runner-pulse-allenamenti.json',JSON.stringify(entries,null,2),'application/json');
if($('calendar')) $('calendar').onclick=()=>{const now=new Date(),monday=new Date(now);monday.setDate(now.getDate()+(8-now.getDay())%7);monday.setHours(0,0,0,0);const sessions=[{day:1,hour:18,title:'Runner Pulse - Qualità'},{day:3,hour:18,title:'Runner Pulse - Ritmo'},{day:6,hour:9,title:'Runner Pulse - Lungo'}];const fmtDate=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`;const out=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Runner Pulse//IT'];sessions.forEach((s,i)=>{const d=new Date(monday);d.setDate(d.getDate()+s.day);d.setHours(s.hour);const end=new Date(d.getTime()+3600000);out.push('BEGIN:VEVENT',`UID:runnerpulse-${Date.now()}-${i}@local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART:${fmtDate(d)}`,`DTEND:${fmtDate(end)}`,`SUMMARY:${s.title}`,'DESCRIPTION:Bozza di allenamento. Modificare orario e carico in base al calendario e al recupero.','END:VEVENT');});out.push('END:VCALENDAR');download('runner-pulse-settimana.ics',out.join('\r\n'),'text/calendar');};
// Grafici di progresso e osservazioni basati solo sulle attività salvate.
const analyticsStyle=document.createElement('style');analyticsStyle.textContent=`.rp-chart-card{background:linear-gradient(135deg,#142840,#203c5c);color:#fff;border:1px solid #38516c;border-radius:22px;padding:18px;margin:14px 0;box-shadow:0 4px 18px #7c390011}.rp-chart-card h3{margin:0 0 8px;color:#ffad65}.rp-chart-card p{color:#d0deed;font-size:13px}.rp-chart-svg{width:100%;height:auto;display:block}.rp-chart-point{cursor:pointer}.rp-chart-value{font-size:12px;color:#d0deed;margin-top:8px;min-height:20px}.rp-coach-advice{line-height:1.6;background:linear-gradient(135deg,#142840,#203c5c);color:#fff;border-left:4px solid #f36b08;border-radius:12px;padding:15px;margin:14px 0}.rp-chart-controls{display:flex;gap:8px;flex-wrap:wrap}.rp-chart-controls button{padding:9px 13px;font-size:13px}.rp-chart-controls button[aria-pressed=true]{background:#c84e00!important}`;document.head.append(analyticsStyle);
const chartSection=document.createElement('section');chartSection.id='rp-analytics';chartSection.innerHTML='<h2>📈 I tuoi progressi</h2><p class="muted">Grafici calcolati esclusivamente dagli allenamenti registrati.</p><div class="rp-chart-controls"><button type="button" data-metric="km" aria-pressed="true">Distanza</button><button type="button" data-metric="pace">Passo</button><button type="button" data-metric="avgHR">FC media</button></div><div class="rp-chart-card"><h3 id="rp-chart-title">Distanza per allenamento</h3><div id="rp-chart-holder"></div><p id="rp-chart-value" class="rp-chart-value" role="status">Tocca un punto per i dettagli.</p></div>';
$('activities').append(chartSection);const coachAdvice=document.createElement('div');coachAdvice.className='rp-coach-advice';coachAdvice.id='rp-coach-advice';coachAdvice.setAttribute('role','status');$('activities').append(coachAdvice);
chartSection.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{currentMetric=b.dataset.metric;chartSection.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderAnalytics();});
function renderAnalytics(){const ordered=entries.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);const metric=currentMetric;const data=ordered.map(x=>({x,value:metric==='pace'?(x.km>0&&x.minutes>0?x.minutes/x.km:null):safeNumber(x[metric])})).filter(o=>o.value!==null&&Number.isFinite(o.value)&&o.value>0);const labels={km:'Distanza per allenamento (km)',pace:'Passo per allenamento (min/km)',avgHR:'Frequenza cardiaca media (bpm)'};$('rp-chart-title').textContent=labels[metric];const holder=$('rp-chart-holder');holder.replaceChildren();$('rp-chart-value').textContent='Tocca un punto per vedere i dettagli.';if(!data.length){const p=document.createElement('p');p.textContent=metric==='avgHR'?'Frequenza cardiaca non disponibile negli allenamenti salvati.':'Non ci sono ancora dati validi per questo grafico.';holder.append(p);}else{const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 340 220');svg.setAttribute('class','rp-chart-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',labels[metric]);const values=data.map(d=>d.value),min=Math.min(...values),max=Math.max(...values);const low=Math.max(0,min-(max-min||Math.max(1,max*.15))*.2),high=max+(max-min||Math.max(1,max*.15))*.2;const coords=data.map((d,i)=>({x:32+i*(290/Math.max(1,data.length-1)),y:185-(d.value-low)/(high-low)*150}));function el(tag,attrs){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));return n;}for(let i=0;i<4;i++){const y=35+i*50;svg.append(el('line',{x1:30,y1:y,x2:330,y2:y,stroke:'#48617b','stroke-width':1}));const txt=el('text',{x:27,y:y+4,'text-anchor':'end',fill:'#d0deed','font-size':10});txt.textContent=fmt(high-(high-low)*(y-35)/150);svg.append(txt);}if(data.length>1)svg.append(el('polyline',{points:coords.map(c=>`${c.x},${c.y}`).join(' '),fill:'none',stroke:'#f36b08','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));coords.forEach((c,i)=>{const circle=el('circle',{cx:c.x,cy:c.y,r:5,fill:'#e45d00',stroke:'#142840','stroke-width':2,class:'rp-chart-point',tabindex:0});const announce=()=>{$('rp-chart-value').textContent=`${data[i].x.date}: ${metric==='pace'?pace(1,data[i].value):fmt(data[i].value)+(metric==='km'?' km':' bpm')}`;};circle.addEventListener('click',announce);circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();announce();}});svg.append(circle);});const firstDate=el('text',{x:32,y:209,fill:'#d0deed','font-size':11});firstDate.textContent=data[0].x.date.slice(5);svg.append(firstDate);const lastDate=el('text',{x:330,y:209,'text-anchor':'end',fill:'#d0deed','font-size':11});lastDate.textContent=data[data.length-1].x.date.slice(5);svg.append(lastDate);holder.append(svg);}const runs=ordered.filter(x=>x.km>0&&x.minutes>0);if(!runs.length){coachAdvice.textContent='Coach: importa o registra qualche allenamento per ricevere osservazioni basate sui dati reali.';return;}const km=runs.reduce((s,x)=>s+x.km,0);const weeks=new Map();for(const x of runs){const d=new Date(x.date+'T12:00:00');const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);const w=d.toLocaleDateString('en-CA');weeks.set(w,(weeks.get(w)||0)+x.km);}const wk=[...weeks.entries()].sort((a,b)=>a[0].localeCompare(b[0]));const longest=Math.max(...runs.map(x=>x.km));const latest=runs[runs.length-1];const remarks=[`Hai ${runs.length} allenamenti validi, ${fmt(km)} km registrati e un lungo massimo di ${fmt(longest)} km.`,`Ultima attività registrata: ${latest.date}, ${fmt(latest.km)} km a ${pace(latest.km,latest.minutes)}.`];if(wk.length>=2){const a=wk[wk.length-2][1],b=wk[wk.length-1][1];remarks.push(`Settimana più recente registrata: ${fmt(b)} km, rispetto a ${fmt(a)} km nella precedente. ${b>a?'Il volume è aumentato: valuta recupero e sensazioni.':b<a?'Il volume è diminuito: potrebbe essere una settimana più leggera.':'Il volume è rimasto stabile.'}`);}remarks.push('Per la mezza maratona, alterna qualità, corsa facile e lungo in base al recupero. I dati da soli non permettono di valutare affaticamento o rischio di infortunio. Continua con costanza! 🧡');coachAdvice.textContent=remarks.join(' ');}
render();
