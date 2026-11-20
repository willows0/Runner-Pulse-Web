// Spostamenti espliciti richiesti al Coach: selezione deterministica della seduta.
// In caso di ambiguità NON modifica il piano; chiede giorno/data precisi.
const WEEKDAYS=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’]/g,"'");
const pad=n=>String(n).padStart(2,'0');
const toISO=(day,month,year)=>{
 const d=new Date(Date.UTC(year,month-1,day,12));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?`${year}-${pad(month)}-${pad(day)}`:null;
};
function findDate(segment,baseYear){
 const iso=segment.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
 if(iso)return toISO(Number(iso[3]),Number(iso[2]),Number(iso[1]));
 const digit=segment.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/);
 if(digit){let y=digit[3]?Number(digit[3]):baseYear;if(y<100)y+=2000;return toISO(Number(digit[1]),Number(digit[2]),y);}
 for(let m=0;m<MONTHS.length;m++){
  const match=segment.match(new RegExp('\\b(\\d{1,2})\\s+'+MONTHS[m]+'(?:\\s+(20\\d{2}))?\\b'));
  if(match)return toISO(Number(match[1]),m+1,match[2]?Number(match[2]):baseYear);
 }
 return null;
}
function relativeDate(segment,today){
 if(!today)return null;
 const match=segment.match(/\b(dopodomani|domani|oggi)\b/);
 if(!match)return null;
 const delta=match[1]==='dopodomani'?2:match[1]==='domani'?1:0;
 const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+delta);
 return date.toISOString().slice(0,10);
}
function findWeekday(segment){return WEEKDAYS.findIndex(d=>new RegExp('\\b'+d+'\\b').test(segment));}
function weekdayOf(date){return new Date(date+'T12:00:00Z').getUTCDay();}
function weekdaySameWeek(date,weekday){
 const d=new Date(date+'T12:00:00Z');
 const monOffset=(d.getUTCDay()+6)%7;
 d.setUTCDate(d.getUTCDate()-monOffset+(weekday+6)%7);
 return d.toISOString().slice(0,10);
}
function timeOf(segment){
 const m=segment.match(/\b(?:alle|ore|alle\s+ore|verso\s+le)\s*(\d{1,2})(?:[:.,](\d{2}))?\b/);
 if(!m)return null;
 const h=Number(m[1]),min=Number(m[2]||0);
 return h<24&&min<60?`${pad(h)}:${pad(min)}`:null;
}
export function tryDirectPlanMove(message,sessions,{today=null}={}){
 const input=norm(message).trim();
 if(!/\b(spost\w*|posticip\w*|anticip\w*|cambia\w*|modifica\w*)\b/.test(input))return null;
 if(!Array.isArray(sessions)||!sessions.length)return null;
 // Senza una destinazione precisa, la richiesta è gestita dal Coach generativo.
 const separator=input.search(/\s+(?:a|al|alla|per)\s+(?=(?:oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|\d{1,2}[\/.]|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)|20\d{2}-|(?:le\s+)?\d{1,2}[:.]))/);
 let source=input, dest='';
 if(separator>=0){source=input.slice(0,separator);dest=input.slice(separator).replace(/^\s+(?:a|al|alla|per)\s+/,'');}
 else{
  // Comando solo orario: "sposta il lungo del 29 novembre alle 10".
  const timeStart=input.search(/\b(?:alle|ore)\s*\d{1,2}(?:[:.,]\d{2})?\b/);
  if(timeStart>=0){source=input.slice(0,timeStart);dest=input.slice(timeStart);}
 }
 if(!dest)return null;
 const sourceYear=Number(sessions[0].date.slice(0,4));
 const sourceDate=findDate(source,sourceYear)||relativeDate(source,today),sourceDay=findWeekday(source);
 const choices=sessions.map((s,i)=>({s,i})).filter(({s})=>{
  if(sourceDate&&s.date!==sourceDate)return false;
  if(sourceDay>=0&&weekdayOf(s.date)!==sourceDay)return false;
  const names=[['lungo',/\blungo\b/],['ripetute',/\bripetut/],['facile',/\bfacile\b/],['ritmo',/\britmo\b/],['gara',/\bgara\b/]];
  for(const [name,pat] of names)if(pat.test(source)&&!pat.test(norm(s.title)))return false;
  return true;
 });
 if(choices.length!==1){
  return {handled:true,clarification:choices.length===0?'Non ho trovato la seduta indicata nel tuo Piano. Dimmi il titolo e la data esatta.':'Ci sono più sedute che corrispondono. Dimmi la data precisa dell’allenamento da spostare.'};
 }
 const {s,i}=choices[0],targetDay=findWeekday(dest);
 const date=findDate(dest,Number(s.date.slice(0,4)))||relativeDate(dest,today)||(targetDay>=0?weekdaySameWeek(s.date,targetDay):s.date);
 const time=timeOf(dest)||s.time;
 if(!date||!time)return {handled:true,clarification:'Dimmi la data e l’ora del nuovo allenamento.'};
 if(today&&date<today)return {handled:true,clarification:'Non posso spostare la seduta a una data già passata. Scegli una data futura.'};
 if(date===s.date&&time===s.time)return {handled:true,clarification:'La seduta risulta già a quel giorno e orario. Indica una destinazione diversa.'};
 const updated=sessions.map((old,j)=>j===i?{...old,date,time}:old);
 return {handled:true,sessions:updated,changedIndices:[i],summary:`Propongo di spostare “${s.title}” dal ${s.date} alle ${s.time} al ${date} alle ${time}. Le altre sedute restano invariate.`};
}
