// Validazioni rigorose per eventi personali Google Calendar.
// Non dedurre date, ore o durata mancanti dai dati degli allenamenti.
const fail=(message)=>Object.assign(new Error(message),{status:400});
const fit=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const cleanCategory=value=>{const v=fit(value,16).toLowerCase();return v==='work'||v==='sport'||v==='other'?v:'other';};
export function dateValid(s){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function timeValid(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);}
export function validateCommitment(input,{today=null}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Dati dell’impegno mancanti.');
 const title=fit(input.title,120),description=fit(input.description,1000),date=fit(input.date,10);
 const allDay=input.allDay===true;
 const startTime=fit(input.startTime,5),endTime=fit(input.endTime,5);
 const requestId=fit(input.requestId,100),category=cleanCategory(input.category);
 if(title.length<2)throw fail('Scrivi un titolo per l’impegno.');
 if(!dateValid(date))throw fail('Scegli una data valida.');
 if(today&&date<today)throw fail('Non è possibile creare un nuovo impegno nel passato.');
 if(!allDay){
  if(!timeValid(startTime)||!timeValid(endTime))throw fail('Inserisci orario di inizio e fine valido.');
  const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
  if(toMin(endTime)<=toMin(startTime)||toMin(endTime)-toMin(startTime)>12*60)throw fail('L’orario di fine deve essere successivo all’inizio, entro 12 ore.');
 }
 if(requestId&&!/^[a-zA-Z0-9-]{12,100}$/.test(requestId))throw fail('Identificativo richiesta non valido.');
 return {title,date,startTime:allDay?'':startTime,endTime:allDay?'':endTime,allDay,description,requestId,category};
}
export function safeProposal(input){
 const obj=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const title=fit(obj.title,120),description=fit(obj.description,1000),date=fit(obj.date,10);
 const allDay=obj.allDay===true;
 let startTime=fit(obj.startTime,5),endTime=fit(obj.endTime,5);
 const category=cleanCategory(obj.category);
 if(!timeValid(startTime))startTime='';if(!timeValid(endTime))endTime='';
 return {title,date:dateValid(date)?date:'',allDay,description,startTime,endTime,category};
}
