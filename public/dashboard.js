/* Runner Pulse: riepilogo ultimi 7 giorni, isolato per UID Firebase.
   Non legge mai la chiave legacy condivisa fra utenti. */
(() => {
  const byId = id => document.getElementById(id);
  let activeUid = null;
  function update() {
    const runsEl = byId('rp-week-runs');
    const kmEl = byId('rp-week-km');
    if (!runsEl || !kmEl) return;
    if (!activeUid) { runsEl.textContent = '—'; kmEl.textContent = '—'; return; }
    let entries;
    try { entries = JSON.parse(localStorage.getItem('runnerPulseActivitiesV1:uid:' + activeUid) || '[]'); }
    catch { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    const today = new Date(); today.setHours(23,59,59,999);
    const start = new Date(today); start.setDate(start.getDate()-6); start.setHours(0,0,0,0);
    const recent = entries.filter(e => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e?.date || ''))) return false;
      const d = new Date(e.date + 'T12:00:00');
      return !Number.isNaN(d.getTime()) && d >= start && d <= today && Number.isFinite(Number(e.km)) && Number(e.km) > 0;
    });
    const km = recent.reduce((n,e) => n + Number(e.km), 0);
    runsEl.textContent = String(recent.length);
    kmEl.textContent = km.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' km';
  }
  window.addEventListener('runnerpulse:auth-user', e => {
    activeUid = e.detail?.uid || null;
    update();
  });
  window.addEventListener('runnerpulse:activities-updated', update);
  window.addEventListener('runnerpulse:garmin-data', () => setTimeout(update, 0));
  window.addEventListener('storage', e => {
    if (activeUid && e.key === 'runnerPulseActivitiesV1:uid:' + activeUid) update();
  });
  document.addEventListener('DOMContentLoaded', () => {
    update();
    const ask = byId('rp-request-plan');
    if (ask) ask.addEventListener('click', () => {
      const tab = document.querySelector('nav button[data-page="coach"]');
      if (tab) tab.click();
      const input = document.querySelector('#coach textarea, #coach input[type="text"]');
      if (input) {
        input.value = 'Vorrei creare un programma di allenamento personalizzato. Prima analizza i miei dati reali e chiedimi le informazioni mancanti.';
        input.dispatchEvent(new Event('input', {bubbles:true})); input.focus();
      }
    });
  });
})();
