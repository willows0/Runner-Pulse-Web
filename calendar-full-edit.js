// Modifica di un evento Calendar esistente: validazione e PATCH atomica.
// Non creare eventi sostitutivi e non intervenire sui marker di Piano/Coach.
import {validateCalendarEdit} from './calendar-edit-validation.js';
import {validCalendarDate,dayDelta,addCalendarDays} from './calendar-date-change.js';

const fail=(message)=>Object.assign(new Error(message),{status:400});
const timeValid=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const wallValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&validCalendarDate(value.slice(0,10))&&timeValid(value.slice(11));

export function validateCalendarFullEdit(input){
 const {eventId,calendarId,category,description}=validateCalendarEdit(input);
 if(typeof input.title!=='string'||input.title.trim().length<2||input.title.length>120)throw fail('Inserisci un titolo valido (massimo 120 caratteri).');
 if(!validCalendarDate(input.date))throw fail('Scegli una data valida.');
 if(typeof input.allDay!=='boolean')throw fail('Specifica se l’impegno dura tutto il giorno.');
 if(!wallValid(input.originalStart)||!wallValid(input.originalEnd))throw fail('I dati dell’evento non sono aggiornati: riapri il calendario.');
 const startTime=input.allDay?'':input.startTime;
 const endTime=input.allDay?'':input.endTime;
 if(!input.allDay&&(!timeValid(startTime)||!timeValid(endTime)))throw fail('Inserisci orario di inizio e fine validi.');
 return {eventId,calendarId,title:input.title.trim(),category,description,date:input.date,allDay:input.allDay,
  startTime,endTime,originalStart:input.originalStart,originalEnd:input.originalEnd};
}

export function buildCalendarFullEditPatch(original,edit,romeWall){
 if(!original?.start||!original?.end)throw Object.assign(new Error('Evento senza date complete. Ricarica il calendario.'),{status:409});
 const originalAllDay=Boolean(original.start.date);
 const oldStart=originalAllDay?String(original.start.date)+'T00:00':romeWall(original.start.dateTime);
 const oldEnd=originalAllDay?String(original.end.date)+'T00:00':romeWall(original.end.dateTime);
 if(edit.originalStart!==oldStart||edit.originalEnd!==oldEnd)
  throw Object.assign(new Error('L’impegno è stato modificato: aggiorna il calendario e riprova.'),{status:409});
 let newStart,newEnd,start,end;
 if(edit.allDay){
  let durationDays=1;
  if(originalAllDay)durationDays=dayDelta(original.start.date,original.end.date);
  if(durationDays<1||durationDays>42)throw Object.assign(new Error('Durata non supportata per un impegno di tutto il giorno.'),{status:409});
  const endDay=addCalendarDays(edit.date,durationDays);
  start={date:edit.date};end={date:endDay};newStart=edit.date+'T00:00';newEnd=endDay+'T00:00';
 }else{
  const sourceStartDate=oldStart.slice(0,10),sourceEndDate=oldEnd.slice(0,10);
  const originalOffset=originalAllDay?0:dayDelta(sourceStartDate,sourceEndDate);
  const editedTimes=originalAllDay||edit.startTime!==oldStart.slice(11,16)||edit.endTime!==oldEnd.slice(11,16);
  // Cambiando gli orari, un evento normale termina in giornata o il giorno seguente.
  // Le sedute a cavallo della mezzanotte non diventano erroneamente di 25 ore.
  let endDayOffset=originalOffset>1?originalOffset:(editedTimes?(edit.endTime<=edit.startTime?1:0):originalOffset);
  if(endDayOffset===0&&edit.endTime<=edit.startTime)endDayOffset=1;
  const endDate=addCalendarDays(edit.date,endDayOffset);
  newStart=edit.date+'T'+edit.startTime;
  newEnd=endDate+'T'+edit.endTime;
  const minutes=(Date.parse(newEnd+':00Z')-Date.parse(newStart+':00Z'))/60000;
  if(!Number.isFinite(minutes)||minutes<=0||minutes>42*1440)throw fail('L’orario finale deve essere successivo all’inizio.');
  start={dateTime:newStart+':00',timeZone:'Europe/Rome'};
  end={dateTime:newEnd+':00',timeZone:'Europe/Rome'};
 }
 const changeTime=originalAllDay!==edit.allDay||newStart!==oldStart||newEnd!==oldEnd;
 const patch={summary:edit.title,description:edit.description,
  extendedProperties:{private:{...(original.extendedProperties?.private||{}),category:edit.category,rpCategoryEdited:'1'}}};
 if(changeTime){patch.start=start;patch.end=end;}
 return {patch,changeTime,newStart,newEnd,oldStart,oldEnd};
}
