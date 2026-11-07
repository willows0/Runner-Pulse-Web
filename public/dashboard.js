/* Dashboard: mostra solo dati realmente disponibili, nessuna metrica sanitaria simulata. */
(() => {
  const byId = id => document.getElementById(id);
  const update = () => {
    const storageKey = window.runnerPulseStorageKey;
    const runsEl = byId('rp-week-runs');
    const kmEl = byId('rp-week-km');
    const paceEl = byId('avgPace');
    // Non mostrare dati di un altro profilo quando l'utente è disconnesso.
    if (!storageKey) {
      if (runsEl) runsEl.textContent = '—';
      if (kmEl) kmEl.textContent = '—';
      if (paceEl) paceEl.textContent = '—';
      return;
    }
    let entries = [];
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(stored)) entries = stored;
    } catch { /* Nessun dato valido disponibile. */ }
    updateVo2(entries);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const recent = entries.filter(e => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e.date || '').slice(0, 10));
      if (!match) return false;
      const date = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), 12);
      return date >= start && date <= today && Number.isFinite(Number(e.km)) && Number(e.km) > 0;
    });
    const km = recent.reduce((n, e) => n + Number(e.km), 0);
    const minutes = recent.reduce((n, e) => n + (Number(e.minutes) > 0 ? Number(e.minutes) : 0), 0);
    if (runsEl) runsEl.textContent = String(recent.length);
    if (kmEl) kmEl.textContent = km.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' km';
    if (paceEl) {
      if (km > 0 && minutes > 0) {
        const seconds = Math.round(minutes / km * 60);
        paceEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      } else paceEl.textContent = '—';
    }
  };
  // Stima sperimentale da costo energetico della corsa in piano (ACSM)
  // e frazione di riserva cardiaca. Non e' una misura clinica del VO2 max.
  const finite = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null;
  const median = values => { const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; };
  function updateVo2(entries){
    const value=byId('rp-vo2-value'), note=byId('rp-vo2-note');
    if(!value||!note)return;
    const key=window.runnerPulseStorageKey;
    if(!key){value.textContent='—';note.textContent='Accedi per analizzare le corse Garmin.';return;}
    const max=finite(byId('rp-vo2-hrmax')?.value),rest=finite(byId('rp-vo2-hrrest')?.value);
    if(!(max>=120&&max<=230&&rest>=30&&rest<=100&&max-rest>=50)){
      value.textContent='—';note.textContent='Inserisci FC massima e FC a riposo attendibili per calcolare una stima.';return;
    }
    const sorted=entries.filter(e=>e.source==='garmin'&&/run|corsa|running|trail/i.test(String(e.kind||'')))
      .filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(String(e.date||'')))
      .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,30);
    const estimates=[];
    for(const e of sorted){
      const km=finite(e.km),min=finite(e.minutes),hr=finite(e.avgHR);
      if(!(km>=2&&km<=45&&min>0&&hr>rest+20&&hr<max-5))continue;
      const speed=km*1000/min; // metri al minuto
      if(speed<100||speed>300)continue; // corsa, non camminata o velocita anomala
      const fraction=(hr-rest)/(max-rest);
      if(fraction<.55||fraction>.92)continue;
      const oxygen=3.5+0.2*speed; // ml/kg/min, piano; non corregge pendenza/vento
      const vo2=(oxygen-3.5)/fraction+3.5;
      if(vo2>=20&&vo2<=85)estimates.push(vo2);
    }
    if(estimates.length<3){value.textContent='—';note.textContent=`${estimates.length} corse utilizzabili su ${sorted.length} esaminate. Ne servono almeno 3 con FC media, durata e distanza attendibili.`;return;}
    const estimate=median(estimates);
    value.textContent=estimate.toLocaleString('it-IT',{maximumFractionDigits:1,minimumFractionDigits:1});
    note.textContent=`Stima sperimentale da ${estimates.length} delle ultime ${sorted.length} corse Garmin. Mediana velocità/riserva cardiaca · ml/kg/min. Può differire da Garmin, specie su salite o corse facili.`;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const uid=()=>window.runnerPulseStorageKey||'';
    const hrMax=byId('rp-vo2-hrmax'),hrRest=byId('rp-vo2-hrrest');
    function restore(){for(const [el,kind] of [[hrMax,'max'],[hrRest,'rest']]){if(el)el.value=uid()?localStorage.getItem(uid()+':vo2hr:'+kind)||'':'';}}
    restore();
    window.addEventListener('runnerpulse:auth-user',restore);
    byId('rp-vo2-calc')?.addEventListener('click',()=>{
      if(!uid())return;
      for(const [el,kind] of [[hrMax,'max'],[hrRest,'rest']])if(el)localStorage.setItem(uid()+':vo2hr:'+kind,el.value);
      update();
    });
    update(); window.addEventListener('runnerpulse:garmin-data',()=>setTimeout(update,100));
    window.addEventListener('runnerpulse:auth-user',()=>setTimeout(update,0));
    window.addEventListener('runnerpulse:activities-changed',update);
    const ask = byId('rp-request-plan');
    if (ask) ask.addEventListener('click',()=>{
      const tab = document.querySelector('nav button[data-page="coach"]');
      if(tab) tab.click();
      const input = document.querySelector('#coach textarea, #coach input[type="text"]');
      if(input) { input.value='Vorrei creare un programma di allenamento personalizzato. Prima analizza i miei dati reali e chiedimi le informazioni mancanti.'; input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); }
    });
  });
})();
