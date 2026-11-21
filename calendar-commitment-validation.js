// Validazione impegni Calendar: la durata dichiarata puo sostituire l'ora di fine.
// Nessuna durata viene inventata se il messaggio non la contiene.
const fail=(message)=>Object.assign(new Error(message),{status:400});
const fit=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const cleanCategory=value=>{const v=fit(value,16).toLowerCase();return ['work','sport','race','school','health','expense','food','other'].includes(v)?v:'other';};
export function dateValid(s){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function timeValid(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
export function validDuration(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 return Number.isInteger(n)&&n>=1&&n<=720?n:null;
}
// Riconosce durate esplicite, ad es. "durata 90 minuti", "per 1 ora e mezza", "di 45 min".
// Serve come sicurezza se il modello AI non restituisce durationMinutes.
export function durationFromText(text){
 const s=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/\s+/g,' ');
 const prefix='(?:durata|dura|durera|durevole|per|di|da)\\s+(?:circa\\s+)?';
 const hrs=new RegExp('\\b'+prefix+'(?:(\\d{1,2})|un|una)\\s*(?:ore|ora|h)(?:\\s*e\\s*(mezza|mezzo|\\d{1,2}\\s*(?:minuti|min)?))?\\b');
 const hm=new RegExp('\\b'+prefix+'(\\d{1,2})\\s*h\\s*(\\d{1,2})\\s*(?:m|min|$)');
 const mins=new RegExp('\\b'+prefix+'(\\d{1,3})\\s*(?:minuti|minuto|min)\\b');
 let m=hm.exec(s);
 if(m)return validDuration(Number(m[1])*60+Number(m[2]));
 m=hrs.exec(s);
 if(m){const extra=/mezz/.test(m[2]||'')?30:Number((m[2]||'').match(/\d+/)?.[0]||0);return validDuration(Number(m[1]||1)*60+extra);}
 m=mins.exec(s);
 return m?validDuration(m[1]):null;
}
export function computeEnd(date,startTime,durationMinutes){
 const duration=validDuration(durationMinutes);
 if(!dateValid(date)||!timeValid(startTime)||duration===null)return null;
 const [hour,minute]=startTime.split(':').map(Number);
 const startOfDay=Date.parse(date+'T00:00:00Z');
 const endMinutes=hour*60+minute+duration;
 const days=Math.floor(endMinutes/1440);
 const endDate=new Date(startOfDay+days*86400000).toISOString().slice(0,10);
 const m=endMinutes%1440;
 return {endDate,endTime:String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
}
export function validateCommitment(input,{today=null}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Dati dell’impegno mancanti.');
 const title=fit(input.title,120),description=fit(input.description,1000),date=fit(input.date,10);
 const allDay=input.allDay===true;
 const startTime=fit(input.startTime,5);
 const requestId=fit(input.requestId,100),category=cleanCategory(input.category);
 const durationWasGiven=input.durationMinutes!==null&&input.durationMinutes!==undefined&&input.durationMinutes!=='';
 const durationMinutes=validDuration(input.durationMinutes);
 if(title.length<2)throw fail('Scrivi un titolo per l’impegno.');
 if(!dateValid(date))throw fail('Scegli una data valida.');
 if(today&&date<today)throw fail('Non è possibile creare un nuovo impegno nel passato.');
 if(durationWasGiven&&durationMinutes===null)throw fail('La durata deve essere compresa tra 1 e 720 minuti.');
 let endTime=fit(input.endTime,5),endDate=date;
 if(!allDay){
  if(!timeValid(startTime))throw fail('Inserisci un orario di inizio valido.');
  if(durationMinutes!==null){
   const computed=computeEnd(date,startTime,durationMinutes);
   endTime=computed.endTime;endDate=computed.endDate;
  }else{
   if(!timeValid(endTime))throw fail('Indica l’ora di fine oppure la durata dell’impegno.');
   const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
   if(toMin(endTime)<=toMin(startTime)||toMin(endTime)-toMin(startTime)>720)throw fail('L’orario di fine deve essere successivo all’inizio, entro 12 ore.');
  }
 }
 if(requestId&&!/^[a-zA-Z0-9-]{12,100}$/.test(requestId))throw fail('Identificativo richiesta non valido.');
 return {title,date,startTime:allDay?'':startTime,endTime:allDay?'':endTime,endDate,allDay,description,requestId,category,durationMinutes:allDay?null:durationMinutes};
}
export function safeProposal(input){
 const obj=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const title=fit(obj.title,120),description=fit(obj.description,1000),date=fit(obj.date,10);
 const allDay=obj.allDay===true;
 const startTime=timeValid(obj.startTime)?obj.startTime:'';
 const durationMinutes=validDuration(obj.durationMinutes);
 const endTime=timeValid(obj.endTime)?obj.endTime:'';
 const computed=!allDay&&durationMinutes!==null?computeEnd(date,startTime,durationMinutes):null;
 return {title,date:dateValid(date)?date:'',allDay,description,startTime,
   endTime:computed?.endTime||endTime,endDate:computed?.endDate||date,durationMinutes,category:cleanCategory(obj.category)};
}
