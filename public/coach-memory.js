// Chat Runner Pulse: cronologia personale Firestore, nessun messaggio fittizio.
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {isSessionBusy,sessionWindow} from './calendar-slot-planner.js';
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
 const nav=document.querySelector('body > nav[aria-label="Navigazione"]');
 function updateNavigationHeight(){
   if(nav&&!document.body.classList.contains('rp-coach-keyboard-open')){
     const px=Math.ceil(nav.getBoundingClientRect().height);
     if(px>0)coach.style.setProperty('--rp-coach-bottom-nav',px+'px');
   }
 }
 updateNavigationHeight();
 window.addEventListener('resize',updateNavigationHeight);
 if(typeof ResizeObserver==='function'&&nav)new ResizeObserver(updateNavigationHeight).observe(nav);
 function resizeMessageBox(){
   if(!question)return;
   question.style.height='43px';
   question.style.height=Math.min(136,Math.max(43,question.scrollHeight))+'px';
   if(send)send.disabled=busy||!question.value.trim();
 }
 question?.addEventListener('input',resizeMessageBox);
 question?.addEventListener('focus',()=>{
   coach.classList.add('rp-coach-writing');
   document.body.classList.add('rp-coach-keyboard-open');
 });
 question?.addEventListener('blur',()=>{
   coach.classList.remove('rp-coach-writing');
   document.body.classList.remove('rp-coach-keyboard-open');
   requestAnimationFrame(updateNavigationHeight);
 });
 // Cancella esclusivamente i messaggi Coach dell'utente autenticato.
 const resetCoach=document.createElement('button');
 resetCoach.type='button';
 resetCoach.textContent='Azzera memoria Coach';
 resetCoach.setAttribute('aria-label','Cancella tutte le conversazioni salvate con il Coach');
 resetCoach.style.cssText='display:block;margin:10px 12px 8px auto;padding:8px 12px;border:1px solid #e1a17c;border-radius:12px;background:#fff8f2;color:#9c3d10;font:inherit;font-size:12px;cursor:pointer';
 history.parentNode.insertBefore(resetCoach,history);

 let version=0, busy=false;
 let pendingCalendarText=''; // appuntamento incompleto: completamento nella chat senza aprire modali
 let pendingCalendarMoveText=''; // richiesta di spostamento ambigua: chiarimento in chat
 resizeMessageBox();
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
 async function handleCalendarMove(message){
  if(!window.runnerPulseProposeCalendarMove||!window.runnerPulseApplyCalendarMove)throw Error('Il collegamento tra Coach e Google Calendar non è disponibile. Ricarica Runner Pulse.');
  const completeMessage=pendingCalendarMoveText?pendingCalendarMoveText+'\nDettaglio aggiunto: '+message:message;
  const result=await window.runnerPulseProposeCalendarMove(completeMessage);
  bubble('user',message,{scroll:false});question.value='';question.blur();resizeMessageBox();
  if(result.needsClarification){
   pendingCalendarMoveText=completeMessage;
   bubble('assistant',result.summary||'Indicami la data esatta e l’ora dell’allenamento da spostare.');
   status.textContent='In attesa dei dettagli per lo spostamento su Google Calendar.';
   return;
  }
  pendingCalendarMoveText='';
  const row=bubble('assistant',result.summary+'\n\nNon modifico nulla finché non confermi.');
  const button=document.createElement('button');button.type='button';button.className='rp-plan-chat-approve';button.textContent='Conferma spostamento su Calendar';
  row.querySelector('.rp-chat-bubble')?.append(button);
  button.addEventListener('click',async()=>{
   button.disabled=true;status.textContent='Sposto l’allenamento su Google Calendar…';
   try{
    const updated=await window.runnerPulseApplyCalendarMove(result.ticket);
    button.textContent=updated.alreadyMoved?'Già spostato ✓':'Spostamento completato ✓';
    status.textContent='Allenamento aggiornato su Google Calendar.';
    bubble('assistant','Fatto: “'+(updated.eventTitle||result.eventTitle||'Allenamento')+'” è sul calendario il '+(updated.newDate||result.newDate)+' alle '+(updated.newTime||result.newTime)+'. La durata è rimasta invariata.');
   }catch(error){
    button.disabled=false;status.textContent='Spostamento non riuscito: '+error.message;
    bubble('assistant','Non ho modificato il calendario: '+error.message);
   }
  });
  status.textContent='Verifica il giorno e l’ora, poi conferma lo spostamento.';
 }
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const message=question.value.trim();if(!message)return;busy=true;send.disabled=true;status.textContent='Il Coach sta rispondendo…';suggestions.hidden=true;try{const simplified=message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   const deletePlan=/(?:elimin|cancell|rimuov|azzer)/.test(simplified)&&/\b(piano|programma)\b/.test(simplified)&&!/\b(?:seduta|allenamento)\s+(?:di|del|per)\s+(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)/.test(simplified);
   // Le richieste esplicite di aggiunta appuntamenti vanno al modulo Calendar,
   // non al generatore di piani. La dettatura usa questo stesso percorso.
   const explicitPlanMove=/(?:spost|anticip|posticip|cambia|modifica)/.test(simplified)&&/\b(?:corsa|corse|correre|lungo|ripetut[ae]|allenament[oi]|sedut[ae]|piano|programma|ritmo controllato)\b/.test(simplified);
   const explicitCalendarMove=explicitPlanMove&&/\b(?:su|nel|in)\s+(?:google\s+)?(?:calendar|calendario)\b/.test(simplified);
   const calendarIntent=/(?:aggiung|segn|inserisc|mett|crea|fiss|prenot|ricord).{0,160}\b(?:calendar|calendario|impegno|appuntamento|visita|riunione|dentista|turno|scuola|medico|spesa|spese|pagamento|pagare|bolletta|cena|pranzo|ristorante)\b|\bcalendario\b.{0,100}(?:aggiung|segn|inserisc|metti|crea)|\b(?:ho|avro|avr[oò])(?:\s+(?:un|una|il|la|l'))?\s+(?:visita|appuntamento|riunione|dentista|turno|lezione)\b|\b(?:lavoro|turno|scuola|lezione|visita|dentista|riunione|medico|ospedale|colloquio|pagare|affitto|bolletta|cena|pranzo|ristorante|spesa)\b.{0,130}\b(?:domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|dalle|alle|ore)\b/.test(simplified)&&!explicitPlanMove;
   // Un allenamento da registrare in calendario non è una modifica al Piano.
   const workoutCalendarIntent=/(?:salv|registr|inserisc|aggiung|segn|mett|crea).{0,100}\b(?:allenament[oi]|corsa|corse|lungo|ripetut[ae]|sedut[ae])\b/.test(simplified)&&!/(?:piano|programma)/.test(simplified);
   if(pendingCalendarMoveText&&/^(annulla|lascia perdere|non importa|cancella richiesta)[.!\s]*$/i.test(message)){
     pendingCalendarMoveText='';bubble('user',message,{scroll:false});question.value='';bubble('assistant','Va bene, non sposto alcun allenamento.');status.textContent='';
   }else if(explicitCalendarMove||pendingCalendarMoveText){
     await handleCalendarMove(message);
   }else if(((calendarIntent||workoutCalendarIntent)&&!explicitPlanMove) || pendingCalendarText){
     if(!window.runnerPulseProposeCalendarCommitment)throw Error('Collegamento con il calendario non ancora disponibile.');
     if(pendingCalendarText&&/^(annulla|lascia perdere|non importa|cancella richiesta)[.!\s]*$/i.test(message)){
      pendingCalendarText='';bubble('user',message,{scroll:false});bubble('assistant','Va bene, non aggiungo alcun appuntamento.');question.value='';status.textContent='';
     }else{
      const fullText=pendingCalendarText?pendingCalendarText+'\nDettaglio aggiunto successivamente: '+message:message;
      const proposal=await window.runnerPulseProposeCalendarCommitment(fullText);
      bubble('user',message,{scroll:false});question.value='';question.blur();
      if(proposal.created){
       pendingCalendarText='';
       bubble('assistant',(proposal.category==='sport'||proposal.category==='race'?'Allenamento':'Impegno')+' “'+proposal.title+'” '+(proposal.alreadyExists?'già presente':'salvato automaticamente')+' su Google Calendar.'+(proposal.startTime&&proposal.endTime?' Dalle '+proposal.startTime+' alle '+proposal.endTime+(proposal.endDate&&proposal.endDate!==proposal.date?' del giorno successivo':'')+'.':''));
       status.textContent='Impegno registrato nel calendario.';
      }else{
       pendingCalendarText=fullText;
       bubble('assistant',(proposal.message||'Mi manca un dettaglio per salvarlo.')+' Scrivimelo qui, senza aprire altre schermate. Oppure scrivi «annulla».');
       status.textContent='In attesa dei dettagli per l’appuntamento.';
      }
     }
   }else if(deletePlan){
     bubble('user',message,{scroll:false});question.value='';question.blur();
     const row=bubble('assistant','Vuoi eliminare il piano di allenamento salvato? Le attività registrate rimarranno intatte. La cancellazione richiede la tua conferma.');
     const button=document.createElement('button');button.type='button';button.textContent='Conferma eliminazione piano';button.className='rp-plan-chat-delete';
     row.querySelector('.rp-chat-bubble')?.appendChild(button);
     button.addEventListener('click',async()=>{button.disabled=true;try{if(!window.runnerPulseDeletePlan)throw Error('Funzione Piano non disponibile.');const ok=await window.runnerPulseDeletePlan();if(ok){button.textContent='Piano eliminato ✓';window.rpCoachEditingPlan=false;status.textContent='Piano cancellato dal tuo account.';}else button.disabled=false;}catch(err){button.disabled=false;status.textContent=err.message;}});
     status.textContent='Il piano non è stato ancora eliminato.';
   }else{
   const planIntent=explicitPlanMove||Boolean(window.rpCoachEditingPlan)||(/\b(piano|programma|sedut[ae]|allenament[oi]|corsa|lungo|ripetut[ae])\b/.test(simplified)&&/modific|spost|anticip|posticip|riduc|aument|cambi|sostituisc|aggiung|tog|elimin|riposo|data|orari|giorn|recuper/.test(simplified));
   let data;
   try{data=await api({action:planIntent?'plan-edit':'chat',message});}
   catch(error){
    // Un allenamento esistente su Google Calendar può non appartenere a un Piano.
    if(planIntent&&explicitPlanMove&&/non hai ancora un piano salvato/i.test(error.message)){
     await handleCalendarMove(message);
     return;
    }
    throw error;
   }
   bubble('user',message,{scroll:false});question.value='';question.blur();
   if(planIntent){
     if(data.needsClarification){
       bubble('assistant',data.summary||'Indicami quale allenamento vuoi spostare, con data di partenza e nuova data o ora.');
       status.textContent='Specifica la seduta e il nuovo giorno/orario.';
     }else{
       const changed=Array.isArray(data.changedIndices)?data.changedIndices:[];
       const moved=changed.filter(i=>data.originalSessions?.[i]&&(data.originalSessions[i].date!==data.sessions?.[i]?.date||data.originalSessions[i].time!==data.sessions?.[i]?.time));
       const changedLines=moved.map(i=>`${data.originalSessions[i].title}: ${data.originalSessions[i].date} ${data.originalSessions[i].time} → ${data.sessions[i].date} ${data.sessions[i].time}`);
       const row=bubble('assistant',data.summary+(changedLines.length?'\n\n'+changedLines.join('\n'):'')+'\n\nIl piano non cambia finché non approvi.');
       const button=document.createElement('button');button.type='button';button.textContent='Approva modifica del piano';button.className='rp-plan-chat-approve';
       row.querySelector('.rp-chat-bubble')?.appendChild(button);
       button.addEventListener('click',async()=>{
         button.disabled=true;status.textContent='Verifico gli impegni e salvo il Piano…';let saved=false;
         try{
           if(!Array.isArray(data.sessions)||!data.sessions.length)throw Error('La proposta non contiene sedute valide.');
           const rows=data.sessions;
           // Una seduta non può sovrapporsi ad altre sessioni del programma.
           for(const i of changed){
             const s=rows[i];if(!s)throw Error('Seduta non trovata: aggiorna il Piano.');
             const a=sessionWindow(s);
             for(let j=0;j<rows.length;j++){
               if(j===i)continue;
               const b=sessionWindow(rows[j]);
               if(a.start<b.end&&a.end>b.start)throw Error('La seduta “'+s.title+'” si sovrappone a “'+rows[j].title+'”. Scegli un altro orario.');
             }
           }
           if(moved.length&&typeof window.runnerPulseCalendarConnection==='function'){
             const linked=await window.runnerPulseCalendarConnection();
             if(linked){
               if(typeof window.runnerPulseGetCalendarAgenda!=='function')throw Error('Verifica Google Calendar non disponibile.');
               const agenda=await window.runnerPulseGetCalendarAgenda({force:true});
               if(!agenda||!Array.isArray(agenda.events))throw Error('Non sono riuscito a verificare gli impegni Google. Riprova.');
               for(const i of moved){
                 const s=rows[i];
                 if(s.date<agenda.from||s.date>=agenda.to)throw Error('Il '+s.date+' è fuori dal periodo di Google Calendar verificato. Riprova con una data nei prossimi 42 giorni.');
                 if(isSessionBusy(s,agenda.events,15))throw Error('Hai un impegno Google Calendar che si sovrappone alla seduta del '+s.date+' alle '+s.time+'. Scegli un altro orario.');
               }
             }
           }
           if(data.draft){
             if(!window.runnerPulseSaveDraft)throw Error('Apri Piano e riprova.');
             await window.runnerPulseSaveDraft(rows,data.revision);saved=true;
             button.textContent='Bozza aggiornata ✓';
             status.textContent='Bozza salvata. Apri Piano e approvala per sincronizzare Google Calendar.';
             bubble('assistant','Bozza aggiornata. Per rendere definitivo lo spostamento premi Approva e salva nella scheda Piano.');
           }else{
             if(!window.runnerPulseSavePlan)throw Error('Apri Piano e riprova.');
             await window.runnerPulseSavePlan(rows,data.revision);saved=true;
             if(typeof window.runnerPulseCalendarConnection==='function'&&await window.runnerPulseCalendarConnection()){
               if(!window.runnerPulseSyncPlanAfterEdit)throw Error('Funzione sincronizzazione Google Calendar non disponibile.');
               await window.runnerPulseSyncPlanAfterEdit({ensureCreated:true});
               button.textContent='Piano e Calendar aggiornati ✓';
               status.textContent='Allenamento spostato nel Piano e su Google Calendar.';
               bubble('assistant','Fatto: ho spostato la seduta nel Piano e aggiornato Google Calendar.');
             }else{
               button.textContent='Piano modificato ✓';
               status.textContent='Piano aggiornato. Google Calendar non è collegato.';
               bubble('assistant','Seduta spostata e Piano salvato. Google Calendar non è collegato.');
             }
           }
           window.rpCoachEditingPlan=false;
         }catch(err){
           if(saved){
             button.textContent='Piano salvato ✓';
             status.textContent='Il Piano è stato modificato, ma Google Calendar non è aggiornato: '+err.message+' Apri Piano → Google Calendar e premi “Sincronizza piano”.';
             bubble('assistant','Il Piano è stato salvato, ma Google Calendar non si è aggiornato: '+err.message+' Apri Piano → Google Calendar e premi “Sincronizza piano”.');
           }else{
             button.disabled=false;
             status.textContent='Modifica non salvata: '+err.message;
             bubble('assistant','Non ho spostato l’allenamento: '+err.message);
           }
         }
       });
       status.textContent='Controlla data e orario, poi premi Approva modifica.';
     }
   } else {bubble('assistant',data.answer);status.textContent='';}
   }
 }catch(err){status.textContent=err.message;}finally{busy=false;resizeMessageBox();}});
 question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(question.value.trim())form.requestSubmit();}});
 suggestions.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{question.value=b.dataset.prompt;suggestions.hidden=true;resizeMessageBox();question.focus();}));
 const closeAttachments=()=>{if(attachmentsMenu)attachmentsMenu.hidden=true;if(quick)quick.setAttribute('aria-expanded','false');};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAttachments();});
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
    resizeMessageBox();question.focus();
    status.textContent='File aggiunto al messaggio. Ora puoi scrivere o inviare.';
    bubble('assistant',`Ho allegato “${name}” al messaggio come testo. Aggiungi pure la tua richiesta e poi invia.`);
    return;
  }
  bubble('assistant',`Ho ricevuto “${name}”, ma in questa chat posso usare direttamente soprattutto foto, screenshot e file di testo brevi.`);
  status.textContent='Tipo di file non supportato in chat.';
 }
 screenshotFile?.addEventListener('change',async()=>{const file=screenshotFile.files?.[0];screenshotFile.value='';await importScreenshotFile(file);});
 attachmentFile?.addEventListener('change',async()=>{const file=attachmentFile.files?.[0];attachmentFile.value='';try{await handleGenericAttachment(file);}catch(err){status.textContent=err.message;}});
 // Nella WebView la Web Speech API può essere assente: qui c'è un ponte opzionale
 // verso il riconoscimento vocale NATIVO Android. Il pulsante non invia mai il messaggio.
 function insertDictation(transcript){
  const words=String(transcript||'').trim();if(!words)return;
  question.value=[question.value.trim(),words].filter(Boolean).join(' ').slice(0,1500);
  resizeMessageBox();question.focus();status.textContent='Testo dettato: controllalo e premi Invia quando vuoi.';
 }
 window.addEventListener('runnerpulse:native-speech-result',event=>{
  const data=event.detail||{};
  if(data.text){insertDictation(data.text);return;}
  if(data.cancelled){status.textContent='Dettatura annullata.';return;}
  status.textContent=String(data.error||'Dettatura non disponibile. Usa il microfono della tastiera.');
 });
 const NativeBridge=window.RunnerPulseHealthNative;
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let recognizer=null;
 if(SpeechRecognition){
  try{
   recognizer=new SpeechRecognition();recognizer.lang='it-IT';recognizer.interimResults=false;recognizer.maxAlternatives=1;
   recognizer.addEventListener('result',event=>insertDictation(event.results?.[0]?.[0]?.transcript));
   recognizer.addEventListener('error',event=>{
    const details=event.error==='not-allowed'?'Autorizza il microfono nelle impostazioni del browser.':'Dettatura Web non disponibile. Prova il microfono della tastiera.';
    status.textContent=details;
   });
  }catch{recognizer=null;}
 }
 mic?.addEventListener('click',()=>{
  closeAttachments();
  // La nuova versione APK espone requestSpeechInput. Le versioni vecchie no.
  if(typeof NativeBridge?.requestSpeechInput==='function'){
   status.textContent='Avvio dettatura Android…';
   try{NativeBridge.requestSpeechInput();}catch{status.textContent='Impossibile aprire la dettatura Android.';}
   return;
  }
  if(recognizer){
   try{recognizer.start();status.textContent='Ti ascolto…';}
   catch{status.textContent='Dettatura non disponibile in questa versione. Usa il microfono della tastiera.';question.focus();}
   return;
  }
  status.textContent=/RunnerPulseAndroidWebView\/1/.test(navigator.userAgent)?
   'Per usare il microfono dalla chat devi aggiornare l’APK Runner Pulse Connect. Per ora usa la dettatura della tastiera.':
   'Il browser non supporta questa dettatura. Tocca il campo e usa il microfono della tastiera.';
  question.focus();
 });
}
