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
