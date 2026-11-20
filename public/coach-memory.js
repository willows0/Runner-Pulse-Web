// Chat Runner Pulse: cronologia personale Firestore, nessun messaggio fittizio.
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
const auth=getAuth();
const coach=document.getElementById('coach');
if(coach){
 const history=coach.querySelector('#rp-ai-history');
 const form=coach.querySelector('#rp-ai-form');
 const question=coach.querySelector('#rp-ai-question');
 const status=coach.querySelector('#rp-ai-status');
 const send=coach.querySelector('#rp-ai-send');
 const quick=coach.querySelector('#rp-coach-quick');
 const suggestions=coach.querySelector('#rp-coach-suggestions');
 const mic=coach.querySelector('#rp-coach-mic');
 const screenshotFile=coach.querySelector('#rp-coach-screenshot-file');
 const attachmentFile=coach.querySelector('#rp-coach-attachment-file');
 const attachmentsMenu=coach.querySelector('#rp-coach-attachments');
 const attachPhotoButton=coach.querySelector('#rp-coach-attach-photo');
 const attachFileButton=coach.querySelector('#rp-coach-attach-file');
 // Cancella esclusivamente i messaggi Coach dell'utente autenticato.
 const resetCoach=document.createElement('button');
 resetCoach.type='button';
 resetCoach.textContent='Azzera memoria Coach';
 resetCoach.setAttribute('aria-label','Cancella tutte le conversazioni salvate con il Coach');
 resetCoach.style.cssText='display:block;margin:10px 12px 8px auto;padding:8px 12px;border:1px solid #e1a17c;border-radius:12px;background:#fff8f2;color:#9c3d10;font:inherit;font-size:12px;cursor:pointer';
 history.parentNode.insertBefore(resetCoach,history);

 let version=0, busy=false;
 function scrollToLatest(){requestAnimationFrame(()=>{history.scrollTop=history.scrollHeight;});}
 function showAnswerStart(row){requestAnimationFrame(()=>{history.scrollTop=Math.max(0,row.offsetTop-history.offsetTop-10);});}
 // Ricalcola la posizione quando cambia l'altezza del campo o della chat.
 // Non spostare la risposta mentre cambia l'altezza della chat o si apre la tastiera.
 // Anche quando la scheda viene riaperta, mostra la fine della conversazione.
 document.querySelectorAll('nav button[data-page="coach"]').forEach(button=>button.addEventListener('click',()=>{scrollToLatest();setTimeout(scrollToLatest,80);}));
 async function api(payload){const user=auth.currentUser;if(!user)throw new Error('Accedi con Google per parlare con il Coach.');const token=await user.getIdToken();const r=await fetch('/api/coach/chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok||!data.success)throw new Error(data.message||`Errore HTTP ${r.status}`);return data;}
 function bubble(role,message,{scroll=true}={}){const user=role==='user';const row=document.createElement('div');row.className='rp-chat-row '+(user?'rp-chat-user':'rp-chat-assistant');if(!user){const avatar=document.createElement('img');avatar.src='/coach-robot.png';avatar.alt='';avatar.className='rp-chat-avatar';row.append(avatar);}const wrap=document.createElement('div');wrap.className='rp-chat-bubble';const p=document.createElement('p');p.textContent=message;wrap.append(p);row.append(wrap);history.append(row);if(scroll){if(user)scrollToLatest();else showAnswerStart(row);}return row;}
 async function loadHistory(){const current=++version;status.textContent='Caricamento conversazione…';try{const data=await api({action:'history'});if(current!==version)return;history.replaceChildren();for(const m of data.messages||[])bubble(m.role,m.text,{scroll:false});status.textContent='';scrollToLatest();}catch(e){if(current===version)status.textContent=e.message;}}
 onAuthStateChanged(auth,user=>{if(user)void loadHistory();else{version++;history.replaceChildren();status.textContent='Accedi con Google per utilizzare il Coach.';}});
 resetCoach.addEventListener('click',async()=>{
   if(busy)return;
   if(!auth.currentUser){status.textContent='Accedi con Google prima di azzerare la memoria.';return;}
   if(!window.confirm('Cancellare definitivamente tutte le conversazioni del Coach di questo account? Gli allenamenti Garmin non verranno toccati.'))return;
   busy=true;resetCoach.disabled=true;send.disabled=true;status.textContent='Cancellazione memoria Coach in corso…';
   try{await api({action:'clear'});version++;history.replaceChildren();status.textContent='Memoria Coach azzerata. Puoi iniziare una nuova conversazione.';}
   catch(e){status.textContent='Cancellazione non riuscita: '+e.message;}
   finally{busy=false;resetCoach.disabled=false;send.disabled=false;}
 });
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const message=question.value.trim();if(!message)return;busy=true;send.disabled=true;status.textContent='Il Coach sta rispondendo…';suggestions.hidden=true;try{const simplified=message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const deletePlan=/(?:elimin|cancell|rimuov|azzer)/.test(simplified)&&/\b(piano|programma)\b/.test(simplified)&&!/\b(?:seduta|allenamento)\s+(?:di|del|per)\s+(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)/.test(simplified);
   // Le richieste esplicite di aggiunta appuntamenti vanno al modulo Calendar,
   // non al generatore di piani. La dettatura usa questo stesso percorso.
   const calendarIntent=/(?:aggiung|segn|inserisc|mett|crea|fiss|prenot|ricord).{0,160}\b(?:calendar|calendario|impegno|appuntamento|visita|riunione|dentista|turno|scuola|medico)\b|\bcalendario\b.{0,100}(?:aggiung|segn|inserisc|metti|crea)|\b(?:ho|avro|avr[oò])(?:\s+(?:un|una|il|la|l'))?\s+(?:visita|appuntamento|riunione|dentista|turno|lezione)\b|\b(?:lavoro|turno|scuola|lezione|visita|dentista|riunione|medico|ospedale|colloquio)\b.{0,130}\b(?:domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|dalle|alle|ore)\b/.test(simplified);
   if(calendarIntent){
     if(!window.runnerPulseProposeCalendarCommitment)throw Error('Collegamento con il calendario non ancora disponibile.');
     const proposal=await window.runnerPulseProposeCalendarCommitment(message);
     bubble('user',message,{scroll:false});question.value='';question.blur();
     bubble('assistant',proposal.created?'Impegno “'+proposal.title+'” '+(proposal.alreadyExists?'già presente':'salvato automaticamente')+' su Google Calendar.': 'Mancano alcuni dettagli per “'+(proposal.title||'Nuovo impegno')+'”. Completa il modulo per salvarlo.');
     status.textContent=proposal.created?'Impegno registrato nel calendario.':'Completa i dati nel modulo.';
   }else if(deletePlan){
     bubble('user',message,{scroll:false});question.value='';question.blur();
     const row=bubble('assistant','Vuoi eliminare il piano di allenamento salvato? Le attività registrate rimarranno intatte. La cancellazione richiede la tua conferma.');
     const button=document.createElement('button');button.type='button';button.textContent='Conferma eliminazione piano';button.className='rp-plan-chat-delete';
     row.querySelector('.rp-chat-bubble')?.appendChild(button);
     button.addEventListener('click',async()=>{button.disabled=true;try{if(!window.runnerPulseDeletePlan)throw Error('Funzione Piano non disponibile.');const ok=await window.runnerPulseDeletePlan();if(ok){button.textContent='Piano eliminato ✓';window.rpCoachEditingPlan=false;status.textContent='Piano cancellato dal tuo account.';}else button.disabled=false;}catch(err){button.disabled=false;status.textContent=err.message;}});
     status.textContent='Il piano non è stato ancora eliminato.';
   }else{
   const planIntent=Boolean(window.rpCoachEditingPlan)||(/\b(piano|programma|sedut[ae]|allenament[oi])\b/.test(simplified)&&/modific|spost|anticip|posticip|riduc|aument|cambi|sostituisc|aggiung|tog|elimin|riposo|data|orari|giorn|recuper/.test(simplified));
   const data=await api({action:planIntent?'plan-edit':'chat',message});
   bubble('user',message,{scroll:false});question.value='';question.blur();
   if(planIntent){
     const row=bubble('assistant',data.summary+'\n\nQuesta è una proposta. Il piano NON cambia finché non premi “Approva modifica”.');
     const button=document.createElement('button');button.type='button';button.textContent='Approva modifica del piano';button.className='rp-plan-chat-approve';
     row.querySelector('.rp-chat-bubble')?.appendChild(button);
     button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Salvataggio piano…';try{if(data.draft){if(!window.runnerPulseSaveDraft)throw Error('Apri Piano e riprova.');await window.runnerPulseSaveDraft(data.sessions,data.revision);button.textContent='Bozza modificata ✓';status.textContent='Bozza aggiornata. Puoi approvarla dalla scheda Piano.';}else{if(!window.runnerPulseSavePlan)throw Error('Apri Piano e riprova.');await window.runnerPulseSavePlan(data.sessions,data.revision);button.textContent='Modifica salvata ✓';status.textContent='Piano aggiornato nel tuo account Google.';}window.rpCoachEditingPlan=false;}catch(err){button.disabled=false;status.textContent='Modifica non salvata: '+err.message;}});
     status.textContent='Verifica la proposta e premi Approva modifica se sei soddisfatto.';
   } else {bubble('assistant',data.answer);status.textContent='';}
   }
 }catch(err){status.textContent=err.message;}finally{busy=false;send.disabled=false;}});
 question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
 suggestions.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{question.value=b.dataset.prompt;suggestions.hidden=true;question.focus();}));
 const closeAttachments=()=>{if(attachmentsMenu)attachmentsMenu.hidden=true;if(quick)quick.setAttribute('aria-expanded','false');};
 const openAttachments=()=>{if(attachmentsMenu)attachmentsMenu.hidden=false;if(quick)quick.setAttribute('aria-expanded','true');};
 quick?.addEventListener('click',()=>{if(!attachmentsMenu)return;attachmentsMenu.hidden?openAttachments():closeAttachments();suggestions.hidden=true;});
 document.addEventListener('click',event=>{if(!attachmentsMenu||attachmentsMenu.hidden)return;const target=event.target;if(attachmentsMenu.contains(target)||quick?.contains(target))return;closeAttachments();});
 attachPhotoButton?.addEventListener('click',()=>{closeAttachments();screenshotFile?.click();});
 attachFileButton?.addEventListener('click',()=>{closeAttachments();attachmentFile?.click();});
 async function importScreenshotFile(file){
  if(!file)return;
  if(attachPhotoButton)attachPhotoButton.disabled=true;
  if(attachFileButton)attachFileButton.disabled=true;
  status.textContent='Leggo data e orari nello screenshot…';
  try{
   if(!window.runnerPulseImportCalendarScreenshot)throw Error('Google Calendar non pronto. Apri Piano prima di riprovare.');
   const result=await window.runnerPulseImportCalendarScreenshot(file);
   const created=result.created||[],skipped=result.skipped||[];
   const lines=[`Screenshot: ${created.filter(x=>!x.alreadyExists).length} nuovi impegni, ${created.filter(x=>x.alreadyExists).length} già presenti, ${skipped.length} non inseriti.`];
   for(const e of created.slice(0,12))lines.push(`${e.alreadyExists?'Già presente':'Aggiunto'}: ${e.title} · ${e.date} ${e.allDay?'tutto il giorno':e.startTime+'–'+e.endTime}`);
   if(skipped.length)lines.push('Non riconosciuti: '+skipped.slice(0,4).join(' · '));
   bubble('assistant',lines.join('\n'));
   status.textContent=created.length?'Screenshot elaborato: controlla gli eventi sul calendario.':'Non ho riconosciuto appuntamenti completi; nessun evento è stato creato.';
  }catch(err){status.textContent='Screenshot non importato: '+err.message;}
  finally{if(attachPhotoButton)attachPhotoButton.disabled=false;if(attachFileButton)attachFileButton.disabled=false;}
 }
 async function handleGenericAttachment(file){
  if(!file)return;
  const name=String(file.name||'file');
  const lower=name.toLowerCase();
  if((file.type||'').startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(lower))return importScreenshotFile(file);
  if(/\.(fit|zip)$/i.test(lower)){
    bubble('assistant','Per i file FIT o ZIP usa Attività → Importa attività. Qui nel Coach posso leggere soprattutto screenshot, immagini o file di testo brevi.');
    status.textContent='Per FIT o ZIP usa la pagina Attività.';
    return;
  }
  if(/\.pdf$/i.test(lower)){
    bubble('assistant',`Ho ricevuto “${name}”. Per ora il Coach non legge direttamente i PDF: se vuoi, fai uno screenshot oppure copia qui il testo principale.`);
    status.textContent='PDF selezionato: usa screenshot o copia il testo.';
    return;
  }
  const textLike=(file.type||'').startsWith('text/')||/\.(txt|md|csv|json|ics|xml|tcx)$/i.test(lower);
  if(textLike){
    if(file.size>350000)throw Error('File troppo grande per la chat del Coach.');
    const raw=await file.text();
    const prefix=[question.value.trim(),`[File allegato: ${name.slice(0,80)}]`].filter(Boolean).join('\n');
    const available=Math.max(0,Math.min(1100,1500-prefix.length-2));
    const snippet=raw.trim().slice(0,available);
    if(!snippet)throw Error('La casella del messaggio è piena: cancella parte del testo e riprova.');
    question.value=[prefix,snippet].filter(Boolean).join('\n');
    question.focus();
    status.textContent='File aggiunto al messaggio. Ora puoi scrivere o inviare.';
    bubble('assistant',`Ho allegato “${name}” al messaggio come testo. Aggiungi pure la tua richiesta e poi invia.`);
    return;
  }
  bubble('assistant',`Ho ricevuto “${name}”, ma in questa chat posso usare direttamente soprattutto foto, screenshot e file di testo brevi.`);
  status.textContent='Tipo di file non supportato in chat.';
 }
 screenshotFile?.addEventListener('change',async()=>{const file=screenshotFile.files?.[0];screenshotFile.value='';await importScreenshotFile(file);});
 attachmentFile?.addEventListener('change',async()=>{const file=attachmentFile.files?.[0];attachmentFile.value='';try{await handleGenericAttachment(file);}catch(err){status.textContent=err.message;}});
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(SpeechRecognition){const recognizer=new SpeechRecognition();recognizer.lang='it-IT';recognizer.interimResults=false;recognizer.addEventListener('result',e=>{const t=e.results?.[0]?.[0]?.transcript;if(t)question.value=[question.value.trim(),t].filter(Boolean).join(' ').slice(0,1500);question.focus();});recognizer.addEventListener('error',()=>{status.textContent='Dettatura non disponibile. Puoi scrivere il messaggio.';});mic.addEventListener('click',()=>{try{recognizer.start();status.textContent='Ti ascolto…';}catch{status.textContent='Dettatura non disponibile.';}});}else{mic.addEventListener('click',()=>{status.textContent='La dettatura non è supportata da questo browser. Usa il microfono della tastiera.';question.focus();});}
}
