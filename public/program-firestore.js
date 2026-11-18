// Programma: usa SOLO il server autenticato e attività reali di Firestore.
import {getApps} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
window.rpFirestorePlan=async function(){
 const form=document.getElementById('rp-program-form'),status=document.getElementById('rp-program-status');
 const btn=document.getElementById('rp-create-proposal');
 try{
  const app=getApps().find(a=>a.options.projectId==='runnerpulse');
  const user=app&&getAuth(app).currentUser;
  if(!user){status.textContent='Accedi con Google e riprova.';return;}
  const f=Object.fromEntries(new FormData(form).entries());
  const distance=Number(f.distance==='other'?f.otherDistance:f.distance);
  if(!Number.isFinite(distance)||distance<=0){status.textContent='Indica una distanza valida.';return;}
  if(f.race==='yes'&&f.raceDate&&f.raceDate<new Date().toISOString().slice(0,10)){status.textContent='La gara deve essere futura.';return;}
  btn.disabled=true;status.textContent='Analizzo gli allenamenti archiviati e preparo la proposta…';
  const token=await user.getIdToken();
  const response=await fetch('/api/program/propose',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...f,distance})});
  const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||'Generazione non riuscita');
  if(!Array.isArray(data.sessions)||!data.sessions.length)throw Error('Il server non ha restituito allenamenti');
  window.rpCurrentDraft=data.sessions;window.rpFirestoreDraftOwner=user.uid;
  const uid=user.uid;localStorage.setItem('runnerpulse:program:objective:'+uid,JSON.stringify(f));
  const desc=document.getElementById('rp-program-description');
  desc.textContent='Proposta basata su '+data.metrics.recentRuns+' corse delle ultime 6 settimane · volume medio '+data.metrics.weeklyKm+' km/settimana'+(data.metrics.medianPace?' · passo mediano '+data.metrics.medianPace:'')+'.';
  const box=document.getElementById('rp-program-proposal'),list=document.getElementById('rp-program-sessions');
  list.replaceChildren();
  for(const [i,s] of data.sessions.entries()){
   const row=document.createElement('div');row.className='rp-program-session';
   const strong=document.createElement('strong');strong.textContent=s.date+' · '+s.title+' · '+s.minutes+' min';
   const p=document.createElement('p');p.textContent=s.details;
   row.append(strong,p);list.appendChild(row);
  }
  box.hidden=false;box.style.display='block';
  document.getElementById('rp-program-result').textContent=data.caveats.join(' ');
  status.textContent='Proposta creata con i dati Firestore. Apri Calendario o Piano per vedere le sedute.';
  // Observer della pagina Piano si occupa di aggiornare il calendario.
  box.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(error){status.textContent='Errore: '+error.message;console.error('Programma Firestore:',error)}finally{btn.disabled=false;}
};

// Approva soltanto la proposta mostrata e solo per lo stesso account. Nessuna scrittura su Calendar.
document.addEventListener('click',function(event){
 const btn=event.target.closest?.('#rp-program-approve');
 if(!btn||!window.rpCurrentDraft?.length||!window.rpFirestoreDraftOwner)return;
 event.preventDefault();event.stopImmediatePropagation();
 const app=getApps().find(a=>a.options.projectId==='runnerpulse');
 const user=app&&getAuth(app).currentUser;
 const result=document.getElementById('rp-program-result');
 if(!user||user.uid!==window.rpFirestoreDraftOwner){result.textContent='Sessione cambiata: accedi nuovamente.';return;}
 localStorage.setItem('runnerpulse:program:approved:'+user.uid,JSON.stringify(window.rpCurrentDraft));
 result.textContent='Proposta approvata e salvata su questo dispositivo. Google Calendar non è ancora collegato.';
},true);
