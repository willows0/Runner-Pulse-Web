// Normalizzazione dei piani: nessun allenamento sintetico e nessun campo client privilegiato.
export function normalizePlan(raw){
 if(!Array.isArray(raw)||raw.length<1||raw.length>80)throw new Error('Il piano deve contenere da 1 a 80 sedute.');
 return raw.map((s,i)=>{
  if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('Seduta '+(i+1)+' non valida.');
  const date=String(s.date||''),time=String(s.time||'18:00'),title=String(s.title||'').trim(),details=String(s.details||'').trim(),minutes=Number(s.minutes);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Data non valida nella seduta '+(i+1));
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Orario non valido nella seduta '+(i+1));
  if(title.length<2||title.length>100||details.length>1000)throw Error('Titolo o dettagli non validi nella seduta '+(i+1));
  if(!Number.isFinite(minutes)||minutes<10||minutes>300||!Number.isInteger(minutes))throw Error('Durata non valida nella seduta '+(i+1));
  return {date,time,title,details,minutes};
 });
}
export function planRef(db,uid){return db.collection('users').doc(uid).collection('trainingPlans').doc('current');}
export function revisionOf(snap){return snap.exists&&Number.isSafeInteger(snap.data()?.revision)?snap.data().revision:0;}
