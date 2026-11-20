// Selezione prudente e deterministica di un allenamento ESISTENTE su Google Calendar.
// Non modifica un Piano e non sceglie mai arbitrariamente tra eventi omonimi.
const DAYS=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const norm=s=>String(s||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’]/g,"'");
const pad=n=>String(n).padStart(2,'0');
const dateOK=s=>/^20\d{2}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function dateIn(text,year){
 const iso=text.match(/\b20\d{2}-\d{2}-\d{2}\b/);if(iso)return dateOK(iso[0])?iso[0]:null;
 const numeric=text.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d\d|\d\d))?\b/);
 if(numeric){let y=Number(numeric[3]||year);if(y<100)y+=2000;const dt=`${y}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;return dateOK(dt)?dt:null;}
 for(let i=0;i<MONTHS.length;i++){
  const m=text.match(new RegExp('\\b(\\d{1,2})\\s+'+MONTHS[i]+'(?:\\s+(20\\d{2}))?\\b'));
  if(m){const dt=`${Number(m[2]||year)}-${pad(i+1)}-${pad(Number(m[1]))}`;return dateOK(dt)?dt:null;}
 }
 return null;
}
function dayIn(text){return DAYS.findIndex(d=>new RegExp('\\b'+d+'\\b').test(text));}
function timeIn(text){const m=text.match(/\b(?:alle|ore|verso\s+le)\s*(\d{1,2})(?:[:.,](\d{2}))?\b/);if(!m)return null;const h=+m[1],mi=+(m[2]||0);return h<24&&mi<60?`${pad(h)}:${pad(mi)}`:null;}
function addDays(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function explicitRelativeDate(text,today){if(/\bdopodomani\b/.test(text))return addDays(today,2);if(/\bdomani\b/.test(text))return addDays(today,1);if(/\boggi\b/.test(text))return today;return null;}
const weekdayOf=s=>new Date(s+'T12:00:00Z').getUTCDay();
function addWallMinutes(startLocal,minutes){const start=new Date(startLocal+':00Z');return new Date(start.getTime()+minutes*60000).toISOString().slice(0,16);}
function keywordForMove(source){
 if(/\blung[oa]\b|\blong\s+run\b/.test(source))return 'lungo';
 if(/\bripetut|\binterval/.test(source))return 'ripetute';
 if(/\bfacile\b|\beasy\b/.test(source))return 'facile';
 if(/\britmo\b|\btempo\b/.test(source))return 'ritmo';
 if(/\bgara\b|\bmaratona\b/.test(source))return 'gara';
 return 'allenamento';
}
function titleMatches(title,keyword){
 const t=norm(title);
 if(keyword==='lungo')return /\blung[oa]\b|\blong\s+run\b/.test(t);
 if(keyword==='ripetute')return /ripetut|interval/.test(t);
 if(keyword==='facile')return /facile|easy/.test(t);
 if(keyword==='ritmo')return /ritmo|tempo\s+run/.test(t);
 if(keyword==='gara')return /\bgara\b|maraton|race/.test(t);
 return /allenament|corsa|running|\blungo\b|ripetut|ritmo\s+controllato/.test(t);
}
export function selectCalendarMove(message,events,{today}={}){
 const msg=norm(message).trim();
 // Nei chiarimenti della chat, una data aggiunta dopo il comando originale
 // deve poter identificare la seduta, senza alterare la destinazione scelta.
 const detailMarker='\ndettaglio aggiunto:';
 const detailAt=msg.indexOf(detailMarker);
 const followUp=detailAt>=0?msg.slice(detailAt+detailMarker.length).trim():'';
 const command=detailAt>=0?msg.slice(0,detailAt):msg;
 if(!dateOK(today||''))throw Error('Data corrente non valida');
 if(!/\b(spost\w*|posticip\w*|anticip\w*|cambi\w*|modific\w*)\b/.test(msg))return {needsClarification:true,message:'Chiedimi quale allenamento spostare e in quale giorno.'};
 const match=/\s+(?:a|al|alla|per)\s+(?=(?:oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|20\d{2}-|\d{1,2}[/.]|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))\b)/.exec(command);
 if(!match)return {needsClarification:true,message:'Indicami il giorno di destinazione, per esempio «a domenica» o «al 29 novembre».'};
 const source=command.slice(0,match.index),dest=command.slice(match.index+match[0].length);
 const sourceDay=dayIn(source),targetDay=dayIn(dest);
 const followDay=dayIn(followUp),followDate=dateIn(followUp,+today.slice(0,4))||explicitRelativeDate(followUp,today);
 const followForSource=followDate&&(sourceDay<0||followDay<0||followDay===sourceDay)?followDate:null;
 const followForTarget=followDate&&targetDay>=0&&followDay===targetDay?followDate:null;
 const sourceDate=dateIn(source,+today.slice(0,4))||explicitRelativeDate(source,today)||followForSource;
 const targetDate=dateIn(dest,+today.slice(0,4))||explicitRelativeDate(dest,today)||followForTarget;
 const targetTime=timeIn(dest)||timeIn(followUp);
 if(!targetDate&&targetDay<0)return {needsClarification:true,message:'Indicami la nuova data precisa dell’allenamento.'};
 const key=keywordForMove(source);
 const candidates=(Array.isArray(events)?events:[]).filter(e=>{
  const day=String(e.startLocal||'').slice(0,10);
  if(!dateOK(day)||day<today||e.allDay||!e.startLocal||!e.endLocal||e.eventKind==='completed-workout')return false;
  if(e.eventType&&e.eventType!=='default')return false;
  if(!e.calendarMoveWritable)return false;
  if(sourceDate&&day!==sourceDate)return false;
  if(sourceDay>=0&&weekdayOf(day)!==sourceDay)return false;
  return titleMatches(e.title,key);
 });
 if(!candidates.length)return {needsClarification:true,message:'Non trovo un allenamento compatibile in Google Calendar nei prossimi 56 giorni. Dimmi il titolo e la data esatta, oppure controlla che sia nel calendario collegato.'};
 if(candidates.length>1){
  const dates=candidates.slice(0,5).map(e=>`${e.title} (${e.startLocal.slice(0,10)})`).join(' · ');
  return {needsClarification:true,message:'Ho trovato più allenamenti: '+dates+'. Indicami la data esatta di quello da spostare.'};
 }
 const e=candidates[0],sourceStart=e.startLocal,sourceEnd=e.endLocal;
 const elapsed=Math.round((Date.parse(sourceEnd+':00Z')-Date.parse(sourceStart+':00Z'))/60000);
 if(!Number.isInteger(elapsed)||elapsed<1||elapsed>720)return {needsClarification:true,message:'La durata dell’evento non è chiara. Controlla l’orario in Google Calendar.'};
 let day=targetDate;
 if(!day){const fromDay=weekdayOf(sourceStart.slice(0,10));day=addDays(sourceStart.slice(0,10),(targetDay-fromDay+7)%7);}
 const time=targetTime||sourceStart.slice(11,16);
 const newStart=day+'T'+time,newEnd=addWallMinutes(newStart,elapsed);
 if(day<today)return {needsClarification:true,message:'La nuova data è nel passato. Indicami una data futura.'};
 if(newStart===sourceStart)return {needsClarification:true,message:'L’allenamento è già programmato nel giorno e nell’orario indicati.'};
 return {event:e,originalStart:sourceStart,originalEnd:sourceEnd,newStart,newEnd,durationMinutes:elapsed,summary:`Propongo di spostare “${e.title}” dal ${sourceStart.slice(0,10)} alle ${sourceStart.slice(11,16)} al ${day} alle ${time}, mantenendo la durata di ${elapsed} minuti.`};
}
export function overlappingEvent(events,{id,calendarId,newStart,newEnd}={}){
 const from=Date.parse(newStart+':00Z'),to=Date.parse(newEnd+':00Z');
 return (events||[]).find(e=>e.busy&&!(e.id===id&&e.calendarId===calendarId)&&from<Date.parse(String(e.endLocal)+':00Z')&&to>Date.parse(String(e.startLocal)+':00Z'))||null;
}
