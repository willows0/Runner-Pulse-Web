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
    // Stima prestazionale VDOT basata sulle corse degli ultimi 30 giorni.
    // Non e' una misura clinica del VO2 max e non equivale alla stima Garmin.
    const vo2El=byId('rp-vo2-value'),vo2Note=byId('rp-vo2-note');
    if(vo2El)vo2El.textContent='—';
    if(vo2Note)vo2Note.textContent='In attesa di allenamenti validi negli ultimi 30 giorni.';
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const recent = entries.filter(e => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e.date || '').slice(0, 10));
      if (!match) return false;
      const d = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), 12);
      if (d.getFullYear() !== Number(match[1]) || d.getMonth() !== Number(match[2])-1 || d.getDate() !== Number(match[3])) return false;
      return d >= start && d <= today && Number.isFinite(Number(e.km)) && Number(e.km) > 0;
    });
    const monthStart=new Date(today);monthStart.setDate(today.getDate()-29);monthStart.setHours(0,0,0,0);
    const estimates=entries.flatMap(e=>{
      const type=String(e.kind||e.type||'').toLowerCase();
      if(!/(run|corsa|running|gara|race|trail|jog)/.test(type))return [];
      const date=new Date(String(e.date||'').slice(0,10)+'T12:00:00');
      const km=Number(e.km),mins=Number(e.minutes);
      if(!Number.isFinite(date.getTime())||date<monthStart||date>today||!(km>=3&&km<=42.195)||!(mins>=12&&mins<=240))return [];
      const pace=mins/km;
      if(pace<2.5||pace>12)return [];
      const velocity=km*1000/mins;
      const oxygen=-4.60+0.182258*velocity+0.000104*velocity*velocity;
      const fraction=0.8+0.1894393*Math.exp(-0.012778*mins)+0.2989558*Math.exp(-0.1932605*mins);
      const vdot=oxygen/fraction;
      return Number.isFinite(vdot)&&vdot>=15&&vdot<=85?[{vdot,date}]:[];
    });
    if(estimates.length&&vo2El){
      // Il migliore equivalente prestazionale osservato: gli allenamenti facili
      // sottostimano la capacita' massima. Non presentarlo come misura medica.
      const best=Math.max(...estimates.map(x=>x.vdot));
      vo2El.textContent=best.toLocaleString('it-IT',{maximumFractionDigits:1});
      if(vo2Note)vo2Note.textContent=`Indice prestazionale VDOT indicativo da ${estimates.length} corse negli ultimi 30 giorni. Non è il VO₂ max misurato né un risultato dell’AI.`;
    }
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
  document.addEventListener('DOMContentLoaded', () => {
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
