// Runner Pulse · pianificazione deterministica sugli impegni reali di Google Calendar.
// Orari di calendario espressi in Europe/Rome come YYYY-MM-DDTHH:mm.
// Nessun appuntamento fittizio e nessuna seduta sovrapposta a un evento occupato.
const HHMM=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YMD=/^\d{4}-\d{2}-\d{2}$/;
const pad=n=>String(n).padStart(2,'0');
const dateUTC=s=>new Date(s+'T12:00:00Z');
const dateOf=d=>d.toISOString().slice(0,10);
const moveDate=(s,n)=>{const d=dateUTC(s);d.setUTCDate(d.getUTCDate()+n);return dateOf(d);};
const weekday=s=>dateUTC(s).getUTCDay();
const minutesOf=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const clock=n=>pad(Math.floor(n/60))+':'+pad(n%60);
const wallTime=(date,time)=>Date.parse(date+'T'+time+':00Z');
export function sessionWindow(session){
 if(!YMD.test(session?.date||'')||!HHMM.test(session?.time||'')||!Number.isInteger(Number(session.minutes)))throw Error('Seduta con data, ora o durata non valida.');
 const start=wallTime(session.date,session.time);
 return {start,end:start+Number(session.minutes)*60_000};
}
export function busyWindows(events){
 if(!Array.isArray(events))throw Error('Gli impegni di Calendar non sono disponibili.');
 return events.filter(e=>e?.busy!==false&&!e?.runnerPulse).map(e=>{
  const a=Date.parse(String(e.startLocal||'')+':00Z');
  const b=Date.parse(String(e.endLocal||'')+':00Z');
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw Error('Google Calendar ha restituito un intervallo non valido.');
  return {start:a,end:b,allDay:!!e.allDay};
 });
}
export function isSessionBusy(session,events,bufferMinutes=0){
 const {start,end}=sessionWindow(session),buffer=Math.max(0,Number(bufferMinutes)||0)*60_000;
 return busyWindows(events).some(x=>start<x.end+buffer&&end>x.start-buffer);
}
const EARLY=['07:00','08:00','06:30','09:00','10:00'];
const NOON=['13:00','12:30','14:00','15:30','16:30'];
const EVENING=['18:30','19:00','18:00','17:30','20:00','17:00'];
function candidateTimes(wanted,preference,longRun){
 const first=longRun?['09:00','08:00','07:00','10:00','11:00']:(preference==='morning'?EARLY:preference==='afternoon'?NOON:EVENING);
 return [...new Set([wanted,...first,...EARLY,...NOON,...EVENING,'11:00','16:00'])].filter(t=>HHMM.test(t));
}
function candidateDates(wanted,minDate){
 const mon=moveDate(wanted,-((weekday(wanted)+6)%7));
 return Array.from({length:7},(_,i)=>moveDate(mon,i)).filter(d=>d>=minDate)
  .sort((a,b)=>{const da=Math.abs((dateUTC(a)-dateUTC(wanted))/86400000),db=Math.abs((dateUTC(b)-dateUTC(wanted))/86400000);return da-db||a.localeCompare(b);});
}
/** Riprogramma in quattro settimane gli allenamenti, senza modificare gli impegni personali. */
export function fitTrainingAroundEvents(sessions,events,{timePreference='evening',today=null,bufferMinutes=15}={}){
 if(!Array.isArray(sessions)||!sessions.length)throw Error('Genera prima le sedute del programma.');
 const busy=busyWindows(events),occupied=[],usedDates=new Set(),out=[];
 const minDate=today||sessions.reduce((min,s)=>s.date<min?s.date:min,sessions[0].date);
 let rescheduled=0;
 for(const s of sessions){
  const target=s.date, preferred=s.time, longRun=/lungo/i.test(s.title||'');
  let chosen=null;
  for(const date of candidateDates(target,minDate)){
   if(usedDates.has(date))continue;
   for(const time of candidateTimes(preferred,timePreference,longRun)){
    const startMin=minutesOf(time);
    if(startMin<360||startMin+Number(s.minutes)>1320)continue; // 06:00–22:00
    const candidate={...s,date,time};
    const {start,end}=sessionWindow(candidate),buffer=bufferMinutes*60_000;
    if(busy.some(x=>start<x.end+buffer&&end>x.start-buffer))continue;
    if(occupied.some(x=>start<x.end+buffer&&end>x.start-buffer))continue;
    // Prima si cerca uno spazio che lasci almeno un giorno di recupero.
    const tooClose=out.some(x=>Math.abs((dateUTC(x.date)-dateUTC(date))/86400000)<2);
    if(tooClose)continue;
    chosen=candidate;break;
   }
   if(chosen)break;
  }
  // Se è impossibile avere un giorno di recupero, prova comunque giorni diversi.
  if(!chosen){
   for(const date of candidateDates(target,minDate)){
    if(usedDates.has(date))continue;
    for(const time of candidateTimes(preferred,timePreference,longRun)){
     const startMin=minutesOf(time);if(startMin<360||startMin+Number(s.minutes)>1320)continue;
     const candidate={...s,date,time},{start,end}=sessionWindow(candidate),buffer=bufferMinutes*60_000;
     if(busy.some(x=>start<x.end+buffer&&end>x.start-buffer)||occupied.some(x=>start<x.end+buffer&&end>x.start-buffer))continue;
     chosen=candidate;break;
    }
    if(chosen)break;
   }
  }
  if(!chosen)throw Error(`Non trovo uno spazio libero per «${s.title}» nella settimana di ${target}. Modifica i tuoi impegni o le preferenze del piano: non ho creato allenamenti sovrapposti.`);
  usedDates.add(chosen.date);occupied.push(sessionWindow(chosen));out.push(chosen);
  if(chosen.date!==target||chosen.time!==preferred)rescheduled++;
 }
 return {sessions:out.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),rescheduled};
}
