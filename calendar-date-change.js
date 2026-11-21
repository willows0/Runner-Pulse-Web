// Cambio della sola data: conserva ora locale, durata in giorni ed eventuali eventi a cavallo di mezzanotte.
export function validCalendarDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function dayDelta(from,to){
 if(!validCalendarDate(from)||!validCalendarDate(to))throw Object.assign(Error('Data non valida.'),{status:400});
 return Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
}
export function addCalendarDays(day,delta){
 if(!validCalendarDate(day)||!Number.isInteger(delta))throw Object.assign(Error('Data non valida.'),{status:400});
 const result=new Date(Date.parse(day+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10);
 if(!validCalendarDate(result))throw Object.assign(Error('Data non valida.'),{status:400});
 return result;
}
export function validateDateChange(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(Error('Dati non validi.'),{status:400});
 const {eventId,calendarId,newDate,originalStart,originalEnd}=input;
 for(const [name,value] of [['evento',eventId],['calendario',calendarId]]){
  if(typeof value!=='string'||!value||value.length>1024||/[\x00-\x1f]/.test(value))throw Object.assign(Error('Identificativo '+name+' non valido.'),{status:400});
 }
 if(!validCalendarDate(newDate))throw Object.assign(Error('Scegli una data valida.'),{status:400});
 if(typeof originalStart!=='string'||typeof originalEnd!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(originalStart)||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(originalEnd)||
    !validCalendarDate(originalStart.slice(0,10))||!validCalendarDate(originalEnd.slice(0,10)))
  throw Object.assign(Error('Ricarica l’impegno prima di modificarlo.'),{status:400});
 return {eventId,calendarId,newDate,originalStart,originalEnd};
}
export function shiftedCalendarEvent(original,newDate,romeWall){
 if(!validCalendarDate(newDate))throw Object.assign(Error('Scegli una data valida.'),{status:400});
 if(original?.start?.date){
  const start=original.start.date,end=original.end?.date;
  if(!validCalendarDate(start)||!validCalendarDate(end))throw Object.assign(Error('Evento senza data completa.'),{status:409});
  const durationDays=dayDelta(start,end);
  if(durationDays<=0||durationDays>42)throw Object.assign(Error('Evento di durata non supportata.'),{status:409});
  const endDay=addCalendarDays(newDate,durationDays);
  return {originalStart:start+'T00:00',originalEnd:end+'T00:00',newStart:newDate+'T00:00',newEnd:endDay+'T00:00',patch:{start:{date:newDate},end:{date:endDay}},durationDays};
 }
 if(!original?.start?.dateTime||!original?.end?.dateTime)throw Object.assign(Error('Evento senza orario valido.'),{status:409});
 const sourceStart=romeWall(original.start.dateTime),sourceEnd=romeWall(original.end.dateTime);
 const duration= (Date.parse(original.end.dateTime)-Date.parse(original.start.dateTime))/60000;
 if(!Number.isFinite(duration)||duration<=0||duration>42*1440)throw Object.assign(Error('Durata dell’evento non valida.'),{status:409});
 const delta=dayDelta(sourceStart.slice(0,10),newDate);
 const targetEndDate=addCalendarDays(sourceEnd.slice(0,10),delta);
 const newStart=newDate+sourceStart.slice(10),newEnd=targetEndDate+sourceEnd.slice(10);
 return {originalStart:sourceStart,originalEnd:sourceEnd,newStart,newEnd,durationMinutes:duration,
  patch:{start:{dateTime:newStart+':00',timeZone:'Europe/Rome'},end:{dateTime:newEnd+':00',timeZone:'Europe/Rome'}}};
}
