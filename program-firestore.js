// Programma: usa SOLO il server autenticato e attività reali di Firestore.
import {getApps} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
// Per utente: Firestore e cache locale. Mai mischiare i piani di account diversi.
const app=getApps().find(a=>a.options.projectId==='runnerpulse');
if(app){
 const auth=getAuth(app),db=getFirestore(app);
 onAuthStateChanged(auth,async user=>{
  window.rpSavedApproved=null;window.rpCurrentDraft=null;
  if(!user){window.dispatchEvent(new Event('rp-plan-updated'));return;}
  const uid=user.uid,key='runnerpulse:program:approved:'+uid;
  let local=[];try{local=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
  if(Array.isArray(local)&&local.length)window.rpSavedApproved=local;
  window.dispatchEvent(new Event('rp-plan-updated'));
  try{
   const snap=await getDoc(doc(db,'users',uid,'trainingPlans','current'));
   if(getAuth(app).currentUser?.uid!==uid)return;
   if(snap.exists()&&Array.isArray(snap.data().sessions)){
    window.rpSavedApproved=snap.data().sessions;
    localStorage.setItem(key,JSON.stringify(window.rpSavedApproved));
    window.dispatchEvent(new Event('rp-plan-updated'));
   }
  }catch(err){console.warn('Lettura piano Firestore:',err.message)}
 });
}
window.rpFirebaseApprovalActive=true;
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

// Salva il piano approvato nel database dell'utente; cache locale come fallback esplicito.
document.addEventListener('click',async function(event){
 const btn=event.target.closest?.('#rp-program-approve');
 if(!btn)return;
 event.preventDefault();event.stopImmediatePropagation();
 const result=document.getElementById('rp-program-result');
 const active=getApps().find(a=>a.options.projectId==='runnerpulse');
 const user=active&&getAuth(active).currentUser;
 const draft=window.rpCurrentDraft;
 if(!user||!Array.isArray(draft)||!draft.length){result.textContent='Prepara prima una proposta e accedi con Google.';return;}
 if(window.rpFirestoreDraftOwner&&window.rpFirestoreDraftOwner!==user.uid){result.textContent='Account cambiato. Rigenera il piano.';return;}
 btn.disabled=true;result.textContent='Salvataggio del programma…';
 try{
  const uid=user.uid;
  const sessions=draft.map(s=>JSON.parse(JSON.stringify(s)));
  await setDoc(doc(getFirestore(active),'users',uid,'trainingPlans','current'),{sessions,updatedAt:new Date().toISOString(),ownerUid:uid});
  localStorage.setItem('runnerpulse:program:approved:'+uid,JSON.stringify(sessions));
  window.rpSavedApproved=sessions;window.rpCurrentDraft=null;
  result.textContent='Programma approvato e salvato su Firestore. Lo ritrovi nella scheda Piano anche dopo la riapertura.';
  window.dispatchEvent(new Event('rp-plan-updated'));
 }catch(error){
  result.textContent='Non è stato possibile salvare il piano su Firestore: '+error.message+'. Il piano non è stato confermato.';
  console.error('Salvataggio piano:',error);
 }finally{btn.disabled=false;}
},true);
