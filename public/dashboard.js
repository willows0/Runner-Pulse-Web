/* Dashboard: mostra solo dati realmente disponibili, nessuna metrica sanitaria simulata. */
(() => {
  const byId = id => document.getElementById(id);
  const update = () => {
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem('runnerPulseActivitiesV1') || '[]'); } catch {}
    // Le statistiche settimanali sono calcolate soltanto da attività con data e distanza valide.
    if (!Array.isArray(entries)) return;
    const today = new Date(); today.setHours(23,59,59,999);
    const start = new Date(today); start.setDate(start.getDate()-6); start.setHours(0,0,0,0);
    const recent = entries.filter(e => {
      const d = new Date(String(e.date||'')+'T12:00:00');
      return !isNaN(d) && d>=start && d<=today && Number(e.km)>0;
    });
    const km = recent.reduce((n,e)=>n+Number(e.km),0);
    if(byId('rp-week-runs')) byId('rp-week-runs').textContent = String(recent.length);
    if(byId('rp-week-km')) byId('rp-week-km').textContent = km.toLocaleString('it-IT',{maximumFractionDigits:2})+' km';
  };
  document.addEventListener('DOMContentLoaded', () => {
    update(); window.addEventListener('runnerpulse:garmin-data',()=>setTimeout(update,100));
    const ask = byId('rp-request-plan');
    if (ask) ask.addEventListener('click',()=>{
      const tab = document.querySelector('nav button[data-page="coach"]');
      if(tab) tab.click();
      const input = document.querySelector('#coach textarea, #coach input[type="text"]');
      if(input) { input.value='Vorrei creare un programma di allenamento personalizzato. Prima analizza i miei dati reali e chiedimi le informazioni mancanti.'; input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); }
    });
  });
})();
