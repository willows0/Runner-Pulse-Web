// Runner Pulse - configurazione obiettivo e passaggio al Coach reale.
// Nessun allenamento o impegno Google viene inventato o salvato senza autorizzazione.
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const config={apiKey:'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',authDomain:'runnerpulse.firebaseapp.com',projectId:'runnerpulse',storageBucket:'runnerpulse.firebasestorage.app',messagingSenderId:'602428716854',appId:'1:602428716854:web:1bd814e1ce8534fce6e597'};
const app=getApps().find(a=>a.options.projectId===config.projectId)||initializeApp(config);
const auth=getAuth(app),form=document.getElementById('rp-program-form'),status=document.getElementById('rp-program-status');
let currentUid=null;
const key=uid=>'runnerpulse:program:objective:'+uid;
function toggle(){form.querySelector('#rp-other-distance').hidden=form.elements.distance.value!=='other';form.querySelector('#rp-race-date').hidden=form.elements.race.value!=='yes';}
form.elements.distance.addEventListener('change',toggle);form.elements.race.addEventListener('change',toggle);
onAuthStateChanged(auth,user=>{
 currentUid=user?.uid||null;form.querySelector('button[type=submit]').disabled=!user;
 if(!user){form.reset();toggle();status.textContent='Accedi con Google per configurare il programma.';return;}
 try{const saved=JSON.parse(localStorage.getItem(key(user.uid))||'null');if(saved){for(const [k,v] of Object.entries(saved)){if(form.elements[k])form.elements[k].value=v;}status.textContent='Obiettivo salvato su questo dispositivo. Puoi modificarlo.';}else status.textContent='';}catch{status.textContent='';}toggle();
});
form.addEventListener('submit',event=>{
 event.preventDefault();
 if(!currentUid||auth.currentUser?.uid!==currentUid){status.textContent='Accedi prima con Google.';return;}
 const values=Object.fromEntries(new FormData(form).entries());
 if(values.distance==='other'&&!(Number(values.otherDistance)>0)){status.textContent='Indica la distanza della gara.';return;}
 if(values.race==='yes'&&values.raceDate&&values.raceDate<new Date().toLocaleDateString('en-CA')){status.textContent='La data della gara deve essere futura.';return;}
 localStorage.setItem(key(currentUid),JSON.stringify(values));
 const distance=values.distance==='other'?values.otherDistance:values.distance;
 const distanceText=values.distance==='21.0975'?'mezza maratona (21,1 km)':values.distance==='42.195'?'maratona (42,2 km)':distance+' km';
 const prompt=`Voglio una proposta di programma di allenamento personalizzato, non ancora approvata. Obiettivo: ${values.race==='yes'?'preparare una gara':'migliorare senza una gara fissata'}; distanza: ${distanceText}; data gara: ${values.raceDate||'non indicata'}; livello: ${values.level}; sedute settimanali: ${values.days}; massimo minuti feriali: ${values.weekdayMinutes}; preferenza oraria: ${values.timePreference}. Analizza soltanto i miei dati reali disponibili. Se mancano dati, dillo e chiedi ciò che serve. Proponi una progressione ragionata e sedute con durata e intensità; non affermare di aver consultato Google Calendar perché non è ancora collegato. Chiedimi approvazione prima di salvare allenamenti.`;
 const coach=document.querySelector('nav button[data-page="coach"]');coach?.click();
 const input=document.getElementById('rp-ai-question');
 if(input){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
 status.textContent='Obiettivo salvato. La richiesta è pronta nella chat del Coach: premi Invia.';
});
document.getElementById('rp-calendar-connect')?.addEventListener('click',()=>{
 document.getElementById('rp-calendar-status').textContent='Integrazione Google Calendar da configurare: occorrono autorizzazione Calendar e collegamento sicuro al servizio. Non è stato letto né modificato alcun evento.';
});
document.getElementById('rp-program-replan')?.addEventListener('click',()=>form.requestSubmit());
document.getElementById('rp-program-approve')?.addEventListener('click',()=>{document.getElementById('rp-program-result').textContent='Nessun allenamento è stato salvato: occorre prima completare l’integrazione calendario.';});
